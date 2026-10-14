import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  applyAttempt,
  attemptsForTask,
  buildSession,
  emptyRecord,
  levelProgress,
  masteryKey,
  recordAttempts,
  recordTaskResult,
} from '@soundlings/engine';
import type { Skill } from '@soundlings/curriculum';
import type { Attempt, MasteryMap, TaskInstance } from '@soundlings/engine';
import type { ActiveSession, ProgressRepo } from './ProgressRepo';

const NOW = 1_000_000;
const HOUR = 3_600_000;

/**
 * A mastery map with real history, so plans built from it are not the trivial
 * day-one plan: several sounds mastered, a confusion on record.
 */
function veteranMastery(): MasteryMap {
  let mastery: MasteryMap = {};
  for (let s = 0; s < 6; s += 1) {
    const sessionId = `warmup-${s}`;
    const plan = buildSession({ sessionId, level: 1, mastery, confusions: {}, now: NOW + s * 24 * HOUR });
    for (const [i, task] of plan.entries()) {
      mastery = recordTaskResult(
        mastery,
        task,
        { sessionId, correct: true, scaffolded: false, latencyMs: 800, at: NOW + s * 24 * HOUR + i * 1000 },
        DEFAULT_CONFIG,
      );
    }
  }
  return mastery;
}

/**
 * A mastery map in which every Level 1 requirement is met at NOW: all seven
 * sounds in both skills, six words to read and five to spell. The same
 * construction completion.test.ts in the engine uses for its quotas.
 */
function masteredLevelOne(): MasteryMap {
  const mastery: MasteryMap = {};
  const master = (targetId: string, skill: Skill): void => {
    let record = emptyRecord(targetId, skill, DEFAULT_CONFIG);
    const base: Attempt = {
      sessionId: '', targetId, skill, taskTypeId: 'sound-hunt',
      correct: true, scaffolded: false, latencyMs: 800, weight: 1, at: NOW,
    };
    record = applyAttempt(record, { ...base, sessionId: 'one', taskTypeId: 'sound-hunt' }, DEFAULT_CONFIG);
    record = applyAttempt(record, { ...base, sessionId: 'two', taskTypeId: 'word-builder' }, DEFAULT_CONFIG);
    record = applyAttempt(record, { ...base, sessionId: 'three', taskTypeId: 'picture-match' }, DEFAULT_CONFIG);
    mastery[masteryKey(targetId, skill)] = record;
  };
  for (const g of ['s', 'a', 't', 'p', 'i', 'm', 'f']) {
    master(g, 'SOUND_ID');
    master(g, 'LETTER_SOUND');
  }
  for (const w of ['pat', 'tap', 'pit', 'sit', 'sip', 'pip']) master(w, 'BLEND_READ');
  for (const w of ['sat', 'tip', 'sap', 'mat', 'map']) master(w, 'SEGMENT_SPELL');
  return mastery;
}

function attempt(overrides: Partial<Attempt> = {}): Attempt {
  return {
    sessionId: 's1',
    targetId: 's',
    skill: 'SOUND_ID',
    taskTypeId: 'sound-hunt',
    correct: true,
    scaffolded: false,
    latencyMs: 900,
    weight: 1,
    at: NOW,
    ...overrides,
  };
}

function sessionFor(plan: TaskInstance[], index: number, stars = 0): ActiveSession {
  return { sessionId: 'q1', level: 1, plan, index, stars, startedAt: NOW };
}

/**
 * Behaviour every ProgressRepo must have, run against each implementation.
 * `fresh` returns a repository with no data.
 */
export function describeProgressRepo(name: string, fresh: () => ProgressRepo): void {
  describe(`ProgressRepo contract: ${name}`, () => {
    it('returns an empty mastery map for an unknown profile', async () => {
      expect(await fresh().loadMastery('nobody')).toEqual({});
    });

    it('round-trips a mastery map', async () => {
      const store = fresh();
      const record = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
      await store.saveMastery('kid', { 's::SOUND_ID': record });
      expect(await store.loadMastery('kid')).toEqual({ 's::SOUND_ID': record });
    });

    it('keeps profiles separate for every kind of data', async () => {
      const store = fresh();
      const plan = buildSession({ sessionId: 'q1', level: 1, mastery: {}, confusions: {}, now: NOW });
      await store.saveMastery('a', { 's::SOUND_ID': emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG) });
      await store.appendAttempt('a', attempt());
      await store.saveConfusions('a', { 'm>a': 3 });
      await store.saveActiveSession('a', sessionFor(plan, 2));
      await store.saveHighScore('a', { level: 1, stars: 3, cleanRun: true, at: NOW });

      expect(await store.loadMastery('b')).toEqual({});
      expect(await store.loadAttempts('b')).toEqual([]);
      expect(await store.loadConfusions('b')).toEqual({});
      expect(await store.loadActiveSession('b')).toBeNull();
      expect(await store.loadHighScores('b')).toEqual([]);
    });

    it('does not let one profile id shadow another that shares a prefix', async () => {
      const store = fresh();
      await store.appendAttempt('kid', attempt());
      expect(await store.loadAttempts('kid2')).toEqual([]);
      expect(await store.loadAttempts('ki')).toEqual([]);
    });

    describe('the attempt log', () => {
      it('appends attempts without overwriting earlier ones', async () => {
        const store = fresh();
        await store.appendAttempt('kid', attempt({ targetId: 's' }));
        await store.appendAttempt('kid', attempt({ targetId: 'a', correct: false, at: NOW + 1 }));
        const attempts = await store.loadAttempts('kid');
        expect(attempts.length).toBe(2);
        expect(attempts[0].targetId).toBe('s');
        expect(attempts[1].targetId).toBe('a');
      });

      it('keeps every field of an attempt, including what a wrong answer chose', async () => {
        const store = fresh();
        const wrong = attempt({ targetId: 'm', correct: false, chosen: 'a', scaffolded: true, weight: 0.5 });
        await store.appendAttempt('kid', wrong);
        expect(await store.loadAttempts('kid')).toStrictEqual([wrong]);
      });

      it('preserves insertion order across many appends', async () => {
        const store = fresh();
        for (let i = 0; i < 30; i += 1) await store.appendAttempt('kid', attempt({ at: NOW + i }));
        const attempts = await store.loadAttempts('kid');
        expect(attempts.map((a) => a.at)).toEqual(Array.from({ length: 30 }, (_, i) => NOW + i));
      });

      it('survives concurrent appends: none is lost, order is call order', async () => {
        const store = fresh();
        await Promise.all(
          Array.from({ length: 20 }, (_, i) => store.appendAttempt('kid', attempt({ at: NOW + i }))),
        );
        const attempts = await store.loadAttempts('kid');
        expect(attempts.map((a) => a.at)).toEqual(Array.from({ length: 20 }, (_, i) => NOW + i));
      });

      it('is not changed by mutating a loaded copy', async () => {
        const store = fresh();
        await store.appendAttempt('kid', attempt());
        const loaded = await store.loadAttempts('kid');
        loaded.push(attempt({ targetId: 'a' }));
        loaded[0].correct = false;
        const again = await store.loadAttempts('kid');
        expect(again.length).toBe(1);
        expect(again[0].correct).toBe(true);
      });

      it('is untouched by saving mastery or confusions', async () => {
        const store = fresh();
        await store.appendAttempt('kid', attempt());
        await store.saveMastery('kid', {});
        await store.saveConfusions('kid', {});
        expect((await store.loadAttempts('kid')).length).toBe(1);
      });

      it('lets mastery be rebuilt exactly by replaying the log through the engine', async () => {
        // This is why the log exists: if the mastery algorithm changes, history
        // is re-derived from it. So replaying what was stored must reproduce
        // what was computed live, including wrong and scaffolded answers.
        const store = fresh();
        const plan = buildSession({ sessionId: 'q1', level: 1, mastery: {}, confusions: {}, now: NOW });
        let live: MasteryMap = {};
        for (const [i, task] of plan.entries()) {
          const outcome = {
            sessionId: 'q1',
            correct: i % 3 !== 1,
            scaffolded: i % 5 === 4,
            latencyMs: 700 + i * 90,
            chosen: i % 3 === 1 ? task.choices.find((c) => c !== task.correctChoice) : undefined,
            at: NOW + i * 4000,
          };
          for (const a of attemptsForTask(task, outcome, DEFAULT_CONFIG)) await store.appendAttempt('kid', a);
          live = recordTaskResult(live, task, outcome, DEFAULT_CONFIG);
        }
        const rebuilt = recordAttempts({}, await store.loadAttempts('kid'), DEFAULT_CONFIG);
        expect(rebuilt).toStrictEqual(live);
      });
    });

    it('round-trips the confusion map', async () => {
      const store = fresh();
      await store.saveConfusions('kid', { 'm>a': 3 });
      expect(await store.loadConfusions('kid')).toEqual({ 'm>a': 3 });
    });

    describe('save and resume', () => {
      it('resumes an interrupted quest at the right task', async () => {
        const store = fresh();
        const plan = buildSession({ sessionId: 'q1', level: 1, mastery: {}, confusions: {}, now: NOW });
        await store.saveActiveSession('kid', sessionFor(plan, 4, 2));
        const resumed = await store.loadActiveSession('kid');
        expect(resumed?.index).toBe(4);
        expect(resumed?.stars).toBe(2);
        expect(resumed?.plan.length).toBe(plan.length);
        expect(resumed?.plan[4].id).toBe(plan[4].id);
      });

      it('returns the stored plan identical, field for field, across many different plans', async () => {
        // toStrictEqual, not toEqual: it distinguishes a missing key from one
        // set to undefined, and rejects a different class, so a value JSON
        // would quietly alter cannot slip through.
        const mastery = veteranMastery();
        const confusions = { 'm>a': 4, 'a>m': 1, 't>p': 2 };
        const store = fresh();
        for (let i = 0; i < 25; i += 1) {
          const plan = buildSession({
            sessionId: `q${i}`,
            level: 1,
            mastery: i % 2 === 0 ? {} : mastery,
            confusions: i % 2 === 0 ? {} : confusions,
            now: NOW + 30 * 24 * HOUR,
          });
          expect(plan.length).toBeGreaterThan(0);
          const session = { ...sessionFor(plan, i % plan.length, 1), sessionId: `q${i}` };
          await store.saveActiveSession('kid', session);
          expect(await store.loadActiveSession('kid')).toStrictEqual(session);
        }
      });

      it('does not regenerate: later mastery changes leave the stored plan alone', async () => {
        const store = fresh();
        const plan = buildSession({ sessionId: 'q1', level: 1, mastery: {}, confusions: {}, now: NOW });
        await store.saveActiveSession('kid', sessionFor(plan, 3));

        // Meanwhile the child has learned things, which would change a rebuilt plan.
        const learned = veteranMastery();
        await store.saveMastery('kid', learned);
        await store.saveConfusions('kid', { 'm>a': 9 });
        const rebuilt = buildSession({
          sessionId: 'q1',
          level: 1,
          mastery: learned,
          confusions: { 'm>a': 9 },
          now: NOW + 30 * 24 * HOUR,
        });
        expect(rebuilt).not.toStrictEqual(plan);

        const resumed = await store.loadActiveSession('kid');
        expect(resumed?.plan).toStrictEqual(plan);
      });

      it('is not changed by mutating a loaded session', async () => {
        const store = fresh();
        const plan = buildSession({ sessionId: 'q1', level: 1, mastery: {}, confusions: {}, now: NOW });
        await store.saveActiveSession('kid', sessionFor(plan, 2));
        const loaded = await store.loadActiveSession('kid');
        loaded?.plan.reverse();
        if (loaded) loaded.index = 0;
        const again = await store.loadActiveSession('kid');
        expect(again?.index).toBe(2);
        expect(again?.plan).toStrictEqual(plan);
      });

      it('is not changed by mutating the session after saving it', async () => {
        const store = fresh();
        const plan = buildSession({ sessionId: 'q1', level: 1, mastery: {}, confusions: {}, now: NOW });
        const planLength = plan.length;
        const firstId = plan[0].id;
        const session = sessionFor(plan, 2);
        await store.saveActiveSession('kid', session);
        session.index = 9;
        session.plan.length = 0;
        const stored = await store.loadActiveSession('kid');
        expect(stored?.index).toBe(2);
        expect(stored?.plan.length).toBe(planLength);
        expect(stored?.plan[0].id).toBe(firstId);
      });

      it('after an interruption, never re-asks a task already answered, wrong ones included', async () => {
        // The quest runner's loop, as the runner will drive it: after every
        // completed task, record the evidence and advance the saved index.
        const store = fresh();
        const plan = buildSession({ sessionId: 'q1', level: 1, mastery: {}, confusions: {}, now: NOW });
        const asked: string[] = [];
        const wrongAt = new Set([1, 3]);

        const play = async (from: number, until: number) => {
          for (let i = from; i < until; i += 1) {
            const task = plan[i];
            asked.push(task.id);
            const correct = !wrongAt.has(i);
            for (const a of attemptsForTask(
              task,
              { sessionId: 'q1', correct, scaffolded: false, latencyMs: 1000, at: NOW + i },
              DEFAULT_CONFIG,
            )) {
              await store.appendAttempt('kid', a);
            }
            await store.saveActiveSession('kid', sessionFor(plan, i + 1, i));
          }
        };

        await play(0, 5); // tasks 1 and 3 are answered wrongly, then the battery dies
        const resumed = await store.loadActiveSession('kid');
        expect(resumed).not.toBeNull();
        await play(resumed?.index ?? 0, resumed?.plan.length ?? 0);

        expect(asked).toEqual(plan.map((t) => t.id)); // each once, in order, none repeated
        expect(new Set(asked).size).toBe(plan.length);
        expect((await store.loadAttempts('kid')).filter((a) => !a.correct).length).toBeGreaterThanOrEqual(2);
      });

      it('keeps the latest progress when it is saved after every task', async () => {
        const store = fresh();
        const plan = buildSession({ sessionId: 'q1', level: 1, mastery: {}, confusions: {}, now: NOW });
        for (let i = 0; i <= plan.length; i += 1) {
          await store.saveActiveSession('kid', sessionFor(plan, i, i));
          expect((await store.loadActiveSession('kid'))?.index).toBe(i);
        }
      });

      it('clears the active session when a quest finishes', async () => {
        const store = fresh();
        await store.saveActiveSession('kid', sessionFor([], 0));
        await store.saveActiveSession('kid', null);
        expect(await store.loadActiveSession('kid')).toBeNull();
      });
    });

    describe('high scores', () => {
      it('keeps only the best score per level', async () => {
        const store = fresh();
        await store.saveHighScore('kid', { level: 1, stars: 2, cleanRun: false, at: NOW });
        await store.saveHighScore('kid', { level: 1, stars: 3, cleanRun: true, at: NOW + 1 });
        await store.saveHighScore('kid', { level: 1, stars: 1, cleanRun: false, at: NOW + 2 });
        const scores = await store.loadHighScores('kid');
        expect(scores.length).toBe(1);
        expect(scores[0].stars).toBe(3);
        expect(scores[0].cleanRun).toBe(true);
      });

      it('prefers a clean run over an equal-star run that was not', async () => {
        const store = fresh();
        await store.saveHighScore('kid', { level: 1, stars: 3, cleanRun: false, at: NOW });
        await store.saveHighScore('kid', { level: 1, stars: 3, cleanRun: true, at: NOW + 1 });
        expect((await store.loadHighScores('kid'))[0].cleanRun).toBe(true);
      });

      it('keeps separate levels separate', async () => {
        const store = fresh();
        await store.saveHighScore('kid', { level: 1, stars: 3, cleanRun: true, at: NOW });
        await store.saveHighScore('kid', { level: 2, stars: 1, cleanRun: false, at: NOW + 1 });
        const scores = await store.loadHighScores('kid');
        expect(scores.map((s) => s.level).sort()).toEqual([1, 2]);
      });
    });

    describe('level completions', () => {
      it('has no completed levels for a new child', async () => {
        const store = fresh();
        expect(await store.loadCompletions('kid')).toEqual({});
      });

      it('latches a level completion with the time it happened', async () => {
        const store = fresh();
        await store.markLevelComplete('kid', 1, 1000);
        expect(await store.loadCompletions('kid')).toEqual({ 1: 1000 });
      });

      it('keeps the FIRST completion time, not the most recent', async () => {
        // The badge is "you did this", not "you did this most recently".
        const store = fresh();
        await store.markLevelComplete('kid', 1, 1000);
        await store.markLevelComplete('kid', 1, 5000);
        expect(await store.loadCompletions('kid')).toEqual({ 1: 1000 });
      });

      it('keeps the first time even when an earlier-stamped call arrives later', async () => {
        // "First" means first latched, not smallest number: a clock that moved
        // backwards must not be able to rewrite when the child did it.
        const store = fresh();
        await store.markLevelComplete('kid', 1, 5000);
        await store.markLevelComplete('kid', 1, 1000);
        expect(await store.loadCompletions('kid')).toEqual({ 1: 5000 });
      });

      it('keeps the first of two simultaneous completions: call order, none lost', async () => {
        const store = fresh();
        await Promise.all([
          store.markLevelComplete('kid', 1, 1000),
          store.markLevelComplete('kid', 1, 5000),
          store.markLevelComplete('kid', 2, 7000),
        ]);
        expect(await store.loadCompletions('kid')).toEqual({ 1: 1000, 2: 7000 });
      });

      describe('mergeCompletion (sync)', () => {
        it('latches a level that was not latched', async () => {
          const store = fresh();
          await store.mergeCompletion('kid', 1, 3000);
          expect(await store.loadCompletions('kid')).toEqual({ 1: 3000 });
        });

        it('takes an EARLIER time than the one stored: another device finished first', async () => {
          const store = fresh();
          await store.markLevelComplete('kid', 1, 5000);
          await store.mergeCompletion('kid', 1, 2000);
          expect(await store.loadCompletions('kid')).toEqual({ 1: 2000 });
        });

        it('never moves a time LATER', async () => {
          const store = fresh();
          await store.markLevelComplete('kid', 1, 2000);
          await store.mergeCompletion('kid', 1, 9000);
          expect(await store.loadCompletions('kid')).toEqual({ 1: 2000 });
        });

        it('leaves other levels and other children alone', async () => {
          const store = fresh();
          await store.markLevelComplete('kid', 1, 5000);
          await store.markLevelComplete('kid', 2, 6000);
          await store.markLevelComplete('other', 1, 7000);
          await store.mergeCompletion('kid', 1, 1000);
          expect(await store.loadCompletions('kid')).toEqual({ 1: 1000, 2: 6000 });
          expect(await store.loadCompletions('other')).toEqual({ 1: 7000 });
        });
      });

      it('latches levels independently, and a later level does not disturb an earlier', async () => {
        const store = fresh();
        await store.markLevelComplete('kid', 1, 1000);
        await store.markLevelComplete('kid', 2, 2000);
        expect(await store.loadCompletions('kid')).toEqual({ 1: 1000, 2: 2000 });
      });

      it('reads back with the level as a number key, whatever the storage does to it', async () => {
        const store = fresh();
        await store.markLevelComplete('kid', 1, 1000);
        expect((await store.loadCompletions('kid'))[1]).toBe(1000);
      });

      it('keeps completions per profile', async () => {
        const store = fresh();
        await store.markLevelComplete('a', 1, 1000);
        expect(await store.loadCompletions('b')).toEqual({});
        expect(await store.loadCompletions('')).toEqual({});
      });

      it('does not let one profile id shadow another that shares a prefix', async () => {
        const store = fresh();
        await store.markLevelComplete('kid', 1, 1000);
        expect(await store.loadCompletions('kid2')).toEqual({});
        expect(await store.loadCompletions('ki')).toEqual({});
      });

      it('is not changed by mutating a loaded copy', async () => {
        const store = fresh();
        await store.markLevelComplete('kid', 1, 1000);
        const loaded = await store.loadCompletions('kid');
        loaded[1] = 99;
        loaded[2] = 99;
        expect(await store.loadCompletions('kid')).toEqual({ 1: 1000 });
      });

      it('never un-completes a level, however much else is saved afterwards', async () => {
        // The badge is independent of everything the live calculation reads.
        // Resetting or replacing mastery, clearing a quest, adding attempts and
        // scores must all leave it alone.
        const store = fresh();
        await store.markLevelComplete('kid', 1, 1000);
        await store.saveMastery('kid', {});
        await store.saveConfusions('kid', {});
        await store.appendAttempt('kid', attempt({ correct: false }));
        await store.saveActiveSession('kid', sessionFor([], 0));
        await store.saveActiveSession('kid', null);
        await store.saveHighScore('kid', { level: 1, stars: 1, cleanRun: false, at: NOW });
        await store.markPlayedOn('kid', '2026-10-10');
        expect(await store.loadCompletions('kid')).toEqual({ 1: 1000 });
      });

      it('keeps a level complete after the live calculation says it is not', async () => {
        // The reason this exists. Strength decays, so a level that was complete
        // reads as incomplete later; the latch has to outlive that.
        const store = fresh();
        const mastery = masteredLevelOne();
        expect(levelProgress(1, mastery, NOW).complete).toBe(true);
        await store.saveMastery('kid', mastery);
        await store.markLevelComplete('kid', 1, NOW);

        const muchLater = NOW + 5000 * HOUR;
        expect(levelProgress(1, await store.loadMastery('kid'), muchLater).complete).toBe(false);
        expect(await store.loadCompletions('kid')).toEqual({ 1: NOW });
      });
    });

    describe('days played', () => {
      it('has no played dates for a new child', async () => {
        const store = fresh();
        expect(await store.loadPlayedDates('kid')).toEqual([]);
      });

      it('records each day played once', async () => {
        const store = fresh();
        await store.markPlayedOn('kid', '2026-10-10');
        await store.markPlayedOn('kid', '2026-10-10');
        await store.markPlayedOn('kid', '2026-10-11');
        expect(await store.loadPlayedDates('kid')).toEqual(['2026-10-10', '2026-10-11']);
      });

      it('returns played dates in order whatever order they arrive in', async () => {
        const store = fresh();
        await store.markPlayedOn('kid', '2026-10-11');
        await store.markPlayedOn('kid', '2026-10-09');
        await store.markPlayedOn('kid', '2026-10-10');
        expect(await store.loadPlayedDates('kid')).toEqual(['2026-10-09', '2026-10-10', '2026-10-11']);
      });

      it('orders across month and year boundaries', async () => {
        const store = fresh();
        for (const d of ['2027-01-01', '2026-12-31', '2026-11-02', '2026-10-31']) await store.markPlayedOn('kid', d);
        expect(await store.loadPlayedDates('kid')).toEqual(['2026-10-31', '2026-11-02', '2026-12-31', '2027-01-01']);
      });

      it('keeps every day when several are recorded at once, each once', async () => {
        const store = fresh();
        await Promise.all(
          ['2026-10-03', '2026-10-01', '2026-10-03', '2026-10-02', '2026-10-01'].map((d) => store.markPlayedOn('kid', d)),
        );
        expect(await store.loadPlayedDates('kid')).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
      });

      it('keeps played dates per profile', async () => {
        const store = fresh();
        await store.markPlayedOn('a', '2026-10-10');
        expect(await store.loadPlayedDates('b')).toEqual([]);
        expect(await store.loadPlayedDates('a2')).toEqual([]);
      });

      it('is not changed by mutating a loaded copy', async () => {
        const store = fresh();
        await store.markPlayedOn('kid', '2026-10-10');
        const loaded = await store.loadPlayedDates('kid');
        loaded.push('2030-01-01');
        loaded[0] = 'tampered';
        expect(await store.loadPlayedDates('kid')).toEqual(['2026-10-10']);
      });

      it('does not disturb completions, which live beside it', async () => {
        const store = fresh();
        await Promise.all([store.markPlayedOn('kid', '2026-10-10'), store.markLevelComplete('kid', 1, 1000)]);
        expect(await store.loadPlayedDates('kid')).toEqual(['2026-10-10']);
        expect(await store.loadCompletions('kid')).toEqual({ 1: 1000 });
      });
    });

    describe('clearing a profile', () => {
      async function fillEverything(store: ProgressRepo, id: string): Promise<void> {
        await store.saveMastery(id, { 's::SOUND_ID': emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG) });
        await store.appendAttempt(id, attempt());
        await store.saveConfusions(id, { 'm>a': 1 });
        await store.saveHighScore(id, { level: 1, stars: 3, cleanRun: true, at: 1 });
        await store.markLevelComplete(id, 1, 1);
        await store.markPlayedOn(id, '2026-10-10');
        await store.saveActiveSession(id, { sessionId: 's1', level: 1, plan: [], index: 0, stars: 0, startedAt: 1 });
      }

      it('clears every trace of one profile', async () => {
        const store = fresh();
        await fillEverything(store, 'kid');

        await store.clear('kid');

        expect(await store.loadMastery('kid')).toEqual({});
        expect(await store.loadAttempts('kid')).toEqual([]);
        expect(await store.loadConfusions('kid')).toEqual({});
        expect(await store.loadHighScores('kid')).toEqual([]);
        expect(await store.loadCompletions('kid')).toEqual({});
        expect(await store.loadPlayedDates('kid')).toEqual([]);
        expect(await store.loadActiveSession('kid')).toBeNull();
      });

      it('leaves other profiles untouched when clearing one', async () => {
        const store = fresh();
        await store.saveConfusions('a', { 'm>a': 1 });
        await store.saveConfusions('b', { 'm>a': 2 });
        await store.clear('a');
        expect(await store.loadConfusions('b')).toEqual({ 'm>a': 2 });
      });

      it('leaves a profile whose id merely begins with the cleared id completely untouched', async () => {
        const store = fresh();
        await fillEverything(store, 'kid');
        await fillEverything(store, 'kid2');
        await fillEverything(store, 'kid-2');

        await store.clear('kid');

        for (const other of ['kid2', 'kid-2']) {
          expect(Object.keys(await store.loadMastery(other))).toEqual(['s::SOUND_ID']);
          expect(await store.loadAttempts(other)).toHaveLength(1);
          expect(await store.loadConfusions(other)).toEqual({ 'm>a': 1 });
          expect(await store.loadHighScores(other)).toHaveLength(1);
          expect(await store.loadCompletions(other)).toEqual({ 1: 1 });
          expect(await store.loadPlayedDates(other)).toEqual(['2026-10-10']);
          expect(await store.loadActiveSession(other)).not.toBeNull();
        }
      });

      it('leaves a profile whose id ends with the cleared id untouched', async () => {
        const store = fresh();
        await fillEverything(store, 'kid');
        await fillEverything(store, 'big-kid');
        await store.clear('kid');
        expect(await store.loadAttempts('big-kid')).toHaveLength(1);
        expect(await store.loadCompletions('big-kid')).toEqual({ 1: 1 });
      });

      it('is harmless for a profile that has no data, and when repeated', async () => {
        const store = fresh();
        await store.clear('nobody');
        await fillEverything(store, 'kid');
        await store.clear('kid');
        await store.clear('kid');
        expect(await store.loadAttempts('kid')).toEqual([]);
      });

      it('lets a profile start again from nothing after being cleared', async () => {
        const store = fresh();
        await fillEverything(store, 'kid');
        await store.clear('kid');
        await store.appendAttempt('kid', attempt());
        await store.markLevelComplete('kid', 1, 50);
        expect(await store.loadAttempts('kid')).toHaveLength(1);
        expect(await store.loadCompletions('kid')).toEqual({ 1: 50 });
      });

      it('waits for writes already queued, so a late append cannot resurrect cleared data', async () => {
        const store = fresh();
        await fillEverything(store, 'kid');
        const pending = store.appendAttempt('kid', attempt());
        await store.clear('kid');
        await pending;
        expect(await store.loadAttempts('kid')).toEqual([]);
      });
    });
  });
}
