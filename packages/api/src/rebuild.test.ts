import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  attemptsForTask,
  buildSession,
  levelProgress,
  localDateString,
  makeRng,
  recordTaskResult,
  starsFor,
} from '@soundlings/engine';
import type { Attempt, ConfusionMap, MasteryMap, TaskInstance, TaskOutcome } from '@soundlings/engine';
import { newUuid, stampIds } from './ids';
import { rebuildFrom } from './rebuild';

const CONFIG = DEFAULT_CONFIG;
const HOUR = 3_600_000;
const DAY0 = Date.UTC(2026, 9, 1, 9, 0, 0);

interface Played {
  log: Attempt[];
  mastery: MasteryMap;
  /** Attempts recorded per quest, so a test can look at one session on its own. */
  bySession: Map<string, Attempt[]>;
}

/**
 * Plays real quests the way the quest runner does: a plan from buildSession,
 * each outcome folded into the mastery map by recordTaskResult, the attempts
 * for that same outcome appended to the log by attemptsForTask. The log and the
 * map are produced by the same two calls the app makes, so a rebuild that
 * matches them matches the game.
 *
 * The child is varied on purpose: some answers clean and fast, some slow, some
 * right only after help, some wrong with a retry, some shown the answer. A
 * replay that only ever saw clean successes would prove very little.
 */
function playQuests(options: {
  quests: number;
  seed: number;
  stamp?: boolean;
  questGapHours?: number;
  /** Chance of a task going anything other than cleanly, per quest. Varied by default. */
  slipRates?: number[];
}): Played {
  const rng = makeRng(options.seed);
  let mastery: MasteryMap = {};
  const confusions: ConfusionMap = {};
  const log: Attempt[] = [];
  const bySession = new Map<string, Attempt[]>();
  let now = DAY0;

  for (let q = 1; q <= options.quests; q += 1) {
    const sessionId = `kid-${now}`;
    const plan = buildSession({ sessionId, level: 1, mastery, confusions, now, config: CONFIG });
    bySession.set(sessionId, []);

    for (const task of plan) {
      now += 2500 + Math.floor(rng() * 9000);
      const slip = options.slipRates?.[q - 1] ?? 0.45;
      const roll = rng();
      const base = { sessionId, latencyMs: 800 + Math.floor(rng() * 9000), at: now };
      const wrong = task.choices.find((c) => c !== task.correctChoice) ?? 'zzz';
      const outcomes: TaskOutcome[] = [];

      // Below `slip` the task goes some way other than cleanly; which way is the rest of the roll.
      const how = slip === 0 ? 1 : roll / slip;
      if (roll >= slip) {
        outcomes.push({ ...base, correct: true, scaffolded: false });
      } else if (how < 0.33) {
        // Right only once the choices were narrowed: counts at half weight.
        outcomes.push({ ...base, correct: true, scaffolded: false, aided: true });
      } else if (how < 0.66) {
        // One slip, then right.
        outcomes.push({ ...base, correct: false, scaffolded: false, chosen: wrong });
        outcomes.push({ ...base, at: now + 1500, correct: true, scaffolded: false });
      } else {
        // Two slips and the answer shown.
        outcomes.push({ ...base, correct: false, scaffolded: false, chosen: wrong });
        outcomes.push({ ...base, at: now + 1500, correct: true, scaffolded: true });
      }

      for (const outcome of outcomes) {
        mastery = recordTaskResult(mastery, task as TaskInstance, outcome, CONFIG);
        for (const attempt of attemptsForTask(task, outcome, CONFIG)) {
          const recorded = options.stamp === false ? attempt : { ...attempt, id: newUuid(rng) };
          log.push(recorded);
          bySession.get(sessionId)?.push(recorded);
        }
        now = Math.max(now, outcome.at);
      }
    }
    now += (options.questGapHours ?? 20) * HOUR;
  }
  return { log, mastery, bySession };
}

function shuffled<T>(items: readonly T[], seed: number): T[] {
  const rng = makeRng(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

describe('rebuildFrom: the log is enough', () => {
  it('reproduces the mastery the live game produced, record for record', () => {
    const played = playQuests({ quests: 8, seed: 11 });
    // Guard against a vacuous pass: a replay of an empty map would also be equal.
    expect(played.log.length).toBeGreaterThan(100);
    expect(Object.keys(played.mastery).length).toBeGreaterThan(10);

    const rebuilt = rebuildFrom(played.log, CONFIG);
    expect(rebuilt.mastery).toEqual(played.mastery);
  });

  it('reproduces mastery across many different children', () => {
    for (let seed = 1; seed <= 12; seed += 1) {
      const played = playQuests({ quests: 5, seed });
      expect(rebuildFrom(played.log, CONFIG).mastery, `seed ${seed}`).toEqual(played.mastery);
    }
  });

  it('reproduces what the island and trophies read: level progress and creatures', () => {
    const played = playQuests({ quests: 10, seed: 3 });
    const at = DAY0 + 11 * 24 * HOUR;
    const live = levelProgress(1, played.mastery, at, CONFIG);
    const rebuilt = levelProgress(1, rebuildFrom(played.log, CONFIG).mastery, at, CONFIG);
    expect(rebuilt).toEqual(live);
  });
});

describe('rebuildFrom: a log arriving from two devices', () => {
  it('gives the same result however the attempts arrive', () => {
    const { log, mastery } = playQuests({ quests: 6, seed: 21 });
    for (const seed of [1, 2, 3]) {
      expect(rebuildFrom(shuffled(log, seed), CONFIG).mastery, `shuffle ${seed}`).toEqual(mastery);
    }
    expect(rebuildFrom([...log].reverse(), CONFIG).mastery).toEqual(mastery);
  });

  it('counts a duplicated attempt id once, not twice', () => {
    const { log, mastery } = playQuests({ quests: 4, seed: 5 });
    const doubled = [...log, ...log];
    expect(rebuildFrom(doubled, CONFIG).mastery).toEqual(mastery);
    // And a single duplicated attempt, to make the point in the small.
    const one = log.find((a) => a.correct && !a.scaffolded && a.weight === 1);
    if (!one) throw new Error('fixture has no clean attempt');
    const withOneRepeat = rebuildFrom([...log, one], CONFIG).mastery;
    expect(withOneRepeat).toEqual(mastery);
  });

  it('treats an attempt that has no id as its own, since it cannot be shown to repeat', () => {
    const { log } = playQuests({ quests: 1, seed: 8, stamp: false });
    const once = rebuildFrom(log, CONFIG).mastery;
    const twice = rebuildFrom([...log, ...log], CONFIG).mastery;
    expect(twice).not.toEqual(once);
  });

  it('is the same after stamping ids onto a log that had none', () => {
    const { log, mastery } = playQuests({ quests: 5, seed: 9, stamp: false });
    expect(rebuildFrom(stampIds('kid', log), CONFIG).mastery).toEqual(mastery);
  });

  it('merges two devices that each played alone into what one device playing both would hold', () => {
    const a = playQuests({ quests: 3, seed: 31 });
    // A second device's quests happen after the first's, on later days.
    const b = playQuests({ quests: 3, seed: 32 });
    const shifted = b.log.map((x) => ({ ...x, at: x.at + 10 * 24 * HOUR, sessionId: `b-${x.sessionId}` }));
    const together = rebuildFrom([...a.log, ...shifted], CONFIG).mastery;
    const jumbled = rebuildFrom(shuffled([...shifted, ...a.log], 4), CONFIG).mastery;
    expect(jumbled).toEqual(together);
    // Both children's work is in there.
    expect(Object.keys(together).length).toBeGreaterThanOrEqual(Object.keys(a.mastery).length);
  });
});

describe('rebuildFrom: played dates', () => {
  it('comes from attempt timestamps in the local zone, as localDateString reads them', () => {
    const { log } = playQuests({ quests: 4, seed: 2, questGapHours: 26 });
    const expected = [...new Set(log.map((a) => localDateString(a.at)))].sort();
    expect(expected.length).toBeGreaterThan(1);
    expect(rebuildFrom(log, CONFIG).playedDates).toEqual(expected);
  });

  it('lists each day once, oldest first', () => {
    const { log } = playQuests({ quests: 3, seed: 6 });
    const dates = rebuildFrom(shuffled(log, 9), CONFIG).playedDates;
    expect(dates).toEqual([...new Set(dates)].sort());
  });
});

describe('rebuildFrom: high scores', () => {
  it('derives stars per finished session with the quest runner\'s own thresholds', () => {
    const { log, bySession } = playQuests({ quests: 4, seed: 14, slipRates: [0, 0.07, 0.25, 0.7] });
    const { highScores } = rebuildFrom(shuffled(log, 7), CONFIG);

    const sessions = [...bySession.values()];
    expect(highScores).toHaveLength(sessions.length);
    // Oldest first, and each session scored by an oracle that does not share the implementation.
    expect(highScores.map((s) => s.stars)).toEqual(sessions.map(starsOf));
    expect(highScores.map((s) => s.at)).toEqual(sessions.map((a) => Math.max(...a.map((x) => x.at))));
    expect(highScores.every((s) => s.level === 1)).toBe(true);
    // Not all the same, or this would pass for a constant.
    expect(new Set(highScores.map((s) => s.stars)).size).toBeGreaterThan(1);
  });

  it('never invents a score from a quest that was not finished', () => {
    const { log } = playQuests({ quests: 1, seed: 17 });
    // Stop after the fifth task the child completed.
    let completed = 0;
    const partial: Attempt[] = [];
    for (const attempt of log) {
      if (completed >= 5) break;
      partial.push(attempt);
      if (attempt.choiceCount !== undefined && attempt.correct) completed += 1;
    }
    expect(completed).toBe(5);
    expect(rebuildFrom(partial, CONFIG).highScores).toEqual([]);
  });

  it('calls a flawless finished quest a clean run, and one with a slip not', () => {
    const clean = flawlessQuest();
    expect(rebuildFrom(clean, CONFIG).highScores).toEqual([
      { level: 1, stars: 3, cleanRun: true, at: clean[clean.length - 1].at },
    ]);

    const slipped = flawlessQuest();
    const victim = slipped.findIndex((a) => a.choiceCount !== undefined);
    slipped[victim] = { ...slipped[victim], correct: false };
    const [score] = rebuildFrom(slipped, CONFIG).highScores;
    expect(score.stars).toBe(3); // one slip still earns three
    expect(score.cleanRun).toBe(false);
  });

  it('does not call a quest clean when the child was shown an answer', () => {
    const quest = flawlessQuest();
    const victim = quest.findIndex((a) => a.choiceCount !== undefined);
    quest[victim] = { ...quest[victim], scaffolded: true };
    const [score] = rebuildFrom(quest, CONFIG).highScores;
    expect(score.cleanRun).toBe(false);
    expect(score.stars).toBe(2);
  });

  it('does not charge a word task\'s mistake once per letter in the word', () => {
    // A wrong word also gives its letters (s, a, t) secondary credit. The error is one task's.
    const quest = flawlessQuest();
    const sessionId = quest[0].sessionId;
    const word: TaskInstance = {
      id: 'w',
      taskTypeId: 'word-pick',
      skill: 'BLEND_READ',
      primaryTarget: 'sat',
      secondaryTargets: ['s', 'a', 't'],
      choices: ['sat', 'sit'],
      correctChoice: 'sat',
      band: 'focus',
      anchor: false,
      difficulty: 2,
      seed: 1,
    };
    const at = quest[quest.length - 1].at + 3000;
    const wrong = attemptsForTask(word, { sessionId, correct: false, scaffolded: false, latencyMs: 900, chosen: 'sit', at }, CONFIG);
    expect(wrong.length).toBe(4); // the word and its three letters
    const answered = attemptsForTask(word, { sessionId, correct: true, scaffolded: false, latencyMs: 900, at: at + 2000 }, CONFIG);
    const withIds = [...wrong, ...answered].map((a) => ({ ...a, id: newUuid() }));

    const [score] = rebuildFrom([...quest, ...withIds], CONFIG).highScores;
    expect(score.stars).toBe(3); // one error is three stars; four would be two
    expect(score.cleanRun).toBe(false);
  });
});

describe('rebuildFrom: confusions', () => {
  it('counts the wrong picks recorded on primary attempts', () => {
    const { log } = playQuests({ quests: 5, seed: 40 });
    const expected: ConfusionMap = {};
    for (const a of log) {
      if (a.chosen === undefined) continue;
      const key = `${a.targetId}>${a.chosen}`;
      expected[key] = (expected[key] ?? 0) + 1;
    }
    expect(Object.keys(expected).length).toBeGreaterThan(0);
    expect(rebuildFrom(log, CONFIG).confusions).toEqual(expected);
  });
});

describe('rebuildFrom: confusions are the task\'s own', () => {
  it('ignores a wrong pick recorded against credit given to a letter inside a word', () => {
    const [first] = flawlessQuest();
    const incidental: Attempt = {
      ...first,
      id: newUuid(),
      skill: 'SOUND_ID',
      taskTypeId: 'word-pick',
      correct: false,
      weight: 0.5,
      chosen: 'a',
      choiceCount: undefined,
    };
    expect(rebuildFrom([incidental], CONFIG).confusions).toEqual({});
  });
});

describe('rebuildFrom: nothing to rebuild', () => {
  it('rebuilds an empty log to empty state without special-casing', () => {
    expect(rebuildFrom([], CONFIG)).toEqual({ mastery: {}, confusions: {}, playedDates: [], highScores: [] });
  });

  it('does not mutate the log it is given', () => {
    const { log } = playQuests({ quests: 2, seed: 50 });
    const before = JSON.stringify(log);
    rebuildFrom(shuffled(log, 3), CONFIG);
    rebuildFrom(log, CONFIG);
    expect(JSON.stringify(log)).toBe(before);
  });
});

// --- helpers ---------------------------------------------------------------------

function starsOf(attempts: readonly Attempt[]): number {
  const primary = attempts.filter((a) => a.choiceCount !== undefined);
  return starsFor({
    errors: primary.filter((a) => !a.correct).length,
    scaffolds: primary.filter((a) => a.scaffolded).length,
  });
}

/** One finished 14-task quest with every task answered cleanly first time. */
function flawlessQuest(): Attempt[] {
  const sessionId = 'kid-flawless';
  let mastery: MasteryMap = {};
  const plan = buildSession({ sessionId, level: 1, mastery, confusions: {}, now: DAY0, config: CONFIG });
  const log: Attempt[] = [];
  let at = DAY0;
  for (const task of plan) {
    at += 3000;
    const outcome: TaskOutcome = { sessionId, correct: true, scaffolded: false, latencyMs: 1500, at };
    mastery = recordTaskResult(mastery, task, outcome, CONFIG);
    for (const attempt of attemptsForTask(task, outcome, CONFIG)) log.push({ ...attempt, id: newUuid() });
  }
  return log;
}
