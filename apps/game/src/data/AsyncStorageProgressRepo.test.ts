import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG, buildSession, emptyRecord } from '@soundlings/engine';
import type { Attempt } from '@soundlings/engine';

/**
 * A fake AsyncStorage: a string-to-string map with a real async gap on every
 * call (so overlapping operations genuinely interleave) and switches to make
 * individual operations fail. The native module needs a device, so the repo is
 * exercised against this instead.
 */
const fake = vi.hoisted(() => {
  const state = {
    data: new Map<string, string>(),
    failGet: (_key: string): boolean => false,
    failSet: (_key: string): boolean => false,
  };
  const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  return {
    state,
    module: {
      getItem: async (key: string) => {
        await tick();
        if (state.failGet(key)) throw new Error('storage unavailable');
        return state.data.get(key) ?? null;
      },
      setItem: async (key: string, value: string) => {
        await tick();
        if (state.failSet(key)) throw new Error('disk full');
        state.data.set(key, value);
      },
      removeItem: async (key: string) => {
        await tick();
        state.data.delete(key);
      },
    },
  };
});

vi.mock('@react-native-async-storage/async-storage', () => ({ default: fake.module }));

import { AsyncStorageProgressRepo } from './AsyncStorageProgressRepo';
import { describeProgressRepo } from './progressRepoContract';

const NOW = 1_000_000;

function attempt(at: number): Attempt {
  return {
    sessionId: 's1', targetId: 's', skill: 'SOUND_ID', taskTypeId: 'sound-hunt',
    correct: true, scaffolded: false, latencyMs: 900, weight: 1, at,
  };
}

beforeEach(() => {
  fake.state.data.clear();
  fake.state.failGet = () => false;
  fake.state.failSet = () => false;
});

describeProgressRepo('AsyncStorageProgressRepo', () => new AsyncStorageProgressRepo());

describe('AsyncStorageProgressRepo on a device', () => {
  it('survives the app being killed: a new repository instance sees the saved quest', async () => {
    const plan = buildSession({ sessionId: 'q1', level: 1, mastery: {}, confusions: {}, now: NOW });
    const session = { sessionId: 'q1', level: 1, plan, index: 6, stars: 3, startedAt: NOW };

    await new AsyncStorageProgressRepo().saveActiveSession('kid', session);

    // Nothing of the first instance survives but what it wrote to storage.
    const afterRestart = new AsyncStorageProgressRepo();
    expect(await afterRestart.loadActiveSession('kid')).toStrictEqual(session);
  });

  it('survives a restart for mastery, confusions, attempts and scores too', async () => {
    const first = new AsyncStorageProgressRepo();
    const mastery = { 's::SOUND_ID': emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG) };
    await first.saveMastery('kid', mastery);
    await first.saveConfusions('kid', { 'm>a': 2 });
    await first.appendAttempt('kid', attempt(NOW));
    await first.saveHighScore('kid', { level: 1, stars: 2, cleanRun: false, at: NOW });

    const second = new AsyncStorageProgressRepo();
    expect(await second.loadMastery('kid')).toStrictEqual(mastery);
    expect(await second.loadConfusions('kid')).toEqual({ 'm>a': 2 });
    expect(await second.loadAttempts('kid')).toStrictEqual([attempt(NOW)]);
    expect((await second.loadHighScores('kid'))[0].stars).toBe(2);
  });

  it('survives a restart for latched levels and days played', async () => {
    const first = new AsyncStorageProgressRepo();
    await first.markLevelComplete('kid', 1, 1000);
    await first.markPlayedOn('kid', '2026-10-11');
    await first.markPlayedOn('kid', '2026-10-10');

    const second = new AsyncStorageProgressRepo();
    expect(await second.loadCompletions('kid')).toEqual({ 1: 1000 });
    expect(await second.loadPlayedDates('kid')).toEqual(['2026-10-10', '2026-10-11']);

    // First still wins after a restart: a second instance cannot overwrite it.
    await second.markLevelComplete('kid', 1, 9999);
    expect(await new AsyncStorageProgressRepo().loadCompletions('kid')).toEqual({ 1: 1000 });
  });

  it('two instances over one store do not lose each other\'s completions or days when run in turn', async () => {
    await new AsyncStorageProgressRepo().markLevelComplete('kid', 1, 1000);
    await new AsyncStorageProgressRepo().markLevelComplete('kid', 2, 2000);
    await new AsyncStorageProgressRepo().markPlayedOn('kid', '2026-10-10');
    await new AsyncStorageProgressRepo().markPlayedOn('kid', '2026-10-11');
    const repo = new AsyncStorageProgressRepo();
    expect(await repo.loadCompletions('kid')).toEqual({ 1: 1000, 2: 2000 });
    expect(await repo.loadPlayedDates('kid')).toEqual(['2026-10-10', '2026-10-11']);
  });

  it('removes the stored key when the session is cleared, rather than storing "null"', async () => {
    const repo = new AsyncStorageProgressRepo();
    await repo.saveActiveSession('kid', { sessionId: 'q', level: 1, plan: [], index: 0, stars: 0, startedAt: NOW });
    expect(fake.state.data.has('soundlings/kid/activeSession')).toBe(true);
    await repo.saveActiveSession('kid', null);
    expect(fake.state.data.has('soundlings/kid/activeSession')).toBe(false);
  });

  it('two repository instances over one store do not lose each other\'s attempts when run in turn', async () => {
    await new AsyncStorageProgressRepo().appendAttempt('kid', attempt(1));
    await new AsyncStorageProgressRepo().appendAttempt('kid', attempt(2));
    expect((await new AsyncStorageProgressRepo().loadAttempts('kid')).map((a) => a.at)).toEqual([1, 2]);
  });

  describe('when storage misbehaves', () => {
    it('never destroys the attempt log when a read fails: the append is skipped instead', async () => {
      const repo = new AsyncStorageProgressRepo();
      for (let i = 0; i < 5; i += 1) await repo.appendAttempt('kid', attempt(i));
      const before = fake.state.data.get('soundlings/kid/attempts');

      fake.state.failGet = (key) => key.endsWith('/attempts');
      await expect(repo.appendAttempt('kid', attempt(99))).resolves.toBeUndefined();
      expect(fake.state.data.get('soundlings/kid/attempts')).toBe(before);

      fake.state.failGet = () => false;
      expect((await repo.loadAttempts('kid')).length).toBe(5);
      await repo.appendAttempt('kid', attempt(100));
      expect((await repo.loadAttempts('kid')).length).toBe(6);
    });

    it('quarantines a corrupt attempt log instead of overwriting it, then carries on', async () => {
      fake.state.data.set('soundlings/kid/attempts', '{"truncated by a flat batt');
      const repo = new AsyncStorageProgressRepo();

      expect(await repo.loadAttempts('kid')).toEqual([]);
      await repo.appendAttempt('kid', attempt(1));

      expect((await repo.loadAttempts('kid')).length).toBe(1);
      expect(fake.state.data.get('soundlings/kid/attempts.corrupt')).toBe('{"truncated by a flat batt');
    });

    it('treats valid JSON of the wrong shape as corrupt, not as data', async () => {
      fake.state.data.set('soundlings/kid/attempts', '{"not":"an array"}');
      fake.state.data.set('soundlings/kid/mastery', '[1,2,3]');
      const repo = new AsyncStorageProgressRepo();
      expect(await repo.loadAttempts('kid')).toEqual([]);
      expect(await repo.loadMastery('kid')).toEqual({});
    });

    it('does not throw from any load when storage is unreadable', async () => {
      fake.state.failGet = () => true;
      const repo = new AsyncStorageProgressRepo();
      expect(await repo.loadMastery('kid')).toEqual({});
      expect(await repo.loadAttempts('kid')).toEqual([]);
      expect(await repo.loadConfusions('kid')).toEqual({});
      expect(await repo.loadActiveSession('kid')).toBeNull();
      expect(await repo.loadHighScores('kid')).toEqual([]);
    });

    it('does not throw from any save when storage is full', async () => {
      fake.state.failSet = () => true;
      const repo = new AsyncStorageProgressRepo();
      await expect(repo.saveMastery('kid', {})).resolves.toBeUndefined();
      await expect(repo.appendAttempt('kid', attempt(1))).resolves.toBeUndefined();
      await expect(repo.saveConfusions('kid', {})).resolves.toBeUndefined();
      await expect(
        repo.saveActiveSession('kid', { sessionId: 'q', level: 1, plan: [], index: 0, stars: 0, startedAt: NOW }),
      ).resolves.toBeUndefined();
      await expect(repo.saveHighScore('kid', { level: 1, stars: 1, cleanRun: false, at: NOW })).resolves.toBeUndefined();
    });

    it('never destroys latched levels when a read fails: the latch is skipped instead', async () => {
      const repo = new AsyncStorageProgressRepo();
      await repo.markLevelComplete('kid', 1, 1000);
      const before = fake.state.data.get('soundlings/kid/completions');

      fake.state.failGet = (key) => key.endsWith('/completions');
      await expect(repo.markLevelComplete('kid', 2, 2000)).resolves.toBeUndefined();
      expect(fake.state.data.get('soundlings/kid/completions')).toBe(before);

      fake.state.failGet = () => false;
      expect(await repo.loadCompletions('kid')).toEqual({ 1: 1000 });
      await repo.markLevelComplete('kid', 2, 3000);
      expect(await repo.loadCompletions('kid')).toEqual({ 1: 1000, 2: 3000 });
    });

    it('never destroys the played days when a read fails: the day is skipped instead', async () => {
      const repo = new AsyncStorageProgressRepo();
      await repo.markPlayedOn('kid', '2026-10-10');
      const before = fake.state.data.get('soundlings/kid/playedDates');

      fake.state.failGet = (key) => key.endsWith('/playedDates');
      await expect(repo.markPlayedOn('kid', '2026-10-11')).resolves.toBeUndefined();
      expect(fake.state.data.get('soundlings/kid/playedDates')).toBe(before);

      fake.state.failGet = () => false;
      expect(await repo.loadPlayedDates('kid')).toEqual(['2026-10-10']);
    });

    it('quarantines damaged completions and played days instead of overwriting them', async () => {
      fake.state.data.set('soundlings/kid/completions', '{"1":170');
      fake.state.data.set('soundlings/kid/playedDates', '["2026-10-1');
      const repo = new AsyncStorageProgressRepo();

      expect(await repo.loadCompletions('kid')).toEqual({});
      expect(await repo.loadPlayedDates('kid')).toEqual([]);
      await repo.markLevelComplete('kid', 1, 1000);
      await repo.markPlayedOn('kid', '2026-10-10');

      expect(await repo.loadCompletions('kid')).toEqual({ 1: 1000 });
      expect(await repo.loadPlayedDates('kid')).toEqual(['2026-10-10']);
      expect(fake.state.data.get('soundlings/kid/completions.corrupt')).toBe('{"1":170');
      expect(fake.state.data.get('soundlings/kid/playedDates.corrupt')).toBe('["2026-10-1');
    });

    it('treats valid JSON of the wrong shape as damaged, not as data', async () => {
      fake.state.data.set('soundlings/kid/completions', '[1,2,3]');
      fake.state.data.set('soundlings/kid2/completions', '{"1":"yesterday"}');
      fake.state.data.set('soundlings/kid/playedDates', '{"0":"2026-10-10"}');
      fake.state.data.set('soundlings/kid2/playedDates', '["2026-10-10",7]');
      const repo = new AsyncStorageProgressRepo();
      expect(await repo.loadCompletions('kid')).toEqual({});
      expect(await repo.loadCompletions('kid2')).toEqual({});
      expect(await repo.loadPlayedDates('kid')).toEqual([]);
      expect(await repo.loadPlayedDates('kid2')).toEqual([]);
    });

    it('does not throw from the new loads when storage is unreadable, or the new saves when it is full', async () => {
      const repo = new AsyncStorageProgressRepo();
      fake.state.failGet = () => true;
      expect(await repo.loadCompletions('kid')).toEqual({});
      expect(await repo.loadPlayedDates('kid')).toEqual([]);
      await expect(repo.markLevelComplete('kid', 1, 1000)).resolves.toBeUndefined();
      await expect(repo.markPlayedOn('kid', '2026-10-10')).resolves.toBeUndefined();

      fake.state.failGet = () => false;
      fake.state.failSet = () => true;
      await expect(repo.markLevelComplete('kid', 1, 1000)).resolves.toBeUndefined();
      await expect(repo.markPlayedOn('kid', '2026-10-10')).resolves.toBeUndefined();
    });

    it('keeps working after a failed operation: one failure does not wedge the queue', async () => {
      const repo = new AsyncStorageProgressRepo();
      fake.state.failSet = () => true;
      await repo.appendAttempt('kid', attempt(1));
      fake.state.failSet = () => false;
      await repo.appendAttempt('kid', attempt(2));
      expect((await repo.loadAttempts('kid')).map((a) => a.at)).toEqual([2]);
    });

    it('discards a stored quest whose shape cannot be trusted, rather than handing it to the runner', async () => {
      const repo = new AsyncStorageProgressRepo();
      const plan = buildSession({ sessionId: 'q1', level: 1, mastery: {}, confusions: {}, now: NOW });
      const good = { sessionId: 'q1', level: 1, plan, index: 2, stars: 0, startedAt: NOW };

      const bad: Array<[string, unknown]> = [
        ['index past the end of the plan', { ...good, index: plan.length + 1 }],
        ['negative index', { ...good, index: -1 }],
        ['fractional index', { ...good, index: 1.5 }],
        ['plan is not an array', { ...good, plan: 'nope' }],
        ['plan contains a non-task', { ...good, plan: [null] }],
        ['missing session id', { ...good, sessionId: undefined }],
        ['not an object', 42],
      ];
      for (const [label, value] of bad) {
        fake.state.data.set('soundlings/kid/activeSession', JSON.stringify(value));
        expect(await repo.loadActiveSession('kid'), label).toBeNull();
      }

      // A quest whose index equals the plan length is a finished plan, and is valid.
      fake.state.data.set('soundlings/kid/activeSession', JSON.stringify({ ...good, index: plan.length }));
      expect((await repo.loadActiveSession('kid'))?.index).toBe(plan.length);
    });

    it('treats a truncated quest as no quest', async () => {
      fake.state.data.set('soundlings/kid/activeSession', '{"sessionId":"q1","plan":[{"id":');
      expect(await new AsyncStorageProgressRepo().loadActiveSession('kid')).toBeNull();
    });
  });
});
