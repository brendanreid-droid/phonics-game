import { describe, expect, it } from 'vitest';
import { GRAPHEME_LIST, WORD_LIST, picturableWordsForLevel } from '@soundlings/curriculum';
import type { Skill } from '@soundlings/curriculum';
import { DEFAULT_CONFIG, withDefaults } from './config';
import { applyAttempt, emptyRecord, getRecord, isMastered, recordAttempt } from './mastery';
import { masteryKey } from './types';
import type { Attempt, MasteryMap } from './types';

const HOUR = 3_600_000;

function attempt(overrides: Partial<Attempt> = {}): Attempt {
  return {
    sessionId: 'session-1',
    targetId: 's',
    skill: 'SOUND_ID',
    taskTypeId: 'sound-hunt',
    correct: true,
    scaffolded: false,
    latencyMs: 1200,
    weight: 1,
    at: HOUR,
    ...overrides,
  };
}

/** Three fast correct answers across two sessions and two task types. */
function provenRecord() {
  let record = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
  record = applyAttempt(record, attempt({ sessionId: 'one', taskTypeId: 'sound-hunt', at: HOUR }), DEFAULT_CONFIG);
  record = applyAttempt(record, attempt({ sessionId: 'one', taskTypeId: 'word-builder', at: 2 * HOUR }), DEFAULT_CONFIG);
  record = applyAttempt(record, attempt({ sessionId: 'two', taskTypeId: 'sound-hunt', at: 3 * HOUR }), DEFAULT_CONFIG);
  return record;
}

describe('isMastered', () => {
  it('accepts a target proven across two sessions and two task types', () => {
    expect(isMastered(provenRecord(), 3 * HOUR, DEFAULT_CONFIG)).toBe(true);
  });

  it('rejects a target proven on only one task type, however many times', () => {
    let record = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
    record = applyAttempt(record, attempt({ sessionId: 'one', at: HOUR }), DEFAULT_CONFIG);
    record = applyAttempt(record, attempt({ sessionId: 'two', at: 2 * HOUR }), DEFAULT_CONFIG);
    record = applyAttempt(record, attempt({ sessionId: 'three', at: 3 * HOUR }), DEFAULT_CONFIG);
    record = applyAttempt(record, attempt({ sessionId: 'four', at: 4 * HOUR }), DEFAULT_CONFIG);
    expect(record.taskTypesSeen).toEqual(['sound-hunt']);
    expect(isMastered(record, 4 * HOUR, DEFAULT_CONFIG)).toBe(false);
  });

  it('rejects a target proven only within a single session', () => {
    let record = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
    record = applyAttempt(record, attempt({ sessionId: 'one', taskTypeId: 'sound-hunt', at: HOUR }), DEFAULT_CONFIG);
    record = applyAttempt(record, attempt({ sessionId: 'one', taskTypeId: 'word-builder', at: 2 * HOUR }), DEFAULT_CONFIG);
    record = applyAttempt(record, attempt({ sessionId: 'one', taskTypeId: 'picture-match', at: 3 * HOUR }), DEFAULT_CONFIG);
    expect(record.sessionsProven).toBe(1);
    expect(isMastered(record, 3 * HOUR, DEFAULT_CONFIG)).toBe(false);
  });

  it('rejects a target whose strength has decayed below threshold', () => {
    const record = provenRecord();
    const muchLater = 3 * HOUR + 1000 * HOUR;
    expect(isMastered(record, muchLater, DEFAULT_CONFIG)).toBe(false);
  });

  it('does not count scaffolded wins toward the correct requirement', () => {
    let record = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
    record = applyAttempt(record, attempt({ sessionId: 'one', taskTypeId: 'sound-hunt', scaffolded: true }), DEFAULT_CONFIG);
    record = applyAttempt(record, attempt({ sessionId: 'two', taskTypeId: 'word-builder', scaffolded: true }), DEFAULT_CONFIG);
    record = applyAttempt(record, attempt({ sessionId: 'three', taskTypeId: 'picture-match', scaffolded: true }), DEFAULT_CONFIG);
    expect(isMastered(record, 3 * HOUR, DEFAULT_CONFIG)).toBe(false);
  });

  it('needs two half-weight credits to equal one full one', () => {
    const half = DEFAULT_CONFIG.secondaryWeight;
    let record = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
    record = applyAttempt(record, attempt({ sessionId: 'one', taskTypeId: 'word-builder', weight: half }), DEFAULT_CONFIG);
    record = applyAttempt(record, attempt({ sessionId: 'two', taskTypeId: 'picture-match', weight: half }), DEFAULT_CONFIG);
    expect(record.correctCount).toBe(1);
    expect(isMastered(record, 2 * HOUR, DEFAULT_CONFIG)).toBe(false);
  });
});

describe('isMastered: being asked directly, and float safety', () => {
  it('rejects secondary credit alone, however much of it and however spread out', () => {
    // masteryStrength 0 isolates the primaryCorrectCount rule from strengthAt,
    // which already returns 0 for an unproven target.
    const config = withDefaults({ masteryStrength: 0 });
    const half = config.secondaryWeight;
    let record = emptyRecord('m', 'SOUND_ID', config);
    for (let i = 0; i < 8; i += 1) {
      record = applyAttempt(
        record,
        attempt({ targetId: 'm', sessionId: `s${i % 2}`, taskTypeId: i % 2 ? 'word-builder' : 'picture-match', weight: half, at: (i + 1) * HOUR }),
        config,
      );
    }
    expect(record.correctCount).toBeGreaterThanOrEqual(config.masteryCorrect);
    expect(record.taskTypesSeen.length).toBeGreaterThanOrEqual(config.masteryTaskTypes);
    expect(record.sessionsProven).toBeGreaterThanOrEqual(config.masterySessions);
    expect(record.primaryCorrectCount).toBe(0);
    expect(isMastered(record, 8 * HOUR, config)).toBe(false);
  });

  it('is not denied by float error when secondaryWeight is retuned to 0.3', () => {
    const config = withDefaults({ secondaryWeight: 0.3, masteryCorrect: 3 });
    let record = emptyRecord('s', 'SOUND_ID', config);
    for (let i = 0; i < 10; i += 1) {
      record = applyAttempt(
        record,
        attempt({ sessionId: `s${i % 2}`, taskTypeId: i % 2 ? 'word-builder' : 'picture-match', weight: 0.3, at: (i + 1) * HOUR }),
        config,
      );
    }
    // Ten credits of 0.3 are exactly the required 3, but not in binary.
    expect(record.correctCount).toBeLessThan(3);
    expect(record.correctCount).toBeCloseTo(3, 9);
    // Give it the direct evidence the rule demands, so only the sum is in question.
    const asked = { ...record, primaryCorrectCount: 1 };
    expect(isMastered(asked, 10 * HOUR, config)).toBe(true);
  });

  it('still rejects a genuinely short count', () => {
    const config = withDefaults({ secondaryWeight: 0.3, masteryCorrect: 3 });
    let record = emptyRecord('s', 'SOUND_ID', config);
    for (let i = 0; i < 9; i += 1) {
      record = applyAttempt(
        record,
        attempt({ sessionId: `s${i % 2}`, taskTypeId: i % 2 ? 'word-builder' : 'picture-match', weight: 0.3, at: (i + 1) * HOUR }),
        config,
      );
    }
    const asked = { ...record, primaryCorrectCount: 1 };
    expect(isMastered(asked, 9 * HOUR, config)).toBe(false);
  });
});

describe('isMastered thresholds are inclusive', () => {
  it('accepts a strength of exactly masteryStrength and rejects a hair below it', () => {
    const config = withDefaults({ masteryStrength: 0.5 });
    // Half-life 10h, last reinforced at 0: strength is exactly 0.5 at 10h.
    const record = { ...provenRecord(), halfLifeHours: 10, lastReinforcedAt: 0 };
    expect(isMastered(record, 10 * HOUR, config)).toBe(true);
    expect(isMastered(record, 10 * HOUR + 1, config)).toBe(false);
  });

  it('accepts a correctCount of exactly masteryCorrect and rejects 2.5', () => {
    const record = provenRecord();
    expect(record.correctCount).toBe(DEFAULT_CONFIG.masteryCorrect);
    expect(isMastered(record, 3 * HOUR, DEFAULT_CONFIG)).toBe(true);
    expect(isMastered({ ...record, correctCount: 2.5 }, 3 * HOUR, DEFAULT_CONFIG)).toBe(false);
  });

  it('accepts exactly the required task types and sessions, and rejects one fewer of each', () => {
    const record = provenRecord();
    expect(record.taskTypesSeen).toHaveLength(DEFAULT_CONFIG.masteryTaskTypes);
    expect(record.sessionsProven).toBe(DEFAULT_CONFIG.masterySessions);
    expect(isMastered({ ...record, taskTypesSeen: ['sound-hunt'] }, 3 * HOUR, DEFAULT_CONFIG)).toBe(false);
    expect(isMastered({ ...record, sessionsProven: 1 }, 3 * HOUR, DEFAULT_CONFIG)).toBe(false);
  });

  it('does not count a failed or helped session as a proven one', () => {
    let record = provenRecord();
    record = applyAttempt(record, attempt({ sessionId: 'three', correct: false, at: 4 * HOUR }), DEFAULT_CONFIG);
    record = applyAttempt(record, attempt({ sessionId: 'four', scaffolded: true, at: 5 * HOUR }), DEFAULT_CONFIG);
    expect(record.sessionsProven).toBe(2);
  });
});

describe('getRecord and recordAttempt', () => {
  it('returns a fresh empty record for an unseen target', () => {
    const record = getRecord({}, 'a', 'LETTER_SOUND', DEFAULT_CONFIG);
    expect(record.targetId).toBe('a');
    expect(record.skill).toBe('LETTER_SOUND');
    expect(record.attemptCount).toBe(0);
  });

  it('writes an attempt into a new map without mutating the original', () => {
    const before: MasteryMap = {};
    const after = recordAttempt(before, attempt(), DEFAULT_CONFIG);
    expect(before).toEqual({});
    expect(after[masteryKey('s', 'SOUND_ID')].attemptCount).toBe(1);
  });
});

describe('the anti-memorisation guarantee, after a second game per skill', () => {
  /** Plenty of correct answers across several sessions, but every one of them on the SAME game. */
  const onOneGame = (target: string, skill: Skill, taskTypeId: string) => {
    let record = emptyRecord(target, skill, DEFAULT_CONFIG);
    for (let session = 1; session <= 5; session += 1) {
      record = applyAttempt(record, {
        sessionId: `s${session}`, targetId: target, skill, taskTypeId,
        correct: true, scaffolded: false, latencyMs: 800, weight: 1, at: session * HOUR,
      }, DEFAULT_CONFIG);
    }
    return record;
  };
  const NOW5 = 5 * HOUR;

  it('refuses mastery from one task type for every skill that now has two', () => {
    // Before Plan 3, LETTER_SOUND, BLEND_READ and SEGMENT_SPELL were capped at one proving task type, so
    // this condition was vacuous for them and the spec said so. It should now bite.
    const cases = [
      { skill: 'SOUND_ID' as const, target: 's', only: 'sound-hunt' },
      { skill: 'LETTER_SOUND' as const, target: 'm', only: 'sound-singer' },
      { skill: 'LETTER_SOUND' as const, target: 'a', only: 'sound-singer' },
      { skill: 'BLEND_READ' as const, target: 'mat', only: 'picture-match' },
      { skill: 'SEGMENT_SPELL' as const, target: 'mat', only: 'word-builder' },
    ];
    for (const { skill, target, only } of cases) {
      const record = onOneGame(target, skill, only);
      expect(record.taskTypesSeen, `${target}/${skill}`).toEqual([only]);
      expect(isMastered(record, NOW5, DEFAULT_CONFIG), `${target}/${skill}`).toBe(false);
    }
  });

  it('refuses it for EVERY sound and word that has a second game, not just one chosen to look good', () => {
    let checked = 0;
    for (const g of GRAPHEME_LIST.filter((x) => x.id !== 'i')) {
      expect(isMastered(onOneGame(g.id, 'LETTER_SOUND', 'sound-singer'), NOW5, DEFAULT_CONFIG), `${g.id}/LETTER_SOUND`).toBe(false);
      checked += 1;
    }
    for (const g of GRAPHEME_LIST) {
      expect(isMastered(onOneGame(g.id, 'SOUND_ID', 'sound-hunt'), NOW5, DEFAULT_CONFIG), `${g.id}/SOUND_ID`).toBe(false);
      checked += 1;
    }
    for (const w of picturableWordsForLevel(1)) {
      expect(isMastered(onOneGame(w.id, 'BLEND_READ', 'picture-match'), NOW5, DEFAULT_CONFIG), `${w.id}/BLEND_READ`).toBe(false);
      expect(isMastered(onOneGame(w.id, 'BLEND_READ', 'word-pick'), NOW5, DEFAULT_CONFIG), `${w.id}/BLEND_READ on the other game`).toBe(false);
      checked += 2;
    }
    for (const w of WORD_LIST) {
      expect(isMastered(onOneGame(w.id, 'SEGMENT_SPELL', 'word-builder'), NOW5, DEFAULT_CONFIG), `${w.id}/SEGMENT_SPELL`).toBe(false);
      expect(isMastered(onOneGame(w.id, 'SEGMENT_SPELL', 'missing-letter'), NOW5, DEFAULT_CONFIG), `${w.id}/SEGMENT_SPELL on the other game`).toBe(false);
      checked += 2;
    }
    expect(checked, 'vacuous if the loops ran over nothing').toBeGreaterThan(60);
  });

  it('refuses for the task-type condition and no other: a second game, nothing else changed, is mastered', () => {
    // Without this a refusal above could be some other condition failing, and the test would prove nothing.
    const pairs: [string, Skill, string, string][] = [
      ['s', 'SOUND_ID', 'sound-hunt', 'picture-match'],
      ['m', 'LETTER_SOUND', 'sound-singer', 'picture-start'],
      ['a', 'LETTER_SOUND', 'sound-singer', 'picture-start'],
      ['mat', 'BLEND_READ', 'picture-match', 'word-pick'],
      ['mat', 'SEGMENT_SPELL', 'word-builder', 'missing-letter'],
    ];
    for (const [target, skill, first, other] of pairs) {
      let record = emptyRecord(target, skill, DEFAULT_CONFIG);
      for (let session = 1; session <= 5; session += 1) {
        record = applyAttempt(record, {
          sessionId: `s${session}`, targetId: target, skill, taskTypeId: session % 2 === 0 ? other : first,
          correct: true, scaffolded: false, latencyMs: 800, weight: 1, at: session * HOUR,
        }, DEFAULT_CONFIG);
      }
      expect(record.taskTypesSeen.sort(), `${target}/${skill}`).toEqual([first, other].sort());
      expect(isMastered(record, NOW5, DEFAULT_CONFIG), `${target}/${skill}`).toBe(true);
    }
  });

  it('still allows mastery on one task type where only one exists', () => {
    // `i`/LETTER_SOUND has no Picture Start (no short-/i/ initial emoji is unambiguous), so demanding
    // two games would make it permanently unmasterable: the deadlock this engine already had once.
    let record = emptyRecord('i', 'LETTER_SOUND', DEFAULT_CONFIG);
    for (let session = 1; session <= 3; session += 1) {
      record = applyAttempt(record, {
        sessionId: `s${session}`, targetId: 'i', skill: 'LETTER_SOUND', taskTypeId: 'sound-singer',
        correct: true, scaffolded: false, latencyMs: 800, weight: 1, at: session * HOUR,
      }, DEFAULT_CONFIG);
    }
    expect(record.taskTypesSeen).toEqual(['sound-singer']);
    expect(isMastered(record, 3 * HOUR, DEFAULT_CONFIG)).toBe(true);
  });

  it('is not a loophole: the exception is one sound, and `a` (the other vowel) is held to two games', () => {
    expect(isMastered(onOneGame('a', 'LETTER_SOUND', 'sound-singer'), NOW5, DEFAULT_CONFIG)).toBe(false);
    expect(isMastered(onOneGame('i', 'LETTER_SOUND', 'sound-singer'), NOW5, DEFAULT_CONFIG)).toBe(true);
  });
});
