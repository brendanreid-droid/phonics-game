import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRemote, RemoteError, isUuid, rebuildFrom } from '@soundlings/api';
import type { IdentifiedAttempt } from '@soundlings/api';
import { DEFAULT_CONFIG } from '@soundlings/engine';
import { MemoryProgressRepo } from '../data/MemoryProgressRepo';
import { SyncingProgressRepo } from '../data/SyncingProgressRepo';
import { MemoryProfileRepo } from '../profiles/MemoryProfileRepo';
import { MemorySyncStateStore } from './SyncStateStore';
import { runSync } from './runSync';
import { playQuest, steppingClock } from './testSupport';

const USER = '9d0c6f5e-0000-4000-8000-0000000000aa';
const START = 5_000_000_000;
const HOUR = 3_600_000;

/**
 * One wall clock for the whole test, shared by every device in it. Two devices
 * in a room agree about the time; giving each its own clock would let one play
 * "in the past" of the other, which is a different (and real, see the report)
 * problem from the one these tests are about.
 */
let clock = steppingClock(START);
beforeEach(() => {
  clock = steppingClock(START);
});

/** One physical device: its own storage, signed in as USER (or not yet synced). */
function device(remote: MemoryRemote) {
  const profiles = new MemoryProfileRepo();
  const local = new MemoryProgressRepo();
  const progress = new SyncingProgressRepo(local, {}, clock.now);
  const store = new MemorySyncStateStore();
  const sync = (retry?: { deferredDerived?: readonly string[] }) =>
    runSync(
      {
        userId: USER,
        remote,
        profiles,
        progress: local,
        store,
        config: DEFAULT_CONFIG,
        questInProgress: () => progress.isQuestInProgress(),
      },
      retry,
    );
  return { profiles, local, progress, store, sync, clock };
}
type Device = ReturnType<typeof device>;

async function newChild(d: Device, name = 'Ada') {
  return d.profiles.create({ name, avatarId: 'fox', now: d.clock.now() });
}

async function playDays(d: Device, profileId: string, days: number, seed: number) {
  for (let i = 0; i < days; i += 1) {
    await playQuest({ repo: d.progress, profileId, now: d.clock.now, seed: seed + i });
    d.clock.jump(20 * HOUR);
  }
}

const idsOf = async (d: Device, profileId: string) =>
  (await d.local.loadAttempts(profileId)).map((a) => a.id as string).sort();

describe('a device that has played pushes its log to the server', () => {
  it('gets every attempt onto the server, under the profile', async () => {
    const remote = new MemoryRemote();
    const a = device(remote);
    const child = await newChild(a);
    await playDays(a, child.id, 2, 1);

    const local = await idsOf(a, child.id);
    expect(local.length).toBeGreaterThan(40);
    expect(local.every((id) => isUuid(id))).toBe(true);

    const report = await a.sync();
    expect(report.ok).toBe(true);
    expect(report.attemptsPushed).toBe(local.length);
    const serverProfile = remote.profileIds()[0];
    expect(remote.attemptIdsOf(serverProfile)).toEqual(local);
  });

  it('puts a profile made before sync existed on the server under a UUID, the same one every time', async () => {
    const remote = new MemoryRemote();
    const a = device(remote);
    const child = await newChild(a);
    expect(isUuid(child.id)).toBe(false); // the in-memory repo still makes short legacy ids, which exercises the mapping
    await a.sync();
    const [serverId] = remote.profileIds();
    expect(isUuid(serverId)).toBe(true);
    await a.sync();
    expect(remote.profileIds()).toEqual([serverId]);
  });

  it('pushes attempts written before ids existed, once, deriving their ids from their contents', async () => {
    const remote = new MemoryRemote();
    const a = device(remote);
    const child = await newChild(a);
    await playDays(a, child.id, 1, 3);
    // Strip the ids, as a log written by an older build would be.
    const bare = (await a.local.loadAttempts(child.id)).map((x) => {
      const { id: _id, ...rest } = x;
      return rest;
    });
    await a.local.clear(child.id);
    for (const attempt of bare) await a.local.appendAttempt(child.id, attempt);

    await a.sync();
    const [serverId] = remote.profileIds();
    expect(remote.attemptIdsOf(serverId)).toHaveLength(bare.length);
    // Pushing the same log again adds nothing.
    await a.sync();
    expect(remote.attemptIdsOf(serverId)).toHaveLength(bare.length);
  });

  it('a quiet device does no writing: a second sync only looks', async () => {
    const remote = new MemoryRemote();
    const a = device(remote);
    const child = await newChild(a);
    await playDays(a, child.id, 1, 5);
    await a.sync();
    remote.calls.length = 0;
    const report = await a.sync();
    expect(report.quiet).toBe(true);
    expect(remote.calls).toEqual(['fetchState']);
  });
});

describe('a second device with the same account sees the child', () => {
  it('arrives with the profile, the whole log, and everything derived from it', async () => {
    const remote = new MemoryRemote();
    const a = device(remote);
    const child = await newChild(a);
    await playDays(a, child.id, 4, 10);
    await a.sync();

    const b = device(remote);
    const report = await b.sync();
    expect(report.ok).toBe(true);

    const [onB] = await b.profiles.list();
    expect(onB.name).toBe('Ada');
    expect(onB.avatarId).toBe('fox');

    // The same log.
    expect(await idsOf(b, onB.id)).toEqual(await idsOf(a, child.id));

    // And the same child: what the game would show is rebuilt, not copied, and matches.
    expect(await b.local.loadMastery(onB.id)).toEqual(await a.local.loadMastery(child.id));
    expect(await b.local.loadPlayedDates(onB.id)).toEqual(await a.local.loadPlayedDates(child.id));
    // Same quests, same stars. (The live score is stamped when the runner finished and the
    // rebuilt one with the last answer's time, a moment apart, so `at` is not compared.)
    const scores = (list: Awaited<ReturnType<typeof a.local.loadHighScores>>) =>
      list.map(({ level, stars, cleanRun }) => ({ level, stars, cleanRun }));
    expect(scores(await b.local.loadHighScores(onB.id))).toEqual(scores(await a.local.loadHighScores(child.id)));
  });

  it('latches a level the first device completed, with its time', async () => {
    const remote = new MemoryRemote();
    const a = device(remote);
    const child = await newChild(a);
    await a.local.markLevelComplete(child.id, 1, 123_456);
    await a.sync();

    const b = device(remote);
    await b.sync();
    const [onB] = await b.profiles.list();
    expect(await b.local.loadCompletions(onB.id)).toEqual({ 1: 123_456 });
  });

  it('can play on straight away, continuing from the mastery it was given', async () => {
    const remote = new MemoryRemote();
    const a = device(remote);
    const child = await newChild(a);
    await playDays(a, child.id, 3, 20);
    await a.sync();

    const b = device(remote);
    await b.sync();
    const [onB] = await b.profiles.list();
    await playDays(b, onB.id, 1, 99);
    const attempts = await b.local.loadAttempts(onB.id);
    expect(attempts.length).toBeGreaterThan((await a.local.loadAttempts(child.id)).length);
    expect(rebuildFrom(attempts, DEFAULT_CONFIG).mastery).toEqual(await b.local.loadMastery(onB.id));
  });
});

describe('two devices that both played offline keep everything', () => {
  it('ends with the same log on both, and the mastery of the combined play', async () => {
    const remote = new MemoryRemote();
    const a = device(remote);
    const child = await newChild(a);
    await playDays(a, child.id, 2, 30);
    await a.sync();
    const b = device(remote);
    await b.sync();
    const [onB] = await b.profiles.list();

    // Both go offline and play different days.
    remote.online = false;
    await playDays(a, child.id, 2, 40);
    clock.jump(100 * HOUR);
    await playDays(b, onB.id, 2, 50);
    const aOnly = (await idsOf(a, child.id)).length;
    const bOnly = (await idsOf(b, onB.id)).length;
    expect((await a.sync()).offline).toBe(true);
    expect((await b.sync()).offline).toBe(true);

    remote.online = true;
    await a.sync();
    await b.sync();
    await a.sync();

    const logA = await idsOf(a, child.id);
    const logB = await idsOf(b, onB.id);
    expect(logA).toEqual(logB);
    expect(logA.length).toBeGreaterThan(Math.max(aOnly, bOnly));
    expect(remote.attemptIdsOf(remote.profileIds()[0])).toEqual(logA);

    // One child, one story, wherever they are looked at.
    expect(await a.local.loadMastery(child.id)).toEqual(await b.local.loadMastery(onB.id));
    expect(await a.local.loadMastery(child.id)).toEqual(
      rebuildFrom(await a.local.loadAttempts(child.id), DEFAULT_CONFIG).mastery,
    );
  });
});

describe('the network going away loses nothing', () => {
  it('lets a full quest be played with the network off, throughout, then delivers it', async () => {
    const remote = new MemoryRemote();
    const a = device(remote);
    const child = await newChild(a);
    await playDays(a, child.id, 1, 60);
    await a.sync();
    remote.calls.length = 0;
    remote.online = false;

    // Played end to end against a dead connection, through the real runner.
    const answers = await playQuest({ repo: a.progress, profileId: child.id, now: a.clock.now, seed: 61 });
    expect(answers).toBeGreaterThan(8);
    // Playing made no network call at all.
    expect(remote.calls).toEqual([]);

    const after = await idsOf(a, child.id);
    const report = await a.sync();
    expect(report.ok).toBe(false);
    expect(report.offline).toBe(true);
    // Nothing disappeared locally, and the failed pass wrote nothing.
    expect(await idsOf(a, child.id)).toEqual(after);
    expect(remote.attemptIdsOf(remote.profileIds()[0]).length).toBeLessThan(after.length);

    remote.online = true;
    const recovered = await a.sync();
    expect(recovered.ok).toBe(true);
    expect(remote.attemptIdsOf(remote.profileIds()[0])).toEqual(after);
  });

  it('does not remove a profile from the device when its push failed', async () => {
    // The dangerous case: the profile is recorded as shared before it really is,
    // and the next pass reads "shared, missing from the server" as a deletion.
    class DropsAfterProfile extends MemoryRemote {
      async insertProfiles(parentId: string, profiles: Parameters<MemoryRemote['insertProfiles']>[1]) {
        await super.insertProfiles(parentId, profiles);
        this.online = false; // the connection dies right after the profile lands
      }
    }
    const remote = new DropsAfterProfile();
    const a = device(remote);
    const child = await newChild(a);
    await playDays(a, child.id, 1, 70);
    const before = await idsOf(a, child.id);

    const first = await a.sync();
    expect(first.ok).toBe(false);
    remote.online = true;
    const second = await a.sync();
    expect(second.ok).toBe(true);
    expect((await a.profiles.list()).map((p) => p.id)).toEqual([child.id]);
    expect(await idsOf(a, child.id)).toEqual(before);
    expect(remote.attemptIdsOf(remote.profileIds()[0])).toEqual(before);
  });

  it('does not remove a profile with no play yet when its push was refused outright', async () => {
    // A child nobody has played with has no unsent attempts to protect them, so
    // only the record of what was shared stands between them and a deletion.
    class RefusesProfiles extends MemoryRemote {
      refuse = true;
      async insertProfiles(parentId: string, profiles: Parameters<MemoryRemote['insertProfiles']>[1]) {
        if (this.refuse) throw new RemoteError('network', 'Failed to fetch');
        await super.insertProfiles(parentId, profiles);
      }
    }
    const remote = new RefusesProfiles();
    const a = device(remote);
    const child = await newChild(a);
    expect((await a.sync()).ok).toBe(false);
    remote.refuse = false;
    expect((await a.sync()).ok).toBe(true);
    expect((await a.profiles.list()).map((p) => p.id)).toEqual([child.id]);
    expect(remote.profileIds()).toHaveLength(1);
  });

  it('does not delete the server copy when pulling a profile failed', async () => {
    const remote = new MemoryRemote();
    const a = device(remote);
    const child = await newChild(a);
    await playDays(a, child.id, 1, 71);
    await a.sync();

    const b = device(remote);
    const realAdopt = b.profiles.adopt.bind(b.profiles);
    let failing = true;
    b.profiles.adopt = async (p) => {
      if (failing) throw new Error('disk full');
      return realAdopt(p);
    };
    const first = await b.sync();
    expect(first.ok).toBe(false);
    expect(await b.profiles.list()).toEqual([]);
    // Another pass, once adopting works, must pull it - not read it as deleted-here and delete the server's.
    failing = false;
    await b.sync();
    expect(remote.profileIds()).toHaveLength(1);
    expect(remote.attemptIdsOf(remote.profileIds()[0])).toEqual(await idsOf(a, child.id));
    expect(await b.profiles.list()).toHaveLength(1);
  });

  it('keeps pushing the rest of a log when the server refuses one attempt', async () => {
    const remote = new MemoryRemote();
    const a = device(remote);
    const child = await newChild(a);
    await playDays(a, child.id, 1, 80);
    const all = await idsOf(a, child.id);
    const poison = all[7];
    remote.rejects = (x: IdentifiedAttempt) => x.id === poison;

    const report = await a.sync();
    expect(report.refused).toBe(1);
    expect(report.ok).toBe(false);
    // The refused one is NOT recorded as safe, so it is still owed, not forgotten.
    const baseline = await a.store.load();
    expect(baseline?.profiles[remote.profileIds()[0]]).not.toContain(poison);
    expect(baseline?.profiles[remote.profileIds()[0]]).toHaveLength(all.length - 1);
    expect(remote.attemptIdsOf(remote.profileIds()[0])).toEqual(all.filter((id) => id !== poison));
    // Still on the device, untouched.
    expect(await idsOf(a, child.id)).toEqual(all);
  });
});

describe('deleting a child', () => {
  it('deleting on one device removes the child from the other', async () => {
    const remote = new MemoryRemote();
    const a = device(remote);
    const child = await newChild(a);
    await playDays(a, child.id, 1, 90);
    await a.sync();
    const b = device(remote);
    await b.sync();

    await a.local.clear(child.id);
    await a.profiles.remove(child.id);
    await a.sync();
    expect(remote.profileIds()).toEqual([]);

    const report = await b.sync();
    expect(report.ok).toBe(true);
    expect(await b.profiles.list()).toEqual([]);
  });

  it('puts a child back rather than destroy play this device made offline', async () => {
    const remote = new MemoryRemote();
    const a = device(remote);
    const child = await newChild(a);
    await playDays(a, child.id, 1, 91);
    await a.sync();
    const b = device(remote);
    await b.sync();
    const [onB] = await b.profiles.list();

    // A removes the child and syncs; B, not knowing, plays on.
    await a.local.clear(child.id);
    await a.profiles.remove(child.id);
    await a.sync();
    clock.jump(30 * HOUR);
    await playQuest({ repo: b.progress, profileId: onB.id, now: b.clock.now, seed: 92 });
    const played = await idsOf(b, onB.id);

    await b.sync();
    expect(await b.profiles.list()).toHaveLength(1);
    expect(await idsOf(b, onB.id)).toEqual(played);
    expect(remote.attemptIdsOf(remote.profileIds()[0])).toEqual(played);
  });
});

describe('a quest in progress is left alone', () => {
  it('holds back rebuilding mastery until the quest is over', async () => {
    const remote = new MemoryRemote();
    const a = device(remote);
    const child = await newChild(a);
    await playDays(a, child.id, 2, 100);
    await a.sync();

    const b = device(remote);
    await b.sync();
    const [onB] = await b.profiles.list();
    clock.jump(30 * HOUR);
    await playQuest({ repo: a.progress, profileId: child.id, now: a.clock.now, seed: 101 });
    await a.sync();

    // B is mid-quest when the sync lands.
    await b.progress.saveActiveSession(onB.id, {
      sessionId: 's',
      level: 1,
      plan: [],
      index: 0,
      stars: 3,
      startedAt: 1,
    });
    expect(b.progress.isQuestInProgress()).toBe(true);
    const mastery = await b.local.loadMastery(onB.id);
    const report = await b.sync();
    expect(report.attemptsPulled).toBeGreaterThan(0);
    expect(report.deferredDerived).toEqual([onB.id]);
    // The log took the new attempts; the mastery the quest holds was not swapped from under it.
    expect(await b.local.loadMastery(onB.id)).toEqual(mastery);

    // Quest over: the next pass catches mastery up from the log.
    await b.progress.saveActiveSession(onB.id, null);
    const later = await b.sync({ deferredDerived: report.deferredDerived });
    expect(later.deferredDerived).toEqual([]);
    expect(await b.local.loadMastery(onB.id)).toEqual(await a.local.loadMastery(child.id));
  });
});

describe('the server being unreachable', () => {
  it('reports it and changes nothing on either side', async () => {
    const remote = new MemoryRemote();
    remote.online = false;
    const a = device(remote);
    const child = await newChild(a);
    await playDays(a, child.id, 1, 110);
    const before = await idsOf(a, child.id);
    const report = await a.sync();
    expect(report).toMatchObject({ ok: false, offline: true });
    expect(await idsOf(a, child.id)).toEqual(before);
    expect((await a.profiles.list()).map((p) => p.id)).toEqual([child.id]);
    expect(remote.profileIds()).toEqual([]);
  });

  it('treats a server that refuses permission as a failure to retry, not a reason to delete', async () => {
    class Forbidden extends MemoryRemote {
      async fetchState(): Promise<never> {
        throw new RemoteError('rejected', 'permission denied', '42501');
      }
    }
    const a = device(new Forbidden());
    const child = await newChild(a);
    const report = await a.sync();
    expect(report.ok).toBe(false);
    expect((await a.profiles.list()).map((p) => p.id)).toEqual([child.id]);
  });
});
