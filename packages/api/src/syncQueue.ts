/**
 * What to push, what to pull, and what to remember afterwards.
 *
 * PURE. Two descriptions of the world in, a plan out: no storage, no network, no
 * clock. The code that carries the plan out lives elsewhere and is deliberately
 * thin, because everything that decides whether a child's history survives is
 * decided here.
 *
 * Three things sync (profiles, the append-only attempt log, the level-completion
 * latch) and two rules govern all of them:
 *
 *   1. NOTHING IS DROPPED FROM EITHER SIDE. The log is a set of attempt ids, so
 *      reconciling two logs is a set union: whatever the server lacks is pushed,
 *      whatever the device lacks is pulled, and neither side is ever overwritten.
 *   2. A FAILURE FORGETS NOTHING. The record of what is already safe on the server
 *      (the baseline) only ever grows from confirmed successes, so a failed or
 *      half-finished sync leaves exactly the same work to do next time.
 */

export interface SyncedProfile {
  id: string;
  name: string;
  avatarId: string;
  createdAt: number;
  lastPlayedOn: string | null;
}

/** Level number to epoch ms of the first completion. */
export type CompletionMap = Record<number, number>;

/** One side's view of the world. Ids only: the plan never needs an attempt's contents. */
export interface LocalState {
  profiles: SyncedProfile[];
  /** Attempt ids by profile id. */
  attemptIds: Record<string, string[]>;
  completions: Record<string, CompletionMap>;
}
export type RemoteState = LocalState;

/**
 * What both ends are known to hold, as of the last sync that confirmed it.
 *
 * A profile on the server and not on the device is either NEW (made on another
 * device) or DELETED here, and the two look identical until you remember whether
 * it was ever shared. This is that memory. It is per parent account: a different
 * parent signing in must not have their profiles read as "deleted".
 */
export interface SyncBaseline {
  userId: string | null;
  /** Profile id to the attempt ids confirmed to be on the server. */
  profiles: Record<string, string[]>;
}

export interface CompletionRow {
  profileId: string;
  level: number;
  completedAt: number;
}

export interface SyncPlan {
  /** Profiles to create on the server. */
  pushProfiles: SyncedProfile[];
  /** Profiles to create on this device. */
  pullProfiles: SyncedProfile[];
  deleteRemote: string[];
  deleteLocal: string[];
  pushAttempts: Record<string, string[]>;
  pullAttempts: Record<string, string[]>;
  pushCompletions: CompletionRow[];
  /** Completions this device should latch, keeping the earlier time if it already has one. */
  pullCompletions: CompletionRow[];
}

/** What a carried-out plan actually achieved. Only confirmed successes belong here. */
export interface SyncOutcome {
  pushedProfiles: string[];
  deletedRemote: string[];
  deletedLocal: string[];
  /** Profiles pulled from the server that now exist on this device. */
  adoptedProfiles: string[];
  pushedAttempts: Record<string, string[]>;
}

export function emptyBaseline(userId: string | null): SyncBaseline {
  return { userId, profiles: {} };
}

/**
 * The baseline to plan with. One recorded for a different account is worthless
 * and dangerous: every profile of the new account would look as if it had been
 * shared and then deleted. Start from nothing instead, which can only ever
 * cause a profile to be pushed or pulled, never removed.
 */
export function baselineFor(stored: SyncBaseline | null, userId: string): SyncBaseline {
  return stored !== null && stored.userId === userId ? stored : emptyBaseline(userId);
}

const unique = (ids: readonly string[]): string[] => [...new Set(ids)];

function without(ids: readonly string[], known: ReadonlySet<string>): string[] {
  return unique(ids).filter((id) => !known.has(id));
}

function nonEmpty<T>(entries: Record<string, T[]>): Record<string, T[]> {
  return Object.fromEntries(Object.entries(entries).filter(([, v]) => v.length > 0));
}

export function planSync(local: LocalState, remote: RemoteState, baseline: SyncBaseline): SyncPlan {
  const plan: SyncPlan = {
    pushProfiles: [],
    pullProfiles: [],
    deleteRemote: [],
    deleteLocal: [],
    pushAttempts: {},
    pullAttempts: {},
    pushCompletions: [],
    pullCompletions: [],
  };

  const localById = new Map(local.profiles.map((p) => [p.id, p]));
  const remoteById = new Map(remote.profiles.map((p) => [p.id, p]));
  const localIds = (id: string): string[] => unique(local.attemptIds[id] ?? []);
  const remoteIds = (id: string): string[] => unique(remote.attemptIds[id] ?? []);

  const completionsOf = (state: LocalState, id: string): CompletionMap => state.completions[id] ?? {};
  const rows = (profileId: string, map: CompletionMap): CompletionRow[] =>
    Object.entries(map)
      .map(([level, completedAt]) => ({ profileId, level: Number(level), completedAt }))
      .sort((a, b) => a.level - b.level);

  for (const profile of local.profiles) {
    const id = profile.id;
    const theirs = remoteById.get(id);

    if (theirs) {
      // On both sides: reconcile the contents.
      const have = new Set(remoteIds(id));
      const here = new Set(localIds(id));
      const push = without(localIds(id), have);
      const pull = without(remoteIds(id), here);
      if (push.length > 0) plan.pushAttempts[id] = push;
      if (pull.length > 0) plan.pullAttempts[id] = pull;
      reconcileCompletions(plan, id, completionsOf(local, id), completionsOf(remote, id));
      continue;
    }

    const wasShared = Object.prototype.hasOwnProperty.call(baseline.profiles, id);
    if (wasShared) {
      // It reached the server once and is gone. Someone deleted it there.
      const safeOnServer = new Set(baseline.profiles[id]);
      const unseen = without(localIds(id), safeOnServer);
      if (unseen.length === 0) {
        plan.deleteLocal.push(id);
        continue;
      }
      // But this device holds play the server never saw, and removing the child
      // here would destroy the only copy. Keep the work: put the child back.
    }

    plan.pushProfiles.push(profile);
    const all = localIds(id);
    if (all.length > 0) plan.pushAttempts[id] = all;
    plan.pushCompletions.push(...rows(id, completionsOf(local, id)));
  }

  for (const profile of remote.profiles) {
    const id = profile.id;
    if (localById.has(id)) continue;

    if (Object.prototype.hasOwnProperty.call(baseline.profiles, id)) {
      // Shared before, gone from this device: deleted here.
      plan.deleteRemote.push(id);
      continue;
    }

    plan.pullProfiles.push(profile);
    const all = remoteIds(id);
    if (all.length > 0) plan.pullAttempts[id] = all;
    plan.pullCompletions.push(...rows(id, completionsOf(remote, id)));
  }

  return plan;
}

/**
 * A level completion is a latch and keeps the earliest time anywhere.
 *
 * The server's table has no update policy, on purpose (a latch that can be
 * lowered is not a latch), so it keeps whichever time reached it first and
 * cannot be moved earlier. That is why an earlier time on this device is simply
 * kept here rather than pushed, and an earlier time on the server is adopted
 * here. Neither side ever moves later.
 */
function reconcileCompletions(plan: SyncPlan, profileId: string, mine: CompletionMap, theirs: CompletionMap): void {
  const levels = new Set([...Object.keys(mine), ...Object.keys(theirs)].map(Number));
  for (const level of [...levels].sort((a, b) => a - b)) {
    const here = mine[level];
    const there = theirs[level];
    if (here !== undefined && there === undefined) {
      plan.pushCompletions.push({ profileId, level, completedAt: here });
    } else if (here === undefined && there !== undefined) {
      plan.pullCompletions.push({ profileId, level, completedAt: there });
    } else if (here !== undefined && there !== undefined && there < here) {
      plan.pullCompletions.push({ profileId, level, completedAt: there });
    }
  }
}

export function isEmptyPlan(plan: SyncPlan): boolean {
  return (
    plan.pushProfiles.length === 0 &&
    plan.pullProfiles.length === 0 &&
    plan.deleteRemote.length === 0 &&
    plan.deleteLocal.length === 0 &&
    Object.keys(nonEmpty(plan.pushAttempts)).length === 0 &&
    Object.keys(nonEmpty(plan.pullAttempts)).length === 0 &&
    plan.pushCompletions.length === 0 &&
    plan.pullCompletions.length === 0
  );
}

/**
 * Attempts on this device that are not yet known to be safe on the server, by
 * profile. This is the set a failure must leave untouched.
 */
export function pendingAttempts(local: LocalState, baseline: SyncBaseline): Record<string, string[]> {
  const pending: Record<string, string[]> = {};
  for (const profile of local.profiles) {
    const safe = new Set(baseline.profiles[profile.id] ?? []);
    const ids = without(local.attemptIds[profile.id] ?? [], safe);
    if (ids.length > 0) pending[profile.id] = ids;
  }
  return pending;
}

/**
 * The baseline after a sync attempt.
 *
 * It records a profile only when BOTH ends hold it, and an attempt only when the
 * server holds it, and it learns of each only from a confirmed success. That is
 * the whole of "a failed sync loses nothing":
 *
 *  - A profile whose push failed is not recorded. Had it been, the next sync
 *    would see a profile that was "shared" and is missing from the server, read
 *    that as a deletion elsewhere, and remove the child from this device.
 *  - A profile pulled from the server is not recorded until it exists here.
 *    Otherwise the next sync would read it as deleted on this device and delete
 *    the server's copy.
 *  - A deletion that did not go through keeps its old entry, so it is retried.
 *  - Attempts whose push failed stay out, so they are still pending.
 */
export function settleBaseline(
  previous: SyncBaseline,
  userId: string,
  local: LocalState,
  remote: RemoteState,
  plan: SyncPlan,
  outcome: SyncOutcome,
): SyncBaseline {
  const before = previous.userId === userId ? previous.profiles : {};

  const existsHere = new Set([...local.profiles.map((p) => p.id), ...outcome.adoptedProfiles]);
  const deletedRemote = new Set(outcome.deletedRemote);

  // What the server holds once this sync is done.
  const server = new Map<string, Set<string>>();
  for (const profile of remote.profiles) {
    if (deletedRemote.has(profile.id)) continue;
    server.set(profile.id, new Set(remote.attemptIds[profile.id] ?? []));
  }
  for (const id of outcome.pushedProfiles) {
    if (!server.has(id)) server.set(id, new Set());
  }
  for (const [id, ids] of Object.entries(outcome.pushedAttempts)) {
    const held = server.get(id);
    if (held) for (const attemptId of ids) held.add(attemptId);
  }

  const profiles: Record<string, string[]> = {};
  for (const [id, ids] of server) {
    if (existsHere.has(id)) profiles[id] = [...ids].sort();
  }

  // A deletion that was asked for and not confirmed is still owed.
  for (const id of plan.deleteRemote) {
    if (!deletedRemote.has(id) && before[id] !== undefined) profiles[id] = before[id];
  }
  const deletedLocal = new Set(outcome.deletedLocal);
  for (const id of plan.deleteLocal) {
    if (!deletedLocal.has(id) && before[id] !== undefined) profiles[id] = before[id];
  }

  return { userId, profiles };
}
