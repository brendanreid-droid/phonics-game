import { describe, expect, it } from 'vitest';
import { isUuid } from '@soundlings/api';
import type { Attempt } from '@soundlings/engine';
import { MemoryProgressRepo } from './MemoryProgressRepo';
import { SyncingProgressRepo } from './SyncingProgressRepo';

const attempt = (over: Partial<Attempt> = {}): Attempt => ({
  sessionId: 's',
  targetId: 's',
  skill: 'SOUND_ID',
  taskTypeId: 'sound-hunt',
  correct: true,
  scaffolded: false,
  latencyMs: 1000,
  weight: 1,
  at: 1,
  ...over,
});

// The shared ProgressRepo contract is NOT run against this wrapper, on purpose: it
// asserts that an appended attempt reads back strictly equal, and this wrapper's
// one job on top of delegating is to add an id. Everything else it passes through.

describe('SyncingProgressRepo', () => {
  it('stamps an id on a new attempt, and keeps one it already has', async () => {
    const wrapped = new SyncingProgressRepo(new MemoryProgressRepo());
    await wrapped.appendAttempt('kid', attempt());
    await wrapped.appendAttempt('kid', attempt({ id: 'already-here' }));
    const [stamped, kept] = await wrapped.loadAttempts('kid');
    expect(isUuid(stamped.id as string)).toBe(true);
    expect(kept.id).toBe('already-here');
  });

  it('passes every other read and write straight through to the device', async () => {
    const local = new MemoryProgressRepo();
    const wrapped = new SyncingProgressRepo(local);
    await wrapped.saveMastery('kid', {});
    await wrapped.saveConfusions('kid', { 's>a': 2 });
    await wrapped.saveHighScore('kid', { level: 1, stars: 3, cleanRun: true, at: 5 });
    await wrapped.markLevelComplete('kid', 1, 9);
    await wrapped.mergeCompletion('kid', 1, 4);
    await wrapped.markPlayedOn('kid', '2026-10-14');
    expect(await local.loadConfusions('kid')).toEqual({ 's>a': 2 });
    expect(await local.loadHighScores('kid')).toEqual([{ level: 1, stars: 3, cleanRun: true, at: 5 }]);
    expect(await local.loadCompletions('kid')).toEqual({ 1: 4 });
    expect(await local.loadPlayedDates('kid')).toEqual(['2026-10-14']);
    await wrapped.clear('kid');
    expect(await local.loadCompletions('kid')).toEqual({});
  });

  it('gives every attempt a different id', async () => {
    const wrapped = new SyncingProgressRepo(new MemoryProgressRepo());
    for (let i = 0; i < 50; i += 1) await wrapped.appendAttempt('kid', attempt({ at: i }));
    const ids = (await wrapped.loadAttempts('kid')).map((a) => a.id);
    expect(new Set(ids).size).toBe(50);
  });

  it('writes to local storage and nowhere else: what the caller reads back is what the device holds', async () => {
    const local = new MemoryProgressRepo();
    const wrapped = new SyncingProgressRepo(local);
    await wrapped.appendAttempt('kid', attempt());
    expect(await local.loadAttempts('kid')).toEqual(await wrapped.loadAttempts('kid'));
  });

  it('does not wait for a listener: a quest that finishes is saved even if the listener never returns or throws', async () => {
    const local = new MemoryProgressRepo();
    let called = 0;
    const wrapped = new SyncingProgressRepo(local, {
      questFinished: () => {
        called += 1;
        throw new Error('the sync exploded');
      },
    });
    await wrapped.saveActiveSession('kid', { sessionId: 's', level: 1, plan: [], index: 0, stars: 3, startedAt: 1 });
    await expect(wrapped.saveActiveSession('kid', null)).resolves.toBeUndefined();
    expect(called).toBe(1);
    expect(await local.loadActiveSession('kid')).toBeNull();
  });

  it('tells the listener only when a quest has finished, not at each step', async () => {
    let finished = 0;
    const wrapped = new SyncingProgressRepo(new MemoryProgressRepo(), { questFinished: () => (finished += 1) });
    const session = { sessionId: 's', level: 1, plan: [], index: 0, stars: 3, startedAt: 1 };
    await wrapped.saveActiveSession('kid', session);
    await wrapped.saveActiveSession('kid', { ...session, index: 1 });
    await wrapped.appendAttempt('kid', attempt());
    await wrapped.saveMastery('kid', {});
    expect(finished).toBe(0);
    await wrapped.saveActiveSession('kid', null);
    expect(finished).toBe(1);
  });

  it('knows a quest is in progress from its first saved step until it finishes', async () => {
    let now = 1000;
    const wrapped = new SyncingProgressRepo(new MemoryProgressRepo(), {}, () => now);
    expect(wrapped.isQuestInProgress()).toBe(false);
    await wrapped.saveActiveSession('kid', { sessionId: 's', level: 1, plan: [], index: 0, stars: 3, startedAt: 1 });
    expect(wrapped.isQuestInProgress()).toBe(true);
    await wrapped.saveActiveSession('kid', null);
    expect(wrapped.isQuestInProgress()).toBe(false);
  });

  it('stops counting a quest as in progress once it has been idle a while, so a abandoned one cannot block sync for ever', async () => {
    let now = 1000;
    const wrapped = new SyncingProgressRepo(new MemoryProgressRepo(), {}, () => now);
    await wrapped.saveActiveSession('kid', { sessionId: 's', level: 1, plan: [], index: 0, stars: 3, startedAt: 1 });
    now += 9 * 60 * 1000;
    expect(wrapped.isQuestInProgress()).toBe(true);
    now += 2 * 60 * 1000;
    expect(wrapped.isQuestInProgress()).toBe(false);
  });
});
