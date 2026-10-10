import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  attemptsForTask,
  buildSession,
  emptyRecord,
  recordAttempts,
  recordTaskResult,
} from '@soundlings/engine';
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
  });
}
