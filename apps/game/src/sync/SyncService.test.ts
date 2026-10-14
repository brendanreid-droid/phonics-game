import { describe, expect, it } from 'vitest';
import { MemoryRemote } from '@soundlings/api';
import type { RemoteStore } from '@soundlings/api';
import { MemoryProgressRepo } from '../data/MemoryProgressRepo';
import { SyncingProgressRepo } from '../data/SyncingProgressRepo';
import { MemoryProfileRepo } from '../profiles/MemoryProfileRepo';
import { MemorySyncStateStore } from './SyncStateStore';
import { SyncService } from './SyncService';
import { playQuest, steppingClock } from './testSupport';

const USER = { id: '9d0c6f5e-0000-4000-8000-0000000000aa', email: 'parent@example.com' };

/** Time under the test's control: nothing scheduled runs until `advance`. */
function manualTime() {
  let now = 0;
  const queue: { at: number; fn: () => void; live: boolean }[] = [];
  return {
    schedule: (fn: () => void, ms: number) => {
      const item = { at: now + ms, fn, live: true };
      queue.push(item);
      return () => {
        item.live = false;
      };
    },
    /** Moves time on and runs what falls due, then lets any async work settle. */
    async advance(ms: number) {
      now += ms;
      // Work that runs can schedule more work that is already due (a retry that
      // asks for an immediate pass), so keep going until nothing is.
      for (let round = 0; round < 20; round += 1) {
        const due = queue.filter((q) => q.live && q.at <= now);
        if (due.length === 0 && round > 0) break;
        for (const item of due) {
          item.live = false;
          item.fn();
        }
        for (let i = 0; i < 40; i += 1) await Promise.resolve();
        await new Promise((r) => setTimeout(r, 0));
      }
    },
    pending: () => queue.filter((q) => q.live).length,
    now: () => now,
  };
}

function setup(remote: RemoteStore | null = new MemoryRemote()) {
  const time = manualTime();
  const clock = steppingClock(5_000_000_000);
  const profiles = new MemoryProfileRepo();
  const local = new MemoryProgressRepo();
  // As the app wires it: the repo tells the service when a quest ends, and the
  // service is built after the repo, so the link is made late.
  let service: SyncService | null = null;
  const progress = new SyncingProgressRepo(local, { questFinished: () => service?.questFinished() }, clock.now);
  service = new SyncService({
    profiles,
    progress,
    store: new MemorySyncStateStore(),
    remoteFor: remote === null ? null : () => remote,
    now: time.now,
    schedule: time.schedule,
  });
  return { service, progress, local, profiles, time, clock, remote };
}

describe('SyncService: when it syncs', () => {
  it('does nothing at all when nobody is signed in', async () => {
    const remote = new MemoryRemote();
    const { service, time } = setup(remote);
    service.request('foreground');
    service.request('quest-finished');
    await time.advance(10_000);
    expect(remote.calls).toEqual([]);
    expect(service.getStatus()).toEqual({ kind: 'signed-out' });
  });

  it('is simply unavailable, and never errors, when no project is configured', async () => {
    const { service, time } = setup(null);
    service.setUser(USER);
    service.request('manual');
    await time.advance(10_000);
    expect(service.getStatus()).toEqual({ kind: 'unavailable' });
    expect(await service.syncNow()).toBeNull();
  });

  it('syncs when a parent signs in', async () => {
    const remote = new MemoryRemote();
    const { service, time, profiles } = setup(remote);
    await profiles.create({ name: 'Ada', avatarId: 'fox', now: 1 });
    service.setUser(USER);
    await time.advance(1);
    expect(remote.profileIds()).toHaveLength(1);
    const status = service.getStatus();
    expect(status).toMatchObject({ kind: 'signed-in', email: 'parent@example.com', syncing: false, lastPassIncomplete: false });
  });

  it('syncs when the app comes to the foreground', async () => {
    const remote = new MemoryRemote();
    const { service, time } = setup(remote);
    service.setUser(USER);
    await time.advance(1);
    remote.calls.length = 0;
    service.request('foreground');
    await time.advance(1);
    expect(remote.calls).toContain('fetchState');
  });

  it('syncs after a quest finishes, a moment later so the results screen is not kept waiting', async () => {
    const remote = new MemoryRemote();
    const { service, time, progress, profiles, clock } = setup(remote);
    const child = await profiles.create({ name: 'Ada', avatarId: 'fox', now: 1 });
    service.setUser(USER);
    await time.advance(1);
    remote.calls.length = 0;

    await playQuest({ repo: progress, profileId: child.id, now: clock.now, seed: 1 });
    expect(remote.calls).toEqual([]); // finishing the quest itself touched no network
    await time.advance(100);
    expect(remote.calls).toEqual([]); // not yet
    await time.advance(2000);
    expect(remote.attemptIdsOf(remote.profileIds()[0]).length).toBeGreaterThan(8);
  });

  it('makes NO network call while a quest is being played', async () => {
    const remote = new MemoryRemote();
    const { service, time, progress, profiles } = setup(remote);
    const child = await profiles.create({ name: 'Ada', avatarId: 'fox', now: 1 });
    service.setUser(USER);
    await time.advance(1);
    remote.calls.length = 0;

    // A quest is under way: a step has been saved and it has not finished.
    await progress.saveActiveSession(child.id, { sessionId: 's', level: 1, plan: [], index: 0, stars: 3, startedAt: 1 });
    service.request('foreground');
    service.request('quest-finished');
    await time.advance(60_000);
    expect(remote.calls).toEqual([]);
    expect(time.pending()).toBe(0);

    // It ends, and the held request is served.
    await progress.saveActiveSession(child.id, null);
    await time.advance(2000);
    expect(remote.calls).toContain('fetchState');
  });

  it('runs one pass at a time, and one more if asked meanwhile', async () => {
    const remote = new MemoryRemote();
    const { service, time } = setup(remote);
    service.setUser(USER);
    await time.advance(1);
    remote.calls.length = 0;
    service.request('foreground');
    service.request('foreground');
    service.request('foreground');
    await time.advance(1);
    expect(remote.calls.filter((c) => c === 'fetchState')).toHaveLength(1);
  });
});

describe('SyncService: when it fails', () => {
  it('shows the pass as incomplete to the parent, retries later, and recovers', async () => {
    const remote = new MemoryRemote();
    remote.online = false;
    const { service, time, profiles } = setup(remote);
    const child = await profiles.create({ name: 'Ada', avatarId: 'fox', now: 1 });
    service.setUser(USER);
    await time.advance(1);
    expect(service.getStatus()).toMatchObject({ kind: 'signed-in', lastPassIncomplete: true, lastSyncedAt: null });
    expect(time.pending()).toBe(1); // a retry is waiting

    remote.online = true;
    await time.advance(31_000);
    expect(service.getStatus()).toMatchObject({ lastPassIncomplete: false });
    expect(remote.profileIds()).toHaveLength(1);
    expect((await profiles.list()).map((p) => p.id)).toEqual([child.id]);
    expect(time.pending()).toBe(0);
  });

  it('backs off between retries rather than hammering a dead connection', async () => {
    const remote = new MemoryRemote();
    remote.online = false;
    const { service, time } = setup(remote);
    service.setUser(USER);
    await time.advance(1);
    const attempts = () => remote.calls.filter((c) => c === 'fetchState').length;
    expect(attempts()).toBe(1);
    await time.advance(29_000);
    expect(attempts()).toBe(1);
    await time.advance(2_000); // 30s: first retry
    expect(attempts()).toBe(2);
    await time.advance(100_000); // second retry is 2 minutes after the first
    expect(attempts()).toBe(2);
    await time.advance(30_000);
    expect(attempts()).toBe(3);
  });

  it('never throws to whoever asked, even if the server throws something unexpected', async () => {
    const remote = new MemoryRemote();
    remote.fetchState = async () => {
      throw new Error('something nobody planned for');
    };
    const { service, time } = setup(remote);
    service.setUser(USER);
    expect(() => service.request('manual')).not.toThrow();
    await time.advance(1);
    expect(service.getStatus()).toMatchObject({ kind: 'signed-in', lastPassIncomplete: true });
  });

  it('forgets a failure streak when a different parent signs in', async () => {
    const remote = new MemoryRemote();
    remote.online = false;
    const { service, time } = setup(remote);
    service.setUser(USER);
    await time.advance(1);
    remote.online = true;
    service.setUser({ id: '11111111-0000-4000-8000-0000000000bb', email: 'other@example.com' });
    await time.advance(1);
    expect(service.getStatus()).toMatchObject({ email: 'other@example.com', lastPassIncomplete: false });
  });

  it('stops syncing when the parent signs out, and the local game is untouched', async () => {
    const remote = new MemoryRemote();
    const { service, time, profiles } = setup(remote);
    const child = await profiles.create({ name: 'Ada', avatarId: 'fox', now: 1 });
    service.setUser(USER);
    await time.advance(1);
    service.setUser(null);
    remote.calls.length = 0;
    service.request('foreground');
    await time.advance(60_000);
    expect(remote.calls).toEqual([]);
    expect(service.getStatus()).toEqual({ kind: 'signed-out' });
    expect((await profiles.list()).map((p) => p.id)).toEqual([child.id]);
  });
});
