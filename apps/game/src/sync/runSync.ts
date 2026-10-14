import {
  RemoteError,
  baselineFor,
  isEmptyPlan,
  planSync,
  rebuildFrom,
  remoteProfileId,
  settleBaseline,
  stampIds,
} from '@soundlings/api';
import type {
  IdentifiedAttempt,
  LocalState,
  RemoteStore,
  SyncOutcome,
  SyncedProfile,
} from '@soundlings/api';
import type { ConfusionMap, EngineConfig } from '@soundlings/engine';
import type { ProgressRepo } from '../data/ProgressRepo';
import { deleteProfile } from '../profiles/deleteProfile';
import type { Profile } from '../profiles/Profile';
import type { ProfileRepo } from '../profiles/ProfileRepo';
import type { SyncStateStore } from './SyncStateStore';

export interface SyncDeps {
  userId: string;
  remote: RemoteStore;
  profiles: ProfileRepo;
  /** The device's own store, not the wrapper: the sync must not trigger itself. */
  progress: ProgressRepo;
  store: SyncStateStore;
  config: EngineConfig;
  /** True while a quest is being played. Derived state is then left until it ends. */
  questInProgress: () => boolean;
}

export interface SyncReport {
  /** Everything that needed doing was done. False means some was left for next time; nothing was lost. */
  ok: boolean;
  /** The plan found nothing to do. */
  quiet: boolean;
  /** The network was the problem, as opposed to the server refusing something. */
  offline: boolean;
  attemptsPushed: number;
  attemptsPulled: number;
  profilesChanged: boolean;
  /** Local profile ids whose mastery, scores and dates still need rebuilding from the log. */
  deferredDerived: string[];
  /** Attempts the server refused outright, left on the device. */
  refused: number;
}

/** Errors worth splitting a batch over: the data, not the connection or the permissions. */
const isDataFault = (error: RemoteError): boolean =>
  error.kind === 'rejected' && (error.code === '23514' || error.code === '23502' || (error.code ?? '').startsWith('22'));

/**
 * One sync pass: read both sides, plan, carry the plan out, remember what worked.
 *
 * Thin on purpose. Every decision is planSync's and settleBaseline's; this only
 * moves data and writes down what was confirmed. Each step is allowed to fail on
 * its own and none is allowed to throw out of here, because a sync that throws
 * would be a sync that can disturb the game. The rule for every failure is the
 * same: leave the work for next time, discard nothing.
 */
export async function runSync(deps: SyncDeps, retry: { deferredDerived?: readonly string[] } = {}): Promise<SyncReport> {
  const report: SyncReport = {
    ok: true,
    quiet: false,
    offline: false,
    attemptsPushed: 0,
    attemptsPulled: 0,
    profilesChanged: false,
    deferredDerived: [],
    refused: 0,
  };
  const { userId, remote, profiles, progress, store } = deps;

  // --- 1. what this device holds ------------------------------------------------
  const localProfiles = await profiles.list();
  const remoteIdOf = new Map<string, string>(); // local id -> server id
  const localIdOf = new Map<string, string>(); // server id -> local id
  for (const p of localProfiles) {
    const id = remoteProfileId(userId, p.id);
    remoteIdOf.set(p.id, id);
    localIdOf.set(id, p.id);
  }

  const attemptsOf = new Map<string, Map<string, IdentifiedAttempt>>();
  const local: LocalState = { profiles: [], attemptIds: {}, completions: {} };
  for (const p of localProfiles) {
    const id = remoteIdOf.get(p.id) as string;
    local.profiles.push(toSynced(id, p));
    const stamped = stampIds(id, await progress.loadAttempts(p.id));
    attemptsOf.set(id, new Map(stamped.map((a) => [a.id, a])));
    local.attemptIds[id] = stamped.map((a) => a.id);
    local.completions[id] = await progress.loadCompletions(p.id);
  }

  // --- 2. what the server holds -------------------------------------------------
  let remoteState;
  try {
    remoteState = await remote.fetchState();
  } catch (error) {
    // Could not even look. Nothing was changed on either side, nothing is owed.
    return { ...report, ok: false, offline: isNetwork(error) };
  }

  // --- 3. the plan --------------------------------------------------------------
  const baseline = baselineFor(await store.load(), userId);
  const plan = planSync(local, remoteState, baseline);
  report.quiet = isEmptyPlan(plan);

  const outcome: SyncOutcome = {
    pushedProfiles: [],
    deletedRemote: [],
    deletedLocal: [],
    adoptedProfiles: [],
    pushedAttempts: {},
  };

  const fail = (error: unknown): void => {
    report.ok = false;
    if (isNetwork(error)) report.offline = true;
  };
  /** Once the connection has gone, further remote calls would only wait to fail. */
  const attempt = async (step: () => Promise<void>): Promise<void> => {
    if (report.offline) {
      report.ok = false;
      return;
    }
    try {
      await step();
    } catch (error) {
      fail(error);
    }
  };

  // --- 4a. push -----------------------------------------------------------------
  if (plan.pushProfiles.length > 0) {
    await attempt(async () => {
      await remote.insertProfiles(userId, plan.pushProfiles);
      outcome.pushedProfiles.push(...plan.pushProfiles.map((p) => p.id));
    });
  }
  const onServer = new Set([
    ...remoteState.profiles.map((p) => p.id).filter((id) => !plan.deleteRemote.includes(id)),
    ...outcome.pushedProfiles,
  ]);

  for (const [profileId, ids] of Object.entries(plan.pushAttempts)) {
    if (!onServer.has(profileId)) continue; // its profile did not get there; the attempts wait with it
    const rows = ids.flatMap((id) => attemptsOf.get(profileId)?.get(id) ?? []);
    await attempt(async () => {
      const confirmed = await pushResilient(remote, profileId, rows, report);
      if (confirmed.length > 0) outcome.pushedAttempts[profileId] = confirmed;
      report.attemptsPushed += confirmed.length;
    });
  }

  const completionsToPush = plan.pushCompletions.filter((row) => onServer.has(row.profileId));
  if (completionsToPush.length > 0) await attempt(() => remote.insertCompletions(completionsToPush));

  for (const id of plan.deleteRemote) {
    await attempt(async () => {
      await remote.deleteProfile(id);
      outcome.deletedRemote.push(id);
    });
  }

  // --- 4b. pull -----------------------------------------------------------------
  const pulledInto = new Set<string>(); // local ids that gained attempts

  for (const profile of plan.pullProfiles) {
    try {
      await profiles.adopt({
        id: profile.id,
        name: profile.name,
        avatarId: profile.avatarId,
        createdAt: profile.createdAt,
        lastPlayedOn: profile.lastPlayedOn,
      });
      outcome.adoptedProfiles.push(profile.id);
      localIdOf.set(profile.id, profile.id);
      report.profilesChanged = true;
    } catch (error) {
      fail(error);
    }
  }

  for (const [profileId, ids] of Object.entries(plan.pullAttempts)) {
    const localId = localIdOf.get(profileId);
    if (localId === undefined) continue; // the profile never arrived; its attempts wait with it
    await attempt(async () => {
      const rows = await remote.fetchAttempts(profileId, ids);
      for (const row of rows) await progress.appendAttempt(localId, row);
      if (rows.length > 0) pulledInto.add(localId);
      report.attemptsPulled += rows.length;
      if (rows.length < ids.length) report.ok = false; // some had not appeared yet; the next pass fetches them
    });
  }

  for (const row of plan.pullCompletions) {
    const localId = localIdOf.get(row.profileId);
    if (localId === undefined) continue;
    try {
      await progress.mergeCompletion(localId, row.level, row.completedAt);
    } catch (error) {
      fail(error);
    }
  }

  for (const id of plan.deleteLocal) {
    const localId = localIdOf.get(id);
    if (localId === undefined) continue;
    try {
      await deleteProfile(localId, profiles, progress);
      outcome.deletedLocal.push(id);
      report.profilesChanged = true;
    } catch (error) {
      fail(error);
    }
  }

  // --- 5. derived state ---------------------------------------------------------
  // The log is now the union of both devices'. Everything else is recomputed
  // from it, never copied. Held back while a quest is on screen: the quest keeps
  // its own copy of mastery and would write over this one.
  const rebuildFor = new Set([...pulledInto, ...(retry.deferredDerived ?? [])]);
  if (rebuildFor.size > 0) {
    const stillHere = new Set((await profiles.list()).map((p) => p.id));
    for (const localId of rebuildFor) {
      if (!stillHere.has(localId)) continue;
      if (deps.questInProgress()) {
        report.deferredDerived.push(localId);
        continue;
      }
      try {
        await applyDerived(localId, remoteIdOf.get(localId) ?? localId, deps);
        report.profilesChanged = true;
      } catch {
        report.ok = false;
        report.deferredDerived.push(localId);
      }
    }
  }

  // --- 6. remember what was confirmed -------------------------------------------
  try {
    await store.save(settleBaseline(baseline, userId, local, remoteState, plan, outcome));
  } catch {
    // Not saved: the next pass plans from the old baseline, which is safe.
  }

  return report;
}

function toSynced(id: string, p: Profile): SyncedProfile {
  return { id, name: p.name, avatarId: p.avatarId, createdAt: p.createdAt, lastPlayedOn: p.lastPlayedOn };
}

function isNetwork(error: unknown): boolean {
  return error instanceof RemoteError && error.kind === 'network';
}

/**
 * Pushes rows, and if the server refuses the batch because of the DATA in it,
 * halves it until the offending row is alone. One malformed attempt must never
 * hold up a child's whole log, so everything else still goes.
 *
 * Returns the ids the server now has. The row it refused is not among them, and
 * stays on the device untouched. A refusal for any other reason (permissions, a
 * missing profile) or a network failure is thrown to the caller as it is.
 */
async function pushResilient(
  remote: RemoteStore,
  profileId: string,
  rows: readonly IdentifiedAttempt[],
  report: SyncReport,
): Promise<string[]> {
  if (rows.length === 0) return [];
  try {
    await remote.insertAttempts(profileId, rows);
    return rows.map((r) => r.id);
  } catch (error) {
    if (!(error instanceof RemoteError) || !isDataFault(error)) throw error;
    if (rows.length === 1) {
      report.refused += 1;
      report.ok = false;
      return [];
    }
    const middle = Math.floor(rows.length / 2);
    const first = await pushResilient(remote, profileId, rows.slice(0, middle), report);
    const second = await pushResilient(remote, profileId, rows.slice(middle), report);
    return [...first, ...second];
  }
}

/** Rebuilds everything derivable for one child from their (now merged) log. */
async function applyDerived(localId: string, serverId: string, deps: SyncDeps): Promise<void> {
  const { progress, profiles, config } = deps;
  const attempts = stampIds(serverId, await progress.loadAttempts(localId));
  const rebuilt = rebuildFrom(attempts, config);

  // Mastery IS the log, folded. Replaced outright: a cache that disagrees with
  // its source is the thing this design exists to prevent.
  await progress.saveMastery(localId, rebuilt.mastery);

  // Confusions are a floor, not a copy: the live count also includes picks that
  // left no attempt behind, so the larger of the two is kept per pair.
  const existing = await progress.loadConfusions(localId);
  const merged: ConfusionMap = { ...existing };
  for (const [key, count] of Object.entries(rebuilt.confusions)) merged[key] = Math.max(merged[key] ?? 0, count);
  await progress.saveConfusions(localId, merged);

  for (const date of rebuilt.playedDates) await progress.markPlayedOn(localId, date);
  for (const score of rebuilt.highScores) await progress.saveHighScore(localId, score);

  const latest = rebuilt.playedDates[rebuilt.playedDates.length - 1];
  if (latest !== undefined) {
    const current = (await profiles.list()).find((p) => p.id === localId);
    if (current && (current.lastPlayedOn === null || current.lastPlayedOn < latest)) {
      await profiles.markPlayed(localId, latest);
    }
  }
}
