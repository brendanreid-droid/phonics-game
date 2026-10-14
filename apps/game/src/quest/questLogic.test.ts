import { describe, expect, it } from 'vitest';
import { getWord, wordsForLevel } from '@soundlings/curriculum';
import { DEFAULT_CONFIG, TASK_TYPES, applyAttempt, buildSession, emptyRecord, masteryKey } from '@soundlings/engine';
import type { Attempt, MasteryMap, TaskInstance } from '@soundlings/engine';
import {
  MIN_TAIL,
  canResume,
  applyClosingSwap,
  confusionFor,
  creatureIdsFromParam,
  dimmedFor as dimmedForFromLogic,
  isPlayablePlan,
  judgeAnswer,
  noteOutcome,
  preloadKeysFor,
  replanRemaining,
  replayQuest,
  starsFor,
  starsFromParam,
} from './questLogic';
import { dimmedFor } from './dimming';
import type { QuestOutcomes } from './questLogic';

const NOW = 1_000_000;

/**
 * Both sound skills for each letter, answered cleanly `count` times across that many sessions on
 * the given task types in turn. Three answers on two or more games is mastered; two on one is
 * merely heard, which is all it takes to unlock words (invariant 5a).
 */
function masteredFor(
  ids: readonly string[],
  type: string | readonly string[] = ['sound-hunt', 'sound-singer', 'word-builder', 'picture-start', 'picture-match'],
  count = 3,
): MasteryMap {
  const types = typeof type === 'string' ? [type] : type;
  const map: MasteryMap = {};
  for (const id of ids) {
    for (const skill of ['SOUND_ID', 'LETTER_SOUND'] as const) {
      let record = emptyRecord(id, skill, DEFAULT_CONFIG);
      for (let i = 0; i < count; i += 1) {
        record = applyAttempt(record, {
          sessionId: `earlier-${i}`, targetId: id, skill, taskTypeId: types[i % types.length],
          correct: true, scaffolded: false, latencyMs: 900, weight: 1, at: NOW - 1000,
        }, DEFAULT_CONFIG);
      }
      map[masteryKey(id, skill)] = record;
    }
  }
  return map;
}

function plan(sessionId = 'q') {
  return buildSession({ sessionId, level: 1, mastery: {}, confusions: {}, now: NOW });
}

function task(overrides: Partial<TaskInstance> = {}): TaskInstance {
  return {
    id: 'x',
    taskTypeId: 'sound-hunt',
    skill: 'SOUND_ID',
    primaryTarget: 's',
    secondaryTargets: [],
    choices: ['s', 'a', 't'],
    correctChoice: 's',
    band: 'focus',
    anchor: false,
    difficulty: 1,
    seed: 1,
    ...overrides,
  };
}

describe('judgeAnswer', () => {
  it('accepts the correct choice, for every task in a real plan', () => {
    for (const t of plan()) expect(judgeAnswer(t, t.correctChoice).correct, t.id).toBe(true);
  });

  it('rejects every wrong choice and reports what was chosen', () => {
    for (const t of plan().filter((p) => p.skill !== 'SEGMENT_SPELL')) {
      for (const wrong of t.choices.filter((c) => c !== t.correctChoice)) {
        const result = judgeAnswer(t, wrong);
        expect(result.correct, `${t.id} / ${wrong}`).toBe(false);
        expect(result.chosen).toBe(wrong);
      }
    }
  });

  it('accepts a spelling built from the word letters, for every Level 1 word', () => {
    // The assembled answer is the graphemes joined; correctChoice is the word id.
    // If the two ever disagree, a child who spelled a word perfectly is told no.
    for (const word of wordsForLevel(1)) {
      const spelling = task({ skill: 'SEGMENT_SPELL', taskTypeId: 'word-builder', correctChoice: word.id });
      expect(judgeAnswer(spelling, word.graphemes.join('')).correct, word.id).toBe(true);
    }
  });

  it('rejects a spelling that uses the right letters in the wrong order', () => {
    const spelling = task({ skill: 'SEGMENT_SPELL', taskTypeId: 'word-builder', correctChoice: 'pat' });
    expect(judgeAnswer(spelling, 'tap').correct).toBe(false);
    expect(judgeAnswer(spelling, 'pa').correct).toBe(false);
    expect(judgeAnswer(spelling, '').correct).toBe(false);
  });

  it('compares case-insensitively, defensively', () => {
    const spelling = task({ skill: 'SEGMENT_SPELL', correctChoice: 'sam' });
    expect(judgeAnswer(spelling, 'SAM').correct).toBe(true);
    expect(getWord('sam').text).toBe('Sam');
  });
});

describe('confusionFor', () => {
  it('remembers the wrong pick on a sound or picture task', () => {
    expect(confusionFor(task(), judgeAnswer(task(), 'a'))).toBe('a');
  });

  it('remembers nothing for a right answer', () => {
    expect(confusionFor(task(), judgeAnswer(task(), 's'))).toBeUndefined();
  });

  it('remembers nothing for a mis-built word, which is not one alternative mistaken for another', () => {
    const spelling = task({ skill: 'SEGMENT_SPELL', correctChoice: 'sat' });
    expect(confusionFor(spelling, judgeAnswer(spelling, 'sta'))).toBeUndefined();
  });
});

describe('starsFor', () => {
  it('awards three stars for a flawless quest', () => {
    expect(starsFor({ errors: 0, scaffolds: 0 })).toBe(3);
  });

  it('still awards three stars for a single slip', () => {
    expect(starsFor({ errors: 1, scaffolds: 0 })).toBe(3);
  });

  it('awards two stars for a few mistakes: three errors in fourteen tasks is a good session', () => {
    expect(starsFor({ errors: 2, scaffolds: 0 })).toBe(2);
    expect(starsFor({ errors: 3, scaffolds: 0 })).toBe(2);
    expect(starsFor({ errors: 4, scaffolds: 0 })).toBe(2);
    expect(starsFor({ errors: 3, scaffolds: 1 })).toBe(2);
    expect(starsFor({ errors: 4, scaffolds: 2 })).toBe(2);
  });

  it('awards one star beyond that', () => {
    expect(starsFor({ errors: 5, scaffolds: 0 })).toBe(1);
    expect(starsFor({ errors: 0, scaffolds: 3 })).toBe(1);
    expect(starsFor({ errors: 2, scaffolds: 3 })).toBe(1);
  });

  it('does not give three stars to a quest with any helped finish', () => {
    expect(starsFor({ errors: 0, scaffolds: 1 })).toBe(2);
  });

  it('never awards zero stars, however hard the quest went', () => {
    // A child who sat through fourteen tasks has earned something. Zero stars
    // is a punishment, and punishment is not what gets them to open the app
    // again tomorrow.
    expect(starsFor({ errors: 20, scaffolds: 14 })).toBeGreaterThanOrEqual(1);
    expect(starsFor({ errors: Number.MAX_SAFE_INTEGER, scaffolds: Number.MAX_SAFE_INTEGER })).toBe(1);
  });

  it('counts scaffolded wins as less than clean wins', () => {
    expect(starsFor({ errors: 0, scaffolds: 5 })).toBeLessThan(starsFor({ errors: 0, scaffolds: 0 }));
  });

  it('gives at most the same stars for more mistakes', () => {
    for (let errors = 0; errors < 8; errors += 1) {
      for (let scaffolds = 0; scaffolds < 8; scaffolds += 1) {
        expect(starsFor({ errors: errors + 1, scaffolds })).toBeLessThanOrEqual(starsFor({ errors, scaffolds }));
        expect(starsFor({ errors, scaffolds: scaffolds + 1 })).toBeLessThanOrEqual(starsFor({ errors, scaffolds }));
      }
    }
  });
});

describe('closing swap (applyClosingSwap)', () => {
  const hunt = (id: string, target: string, difficulty = 1) =>
    task({ id, primaryTarget: target, correctChoice: target, choices: [target, 'x'], difficulty });
  const singer = (id: string, target: string) =>
    task({
      id,
      taskTypeId: 'sound-singer',
      skill: 'LETTER_SOUND',
      primaryTarget: target,
      correctChoice: target,
      choices: [target, 'x'],
      difficulty: 2,
    });

  const outcomesOf = (entries: [TaskInstance, boolean][]): QuestOutcomes => {
    const map: QuestOutcomes = new Map();
    for (const [t, success] of entries) noteOutcome(map, t, success);
    return map;
  };

  it('leaves the plan alone when it is not at the final task', () => {
    const p = [hunt('0', 's'), singer('1', 's'), hunt('2', 'a')];
    const out = applyClosingSwap(p, 1, outcomesOf([[p[0], false]]));
    expect(out).toEqual(p);
  });

  it('keeps the planned close when the child has not failed its target', () => {
    const p = [hunt('0', 's'), singer('1', 'a'), singer('2', 's')];
    expect(applyClosingSwap(p, 2, outcomesOf([[p[0], true], [p[1], true]]))).toEqual(p);
  });

  it('swaps the close for something answered cleanly when its target was failed earlier', () => {
    const p = [hunt('0', 's'), hunt('1', 'a'), singer('2', 'a'), hunt('3', 't'), hunt('4', 's')];
    const outcomes = outcomesOf([[p[0], false], [p[1], true], [p[2], true], [p[3], true]]);
    const out = applyClosingSwap(p, 4, outcomes);
    expect(out).toHaveLength(5);
    const closing = out[4];
    expect(closing.primaryTarget).not.toBe('s');
    expect(closing.anchor).toBe(true);
    // The id is fresh for the slot, so the screen cannot reuse the earlier task's state.
    expect(closing.id).toBe(`4-${closing.taskTypeId}-${closing.primaryTarget}`);
    expect(out.slice(0, 4)).toEqual(p.slice(0, 4));
  });

  it('does not close on a target that was right once and wrong once', () => {
    const p = [hunt('0', 's'), hunt('1', 's'), hunt('2', 'a'), hunt('3', 's')];
    const outcomes = outcomesOf([[p[0], false], [p[1], true], [p[2], true]]);
    expect(applyClosingSwap(p, 3, outcomes)[3].primaryTarget).toBe('a');
  });

  it('falls back to the easiest task when nothing was answered cleanly', () => {
    const p = [singer('0', 's'), hunt('1', 'a'), singer('2', 'a'), singer('3', 's')];
    const outcomes = outcomesOf([[p[0], false], [p[1], false], [p[2], false]]);
    const out = applyClosingSwap(p, 3, outcomes);
    expect(out[3].difficulty).toBe(1);
  });

  it('treats failing /s/ by ear as a different question from singing it', () => {
    const p = [hunt('0', 's'), hunt('1', 'a'), singer('2', 's')];
    const out = applyClosingSwap(p, 2, outcomesOf([[p[0], false], [p[1], true]]));
    expect(out[2]).toBe(p[2]);
  });
});

describe('replayQuest', () => {
  const attempt = (overrides: Partial<Attempt>): Attempt => ({
    sessionId: 'S',
    targetId: 's',
    skill: 'SOUND_ID',
    taskTypeId: 'sound-hunt',
    correct: true,
    scaffolded: false,
    latencyMs: 1000,
    weight: 1,
    at: NOW,
    ...overrides,
  });

  it('rebuilds right and failed from the log, per target and skill', () => {
    const { outcomes } = replayQuest(
      [
        attempt({ targetId: 's', correct: false }),
        attempt({ targetId: 's', correct: true }),
        attempt({ targetId: 'a', correct: true }),
        attempt({ targetId: 't', correct: true, scaffolded: true }),
      ],
      'S',
    );
    expect(outcomes.get(masteryKey('s', 'SOUND_ID'))).toEqual({ right: true, failed: true });
    expect(outcomes.get(masteryKey('a', 'SOUND_ID'))).toEqual({ right: true, failed: false });
    expect(outcomes.get(masteryKey('t', 'SOUND_ID'))).toEqual({ right: false, failed: true });
  });

  it('counts errors and scaffolded answers for the stars', () => {
    const { tally } = replayQuest(
      [attempt({ correct: false }), attempt({ scaffolded: true }), attempt({ correct: true })],
      'S',
    );
    expect(tally).toEqual({ errors: 1, scaffolds: 1 });
  });

  it('counts a half-weight answer given after narrowing: it is the task\'s own attempt, not secondary credit', () => {
    const { outcomes } = replayQuest([attempt({ targetId: 'a', weight: 0.5, correct: true })], 'S');
    expect(outcomes.get(masteryKey('a', 'SOUND_ID'))).toEqual({ right: true, failed: false });
  });

  it('ignores other sessions and secondary credit', () => {
    const { outcomes, tally } = replayQuest(
      [
        attempt({ sessionId: 'OTHER', correct: false }),
        attempt({ targetId: 'a', weight: 0.5, correct: false, taskTypeId: 'word-builder', skill: 'SOUND_ID' }),
      ],
      'S',
    );
    expect(outcomes.size).toBe(0);
    expect(tally).toEqual({ errors: 0, scaffolds: 0 });
  });
});

describe('replanRemaining', () => {
  const base = () => ({
    plan: plan(),
    sessionId: 'q',
    level: 1,
    mastery: {},
    confusions: {},
    now: NOW,
    config: DEFAULT_CONFIG,
  });

  it('keeps what was played and caps the difficulty of what remains', () => {
    const args = base();
    const out = replanRemaining({ ...args, nextIndex: 4, maxDifficulty: 2, truncateTo: null });
    expect(out).toHaveLength(14);
    expect(out.slice(0, 4)).toEqual(args.plan.slice(0, 4));
    for (const t of out.slice(4)) expect(t.difficulty, t.id).toBeLessThanOrEqual(2);
  });

  it('gives every task in the quest a distinct id', () => {
    const args = base();
    const out = replanRemaining({ ...args, nextIndex: 6, maxDifficulty: 2, truncateTo: null });
    expect(new Set(out.map((t) => t.id)).size).toBe(out.length);
  });

  it('opens the rest of the quest on an anchor and closes it on one', () => {
    const out = replanRemaining({ ...base(), nextIndex: 5, maxDifficulty: 2, truncateTo: null });
    expect(out[5].anchor).toBe(true);
    expect(out[out.length - 1].anchor).toBe(true);
  });

  it('shortens a bad-day quest to the length the guard asked for', () => {
    const out = replanRemaining({ ...base(), nextIndex: 5, maxDifficulty: 2, truncateTo: 8 });
    expect(out).toHaveLength(8);
  });

  it('never shortens below an opener and a close, however late the bad day is recognised', () => {
    const out = replanRemaining({ ...base(), nextIndex: 12, maxDifficulty: 2, truncateTo: 8 });
    expect(out.length - 12).toBe(MIN_TAIL);
  });

  it('never leaves nothing to play: one task left stays one task', () => {
    const out = replanRemaining({ ...base(), nextIndex: 13, maxDifficulty: 2, truncateTo: 8 });
    expect(out).toHaveLength(14);
  });

  it('returns the plan unchanged when there is nothing to apply', () => {
    const args = base();
    expect(replanRemaining({ ...args, nextIndex: 3, maxDifficulty: null, truncateTo: null })).toEqual(args.plan);
  });

  it('does not throw for any point in the quest, with or without the cap', () => {
    const args = base();
    for (let nextIndex = 1; nextIndex <= 14; nextIndex += 1) {
      for (const truncateTo of [null, 8]) {
        const out = replanRemaining({ ...args, nextIndex, maxDifficulty: 2, truncateTo });
        expect(out.length).toBeGreaterThanOrEqual(nextIndex);
        expect(out.length).toBeLessThanOrEqual(14);
      }
    }
  });

  it('falls back to shortening in place when the rebuild fails', () => {
    const args = base();
    // A level that does not exist makes buildSession throw.
    const out = replanRemaining({ ...args, level: 99, nextIndex: 5, maxDifficulty: 2, truncateTo: 8 });
    expect(out).toEqual(args.plan.slice(0, 8));
  });
});

describe('isPlayablePlan', () => {
  it('accepts a real plan', () => {
    for (const seed of ['a', 'b', 'c']) expect(isPlayablePlan(plan(seed))).toBe(true);
  });

  it('accepts every real task the engine builds, of every task type, so no plan is thrown away as unplayable', () => {
    const mastery = {
      ...masteredFor(['s', 'a', 't']),
      ...masteredFor(['p', 'i', 'm'], 'sound-hunt', 2),
    };
    const seen = new Set<string>();
    for (let i = 0; i < 40; i += 1) {
      const built = buildSession({ sessionId: `pp-${i}`, level: 1, mastery, confusions: {}, now: NOW });
      for (const t of built) {
        seen.add(t.taskTypeId);
        expect(isPlayablePlan([t]), `${t.taskTypeId} ${t.id}`).toBe(true);
      }
    }
    expect([...seen].sort()).toEqual(TASK_TYPES.map((t) => t.id).sort());
  });

  it('rejects an empty plan', () => {
    expect(isPlayablePlan([])).toBe(false);
  });

  it('rejects a task type no component exists for', () => {
    expect(isPlayablePlan([{ ...plan()[0], taskTypeId: 'retired-game' }])).toBe(false);
  });

  it('rejects a target the curriculum no longer has', () => {
    expect(isPlayablePlan([{ ...plan()[0], correctChoice: 'zz', choices: ['zz', 's'] }])).toBe(false);
  });

  it('rejects a task whose correct answer is not among its choices', () => {
    const t = plan().find((p) => p.skill === 'SOUND_ID');
    if (!t) throw new Error('expected a SOUND_ID task');
    expect(isPlayablePlan([{ ...t, choices: t.choices.filter((c) => c !== t.correctChoice) }])).toBe(false);
  });

  it('rejects a spelling task missing letters its word needs', () => {
    const spelling = task({
      taskTypeId: 'word-builder',
      skill: 'SEGMENT_SPELL',
      primaryTarget: 'sat',
      correctChoice: 'sat',
      choices: ['s', 'a', 'p'],
    });
    expect(isPlayablePlan([spelling])).toBe(false);
    expect(isPlayablePlan([{ ...spelling, choices: ['s', 'a', 't', 'p'] }])).toBe(true);
  });

  it('rejects garbage without throwing', () => {
    expect(isPlayablePlan([{ ...plan()[0], choices: 'nope' as unknown as string[] }])).toBe(false);
  });

  describe('a Picture Start task', () => {
    const start = (overrides: Partial<TaskInstance> = {}) =>
      task({
        taskTypeId: 'picture-start', skill: 'LETTER_SOUND', primaryTarget: 'm', correctChoice: 'm',
        choices: ['s', 'm'], ...overrides,
      });

    it('is playable when every letter can be drawn and the right one is among them', () => {
      expect(isPlayablePlan([start()])).toBe(true);
      expect(isPlayablePlan([start({ choices: ['t', 'm', 'f'] })])).toBe(true);
    });

    it('is rejected for a vowel, which has no picture to answer with', () => {
      expect(isPlayablePlan([start({ primaryTarget: 'a', correctChoice: 'a', choices: ['s', 'a'] })])).toBe(false);
    });

    it('is rejected when a wrong answer is a letter with no picture, which would be a blank card', () => {
      expect(isPlayablePlan([start({ choices: ['m', 'a'] })])).toBe(false);
    });

    it('is rejected when the right letter is not among the choices', () => {
      expect(isPlayablePlan([start({ choices: ['s', 't'] })])).toBe(false);
    });
  });

  describe('a Missing Letter task', () => {
    const gap = (overrides: Partial<TaskInstance> = {}) =>
      task({
        taskTypeId: 'missing-letter', skill: 'SEGMENT_SPELL', primaryTarget: 'mat', correctChoice: 'mat',
        secondaryTargets: ['m', 'a', 't'], choices: ['i', 'a'], blankIndex: 1, ...overrides,
      });

    it('is playable when the letter for the gap is offered', () => {
      expect(isPlayablePlan([gap()])).toBe(true);
    });

    it('does not need every letter of the word among its choices, unlike Word Builder', () => {
      // Only the gap's letter and its wrong answers are offered. m and t are on the screen already.
      expect(isPlayablePlan([gap({ choices: ['a', 'i', 'p'] })])).toBe(true);
    });

    it('is rejected without a blank position', () => {
      expect(isPlayablePlan([gap({ blankIndex: undefined })])).toBe(false);
    });

    it('is rejected when the blank position is outside the word', () => {
      expect(isPlayablePlan([gap({ blankIndex: 3 })])).toBe(false);
      expect(isPlayablePlan([gap({ blankIndex: -1 })])).toBe(false);
      expect(isPlayablePlan([gap({ blankIndex: 1.5 })])).toBe(false);
    });

    it('is rejected when the letter for the gap is not among the choices', () => {
      expect(isPlayablePlan([gap({ choices: ['i', 'm'] })])).toBe(false);
    });

    it('is rejected when a choice is not a letter the curriculum has', () => {
      expect(isPlayablePlan([gap({ choices: ['a', 'zz'] })])).toBe(false);
    });
  });
});

describe('preloadKeysFor', () => {
  it('names the prompt clips and the sounds of the upcoming tasks', () => {
    const keys = preloadKeysFor(plan().slice(0, 3));
    expect(keys).toContain('ui.which_sound');
    expect(keys.some((k) => k.startsWith('ph.'))).toBe(true);
  });

  it('warms the prompt Picture Start speaks after the sound', () => {
    expect(preloadKeysFor([task({ taskTypeId: 'picture-start', skill: 'LETTER_SOUND', choices: ['s', 'm'] })])).toContain('ui.which_starts');
  });

  it('warms the letter sounds a Missing Letter task can play, and its prompt', () => {
    const gap = task({
      taskTypeId: 'missing-letter', skill: 'SEGMENT_SPELL', primaryTarget: 'mat', correctChoice: 'mat',
      choices: ['i', 'a'], blankIndex: 1,
    });
    const keys = preloadKeysFor([gap]);
    expect(keys).toContain('ui.missing_letter');
    expect(keys).toContain('ph.i');
    expect(keys).toContain('wd.mat');
  });

  it('survives a task it cannot resolve', () => {
    expect(() => preloadKeysFor([task({ correctChoice: 'zz', choices: ['zz'] })])).not.toThrow();
  });
});

describe('results parameters', () => {
  it('reads stars, never below one', () => {
    expect(starsFromParam('3')).toBe(3);
    expect(starsFromParam('2')).toBe(2);
    expect(starsFromParam('1')).toBe(1);
    expect(starsFromParam('0')).toBe(1);
    expect(starsFromParam('-4')).toBe(1);
  });

  it('reads stars, never above three', () => {
    expect(starsFromParam('9')).toBe(3);
  });

  it('turns anything unreadable into one star, not zero and not NaN', () => {
    for (const bad of [undefined, '', 'abc', 'NaN', 'Infinity', [] as string[]]) {
      expect(starsFromParam(bad)).toBe(1);
    }
    expect(starsFromParam(['3', '1'])).toBe(3);
  });

  it('reads creature ids from a string, a list or nothing', () => {
    expect(creatureIdsFromParam('sisi,annie')).toEqual(['sisi', 'annie']);
    expect(creatureIdsFromParam(['sisi', 'annie,tito'])).toEqual(['sisi', 'annie', 'tito']);
    expect(creatureIdsFromParam(undefined)).toEqual([]);
    expect(creatureIdsFromParam(',,')).toEqual([]);
  });
});

describe('dimmedFor is available from the quest logic as well', () => {
  it('is the same function', () => {
    expect(dimmedForFromLogic).toBe(dimmedFor);
  });
});

describe('config coupling', () => {
  it('uses the engine default session length', () => {
    expect(plan().length).toBe(DEFAULT_CONFIG.sessionLength);
  });

  it('knows every task type the engine can schedule', () => {
    expect(TASK_TYPES.length).toBeGreaterThan(0);
  });
});

describe('canResume', () => {
  const session = (over: Partial<{ level: number; index: number; plan: TaskInstance[] }> = {}) => ({
    level: 1,
    index: 3,
    plan: plan(),
    ...over,
  });

  it('is false with no stored quest', () => {
    expect(canResume(null, 1)).toBe(false);
  });

  it('is true for a quest part-way through at this level', () => {
    expect(canResume(session(), 1)).toBe(true);
  });

  it('is false for a quest at another level', () => {
    expect(canResume(session({ level: 2 }), 1)).toBe(false);
  });

  it('is false for a quest with nothing left to answer', () => {
    const p = plan();
    expect(canResume(session({ plan: p, index: p.length }), 1)).toBe(false);
  });

  it('is false for a plan this build cannot play, as the runner will not resume it either', () => {
    expect(canResume(session({ plan: [{ ...plan()[0], taskTypeId: 'retired-game' }] }), 1)).toBe(false);
  });
});
