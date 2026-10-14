import { describe, expect, it } from 'vitest';
import {
  baselineFor,
  emptyBaseline,
  isEmptyPlan,
  pendingAttempts,
  planSync,
  settleBaseline,
} from './syncQueue';
import type { LocalState, RemoteState, SyncBaseline, SyncOutcome, SyncedProfile } from './syncQueue';

const USER = 'parent-1';

const profile = (id: string, over: Partial<SyncedProfile> = {}): SyncedProfile => ({
  id,
  name: id.toUpperCase(),
  avatarId: 'fox',
  createdAt: 1000,
  lastPlayedOn: null,
  ...over,
});

const state = (over: Partial<LocalState> = {}): LocalState => ({
  profiles: [],
  attemptIds: {},
  completions: {},
  ...over,
});

const baseline = (profiles: Record<string, string[]> = {}): SyncBaseline => ({ userId: USER, profiles });

const nothing: SyncOutcome = {
  pushedProfiles: [],
  deletedRemote: [],
  deletedLocal: [],
  adoptedProfiles: [],
  pushedAttempts: {},
};

describe('planSync: attempts', () => {
  it('pushes attempts the server has not seen', () => {
    const local = state({ profiles: [profile('a')], attemptIds: { a: ['1', '2', '3'] } });
    const remote = state({ profiles: [profile('a')], attemptIds: { a: ['1'] } });
    expect(planSync(local, remote, baseline({ a: ['1'] })).pushAttempts).toEqual({ a: ['2', '3'] });
  });

  it('does not re-push attempts that are already there', () => {
    const both = state({ profiles: [profile('a')], attemptIds: { a: ['1', '2'] } });
    const plan = planSync(both, both, baseline({ a: ['1', '2'] }));
    expect(plan.pushAttempts).toEqual({});
    expect(plan.pullAttempts).toEqual({});
  });

  it('pulls attempts the server has and this device does not', () => {
    const local = state({ profiles: [profile('a')], attemptIds: { a: ['1'] } });
    const remote = state({ profiles: [profile('a')], attemptIds: { a: ['1', '2', '3'] } });
    expect(planSync(local, remote, baseline({ a: ['1'] })).pullAttempts).toEqual({ a: ['2', '3'] });
  });

  it('keeps both devices\' work when each played alone: push one side, pull the other', () => {
    const local = state({ profiles: [profile('a')], attemptIds: { a: ['1', 'L1', 'L2'] } });
    const remote = state({ profiles: [profile('a')], attemptIds: { a: ['1', 'R1'] } });
    const plan = planSync(local, remote, baseline({ a: ['1'] }));
    expect(plan.pushAttempts).toEqual({ a: ['L1', 'L2'] });
    expect(plan.pullAttempts).toEqual({ a: ['R1'] });
  });

  it('leaves both ends holding the union, nothing dropped from either side', () => {
    const local = state({ profiles: [profile('a')], attemptIds: { a: ['1', '2', 'L1'] } });
    const remote = state({ profiles: [profile('a')], attemptIds: { a: ['2', '3', 'R1'] } });
    const plan = planSync(local, remote, baseline({ a: ['2'] }));
    const union = ['1', '2', '3', 'L1', 'R1'].sort();
    const afterLocal = [...new Set([...local.attemptIds.a, ...(plan.pullAttempts.a ?? [])])].sort();
    const afterRemote = [...new Set([...remote.attemptIds.a, ...(plan.pushAttempts.a ?? [])])].sort();
    expect(afterLocal).toEqual(union);
    expect(afterRemote).toEqual(union);
  });

  it('is the same however many times the same attempt id is listed', () => {
    const local = state({ profiles: [profile('a')], attemptIds: { a: ['1', '1', '2'] } });
    const remote = state({ profiles: [profile('a')], attemptIds: { a: ['2'] } });
    expect(planSync(local, remote, baseline({ a: ['2'] })).pushAttempts).toEqual({ a: ['1'] });
  });
});

describe('planSync: level completions', () => {
  const withA = (completions: Record<number, number>) => ({ profiles: [profile('a')], completions: { a: completions } });

  it('pushes a completion only this device has', () => {
    const plan = planSync(state(withA({ 1: 500 })), state(withA({})), baseline({ a: [] }));
    expect(plan.pushCompletions).toEqual([{ profileId: 'a', level: 1, completedAt: 500 }]);
    expect(plan.pullCompletions).toEqual([]);
  });

  it('pulls a completion only the server has', () => {
    const plan = planSync(state(withA({})), state(withA({ 1: 500 })), baseline({ a: [] }));
    expect(plan.pullCompletions).toEqual([{ profileId: 'a', level: 1, completedAt: 500 }]);
    expect(plan.pushCompletions).toEqual([]);
  });

  it('keeps the EARLIEST time when the server is earlier: this device takes the earlier one', () => {
    const plan = planSync(state(withA({ 1: 900 })), state(withA({ 1: 500 })), baseline({ a: [] }));
    expect(plan.pullCompletions).toEqual([{ profileId: 'a', level: 1, completedAt: 500 }]);
  });

  it('keeps the EARLIEST time when this device is earlier: the later time is never adopted', () => {
    const plan = planSync(state(withA({ 1: 500 })), state(withA({ 1: 900 })), baseline({ a: [] }));
    // The server cannot be lowered (a latch has no update), and this device must not move later.
    expect(plan.pullCompletions).toEqual([]);
    expect(plan.pushCompletions).toEqual([]);
  });

  it('does nothing when both agree', () => {
    const both = state(withA({ 1: 500 }));
    const plan = planSync(both, both, baseline({ a: [] }));
    expect(plan.pushCompletions).toEqual([]);
    expect(plan.pullCompletions).toEqual([]);
  });

  it('merges per level, each on its own', () => {
    const plan = planSync(
      state(withA({ 1: 500, 2: 800 })),
      state(withA({ 1: 400, 3: 700 })),
      baseline({ a: [] }),
    );
    expect(plan.pushCompletions).toEqual([{ profileId: 'a', level: 2, completedAt: 800 }]);
    expect(plan.pullCompletions).toEqual([
      { profileId: 'a', level: 1, completedAt: 400 },
      { profileId: 'a', level: 3, completedAt: 700 },
    ]);
  });
});

describe('planSync: profiles', () => {
  it('pushes a profile that exists only here, with all its attempts and completions', () => {
    const local = state({
      profiles: [profile('a')],
      attemptIds: { a: ['1', '2'] },
      completions: { a: { 1: 500 } },
    });
    const plan = planSync(local, state(), emptyBaseline(USER));
    expect(plan.pushProfiles.map((p) => p.id)).toEqual(['a']);
    expect(plan.pushAttempts).toEqual({ a: ['1', '2'] });
    expect(plan.pushCompletions).toEqual([{ profileId: 'a', level: 1, completedAt: 500 }]);
    expect(plan.deleteLocal).toEqual([]);
  });

  it('pulls a profile that exists only on the server, with all its attempts and completions', () => {
    const remote = state({
      profiles: [profile('b')],
      attemptIds: { b: ['x', 'y'] },
      completions: { b: { 1: 700 } },
    });
    const plan = planSync(state(), remote, emptyBaseline(USER));
    expect(plan.pullProfiles.map((p) => p.id)).toEqual(['b']);
    expect(plan.pullAttempts).toEqual({ b: ['x', 'y'] });
    expect(plan.pullCompletions).toEqual([{ profileId: 'b', level: 1, completedAt: 700 }]);
    expect(plan.deleteRemote).toEqual([]);
  });

  it('deletes remotely a profile that was synced and has since been deleted here', () => {
    const remote = state({ profiles: [profile('a')], attemptIds: { a: ['1'] } });
    const plan = planSync(state(), remote, baseline({ a: ['1'] }));
    expect(plan.deleteRemote).toEqual(['a']);
    expect(plan.pullProfiles).toEqual([]);
    expect(plan.pullAttempts).toEqual({});
  });

  it('removes locally a profile that was synced and has since been deleted on the server', () => {
    const local = state({ profiles: [profile('a')], attemptIds: { a: ['1', '2'] } });
    const plan = planSync(local, state(), baseline({ a: ['1', '2'] }));
    expect(plan.deleteLocal).toEqual(['a']);
    expect(plan.pushProfiles).toEqual([]);
    expect(plan.pushAttempts).toEqual({});
  });

  it('does NOT remove locally a profile the server lost if this device holds attempts the server never saw', () => {
    // Someone deleted the child on another device while this one had played offline.
    // Deleting here would destroy the only copy of that play.
    const local = state({ profiles: [profile('a')], attemptIds: { a: ['1', '2', 'OFFLINE'] } });
    const plan = planSync(local, state(), baseline({ a: ['1', '2'] }));
    expect(plan.deleteLocal).toEqual([]);
    expect(plan.pushProfiles.map((p) => p.id)).toEqual(['a']);
    expect(plan.pushAttempts).toEqual({ a: ['1', '2', 'OFFLINE'] });
  });

  it('does not touch a profile present on both sides', () => {
    const both = state({ profiles: [profile('a')], attemptIds: { a: ['1'] } });
    const plan = planSync(both, both, baseline({ a: ['1'] }));
    expect(plan.pushProfiles).toEqual([]);
    expect(plan.pullProfiles).toEqual([]);
    expect(plan.deleteLocal).toEqual([]);
    expect(plan.deleteRemote).toEqual([]);
  });

  it('treats everything as new when the baseline belongs to a different parent', () => {
    // Signing in as someone else must not read "not in their account" as "deleted there".
    const local = state({ profiles: [profile('a')], attemptIds: { a: ['1'] } });
    const stale: SyncBaseline = { userId: 'someone-else', profiles: { a: ['1'] } };
    const plan = planSync(local, state(), baselineFor(stale, USER));
    expect(plan.deleteLocal).toEqual([]);
    expect(plan.pushProfiles.map((p) => p.id)).toEqual(['a']);
  });

  it('treats everything as new when there is no baseline yet', () => {
    expect(baselineFor(null, USER)).toEqual(emptyBaseline(USER));
  });

  it('keeps a matching baseline as it is', () => {
    const b = baseline({ a: ['1'] });
    expect(baselineFor(b, USER)).toBe(b);
  });
});

describe('planSync: a quiet device does no work', () => {
  it('produces an empty plan when both sides agree on everything', () => {
    const both = state({
      profiles: [profile('a'), profile('b')],
      attemptIds: { a: ['1', '2'], b: ['3'] },
      completions: { a: { 1: 500 } },
    });
    const plan = planSync(both, both, baseline({ a: ['1', '2'], b: ['3'] }));
    expect(isEmptyPlan(plan)).toBe(true);
  });

  it('produces an empty plan for two empty sides', () => {
    expect(isEmptyPlan(planSync(state(), state(), emptyBaseline(USER)))).toBe(true);
  });

  it('is not empty as soon as there is anything to do', () => {
    const local = state({ profiles: [profile('a')], attemptIds: { a: ['1'] } });
    const remote = state({ profiles: [profile('a')], attemptIds: { a: [] } });
    expect(isEmptyPlan(planSync(local, remote, baseline({ a: [] })))).toBe(false);
  });
});

describe('a failed sync loses nothing', () => {
  const local = state({
    profiles: [profile('a'), profile('new')],
    attemptIds: { a: ['1', 'P1', 'P2'], new: ['N1'] },
  });
  const remote = state({ profiles: [profile('a')], attemptIds: { a: ['1'] } });
  const before = baseline({ a: ['1'] });

  it('leaves the pending set exactly as it was when every push fails', () => {
    const plan = planSync(local, remote, before);
    const after = settleBaseline(before, USER, local, remote, plan, nothing);
    expect(pendingAttempts(local, after)).toEqual(pendingAttempts(local, before));
    expect(pendingAttempts(local, after)).toEqual({ a: ['P1', 'P2'], new: ['N1'] });
  });

  it('plans the same work again next time, so nothing is forgotten', () => {
    const plan = planSync(local, remote, before);
    const after = settleBaseline(before, USER, local, remote, plan, nothing);
    expect(planSync(local, remote, after)).toEqual(plan);
  });

  it('does not mark a profile synced when its push failed, or the next sync would delete it', () => {
    const plan = planSync(local, remote, before);
    const after = settleBaseline(before, USER, local, remote, plan, nothing);
    expect(Object.keys(after.profiles)).not.toContain('new');
    // Had it been recorded, a profile on this device and not on the server would
    // read as "deleted on the server" and be removed from the device.
    expect(planSync(local, remote, after).deleteLocal).toEqual([]);
  });

  it('removes from the pending set only what was confirmed, when a push half-works', () => {
    const plan = planSync(local, remote, before);
    const after = settleBaseline(before, USER, local, remote, plan, {
      ...nothing,
      pushedProfiles: ['new'],
      pushedAttempts: { a: ['P1'], new: ['N1'] },
    });
    expect(pendingAttempts(local, after)).toEqual({ a: ['P2'] });
  });

  it('empties the pending set once everything was confirmed', () => {
    const plan = planSync(local, remote, before);
    const after = settleBaseline(before, USER, local, remote, plan, {
      ...nothing,
      pushedProfiles: ['new'],
      pushedAttempts: { a: ['P1', 'P2'], new: ['N1'] },
    });
    expect(pendingAttempts(local, after)).toEqual({});
    const settled = state({
      profiles: local.profiles,
      attemptIds: { a: ['1', 'P1', 'P2'], new: ['N1'] },
    });
    expect(isEmptyPlan(planSync(settled, settled, after))).toBe(true);
  });

  it('does not record a pulled profile as synced until it really exists here', () => {
    const remoteOnly = state({ profiles: [profile('b')], attemptIds: { b: ['x'] } });
    const plan = planSync(state(), remoteOnly, emptyBaseline(USER));
    // The pull failed: the profile never reached this device.
    const failed = settleBaseline(emptyBaseline(USER), USER, state(), remoteOnly, plan, nothing);
    expect(Object.keys(failed.profiles)).not.toContain('b');
    // Recorded, the next sync would read "on the server, not here, was synced" as a local delete and wipe the server copy.
    expect(planSync(state(), remoteOnly, failed).deleteRemote).toEqual([]);

    const worked = settleBaseline(emptyBaseline(USER), USER, state(), remoteOnly, plan, {
      ...nothing,
      adoptedProfiles: ['b'],
    });
    expect(Object.keys(worked.profiles)).toContain('b');
  });

  it('keeps retrying a deletion that did not go through', () => {
    const gone = state();
    const onServer = state({ profiles: [profile('a')], attemptIds: { a: ['1'] } });
    const b = baseline({ a: ['1'] });
    const plan = planSync(gone, onServer, b);
    expect(plan.deleteRemote).toEqual(['a']);
    const after = settleBaseline(b, USER, gone, onServer, plan, nothing);
    expect(planSync(gone, onServer, after).deleteRemote).toEqual(['a']);
  });

  it('keeps retrying a local removal that did not go through', () => {
    const here = state({ profiles: [profile('a')], attemptIds: { a: ['1'] } });
    const b = baseline({ a: ['1'] });
    const plan = planSync(here, state(), b);
    expect(plan.deleteLocal).toEqual(['a']);
    const after = settleBaseline(b, USER, here, state(), plan, nothing);
    expect(planSync(here, state(), after).deleteLocal).toEqual(['a']);
  });

  it('stops asking once the deletion is confirmed', () => {
    const gone = state();
    const onServer = state({ profiles: [profile('a')], attemptIds: { a: ['1'] } });
    const b = baseline({ a: ['1'] });
    const plan = planSync(gone, onServer, b);
    const after = settleBaseline(b, USER, gone, onServer, plan, { ...nothing, deletedRemote: ['a'] });
    expect(after.profiles).toEqual({});
  });
});

describe('planSync: any two devices converge', () => {
  /** A tiny deterministic generator, so a failure is reproducible. */
  function lcg(seed: number) {
    let s = seed >>> 0;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  it('after applying the plan, both sides hold the union of attempts, for 200 random worlds', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const rnd = lcg(seed);
      const pool = Array.from({ length: 12 }, (_, i) => `at${i}`);
      const pick = () => pool.filter(() => rnd() < 0.5);
      const common = pick();
      const localIds = [...new Set([...common, ...pick()])];
      const remoteIds = [...new Set([...common, ...pick()])];
      const local = state({ profiles: [profile('a')], attemptIds: { a: localIds } });
      const remote = state({ profiles: [profile('a')], attemptIds: { a: remoteIds } });
      const plan = planSync(local, remote, baseline({ a: common }));

      const union = [...new Set([...localIds, ...remoteIds])].sort();
      const localAfter = [...new Set([...localIds, ...(plan.pullAttempts.a ?? [])])].sort();
      const remoteAfter = [...new Set([...remoteIds, ...(plan.pushAttempts.a ?? [])])].sort();
      expect(localAfter, `seed ${seed}`).toEqual(union);
      expect(remoteAfter, `seed ${seed}`).toEqual(union);
      // And nothing is moved needlessly.
      for (const id of plan.pushAttempts.a ?? []) expect(remoteIds).not.toContain(id);
      for (const id of plan.pullAttempts.a ?? []) expect(localIds).not.toContain(id);
    }
  });
});
