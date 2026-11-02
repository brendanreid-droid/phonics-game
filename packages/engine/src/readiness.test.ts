import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from './config';
import { recordAttempt } from './mastery';
import { readyForThreeSounds, readyToSpell } from './readiness';
import type { Attempt, MasteryMap } from './types';
import type { Skill, TargetId } from '@soundlings/curriculum';

const config = DEFAULT_CONFIG;

function answered(
  map: MasteryMap,
  targetId: TargetId,
  skill: Skill,
  overrides: Partial<Attempt> = {},
): MasteryMap {
  return recordAttempt(
    map,
    {
      sessionId: 'q1',
      targetId,
      skill,
      taskTypeId: 'sound-it-out',
      correct: true,
      scaffolded: false,
      latencyMs: 2000,
      weight: 1,
      at: Date.UTC(2026, 0, 1),
      ...overrides,
    },
    config,
  );
}

describe('readyToSpell — invariant 5b, read before spell', () => {
  it('refuses a word the child has never read', () => {
    expect(readyToSpell('at', {}, config)).toBe(false);
  });

  it('allows a word read unaided and correctly', () => {
    const mastery = answered({}, 'at', 'BLEND_READ');
    expect(readyToSpell('at', mastery, config)).toBe(true);
  });

  it('refuses a word whose only read was scaffolded', () => {
    // A child shown the answer has proved nothing, exactly as everywhere else
    // in this engine. Spelling is harder than reading; a revealed read is not
    // the evidence that earns it.
    const mastery = answered({}, 'at', 'BLEND_READ', { scaffolded: true });
    expect(readyToSpell('at', mastery, config)).toBe(false);
  });

  it('refuses a word the child read wrongly', () => {
    const mastery = answered({}, 'at', 'BLEND_READ', { correct: false });
    expect(readyToSpell('at', mastery, config)).toBe(false);
  });

  it('is per word, not per skill: reading `sat` does not unlock spelling `map`', () => {
    const mastery = answered({}, 'sat', 'BLEND_READ');
    expect(readyToSpell('sat', mastery, config)).toBe(true);
    expect(readyToSpell('map', mastery, config)).toBe(false);
  });

  it('does not count half-weight secondary credit as having read the word', () => {
    // Secondary credit is what a word task gives its LETTERS. There is no path
    // by which a word itself earns it today, but the predicate must not start
    // accepting one if that changes.
    //
    // TWO half-weight answers, not one: that is what distinguishes
    // `primaryCorrectCount` from `correctCount`. One half-weight answer leaves
    // both below the threshold, so a predicate reading the wrong counter would
    // pass a one-attempt version of this test.
    const once = answered({}, 'at', 'BLEND_READ', { weight: 0.5 });
    const twice = answered(once, 'at', 'BLEND_READ', { weight: 0.5, sessionId: 'q2' });
    expect(twice['at::BLEND_READ'].correctCount).toBeGreaterThanOrEqual(1);
    expect(readyToSpell('at', twice, config)).toBe(false);
  });

  it('does not decay: a word read a year ago is still spellable', () => {
    // A count, not a strength — the same reasoning as `knownGraphemes`. A child
    // who comes back after the summer should not be told they may no longer
    // spell a word they once read.
    const mastery = answered({}, 'at', 'BLEND_READ', { at: 0 });
    expect(readyToSpell('at', mastery, config)).toBe(true);
  });

  it('reads the threshold from config rather than hard-coding one', () => {
    const mastery = answered({}, 'at', 'BLEND_READ');
    expect(readyToSpell('at', mastery, { ...config, readsBeforeSpelling: 2 })).toBe(false);
    const twice = answered(mastery, 'at', 'BLEND_READ', { sessionId: 'q2' });
    expect(readyToSpell('at', twice, { ...config, readsBeforeSpelling: 2 })).toBe(true);
  });
});

describe('readyForThreeSounds — invariant 5c, two sounds before three', () => {
  it('refuses three sounds to a child who has blended nothing', () => {
    expect(readyForThreeSounds('BLEND_READ', {}, config)).toBe(false);
    expect(readyForThreeSounds('SEGMENT_SPELL', {}, config)).toBe(false);
  });

  it('allows three sounds once a two-sound word has been done on that skill', () => {
    const mastery = answered({}, 'at', 'BLEND_READ');
    expect(readyForThreeSounds('BLEND_READ', mastery, config)).toBe(true);
  });

  it('is per skill: reading two sounds does not unlock spelling three', () => {
    const mastery = answered({}, 'at', 'BLEND_READ');
    expect(readyForThreeSounds('BLEND_READ', mastery, config)).toBe(true);
    expect(readyForThreeSounds('SEGMENT_SPELL', mastery, config)).toBe(false);
  });

  it('does not count a three-sound word as evidence of two', () => {
    const mastery = answered({}, 'sat', 'BLEND_READ');
    expect(readyForThreeSounds('BLEND_READ', mastery, config)).toBe(false);
  });

  it('ignores scaffolded and wrong answers', () => {
    const shown = answered({}, 'at', 'BLEND_READ', { scaffolded: true });
    expect(readyForThreeSounds('BLEND_READ', shown, config)).toBe(false);
    const wrong = answered({}, 'at', 'BLEND_READ', { correct: false });
    expect(readyForThreeSounds('BLEND_READ', wrong, config)).toBe(false);
  });

  it('ignores records for other skills entirely, including grapheme skills', () => {
    // `s::SOUND_ID` has a grapheme as its target, and `getWord('s')` would
    // throw. The predicate must filter by skill before it looks anything up.
    const mastery = answered({}, 's', 'SOUND_ID');
    expect(() => readyForThreeSounds('BLEND_READ', mastery, config)).not.toThrow();
    expect(readyForThreeSounds('BLEND_READ', mastery, config)).toBe(false);
  });

  it('exempts ORAL_BLEND, which has no two-sound word to practise on', () => {
    // Level 1's picturable words are all three sounds (`at`, `am`, `if`, `it`
    // have no picture), and Robot Talk needs a picture. Applying 5c here would
    // mean oral blending — the stage that is supposed to come FIRST — could
    // never happen at all. The gate is about print, where the child must track
    // left to right across letters; hearing three sounds in a row is not the
    // same load.
    expect(readyForThreeSounds('ORAL_BLEND', {}, config)).toBe(true);
  });

  it('exempts the grapheme skills, which have no word length to compare', () => {
    expect(readyForThreeSounds('SOUND_ID', {}, config)).toBe(true);
    expect(readyForThreeSounds('LETTER_SOUND', {}, config)).toBe(true);
  });

  it('reads the threshold from config rather than hard-coding one', () => {
    const mastery = answered({}, 'at', 'BLEND_READ');
    expect(readyForThreeSounds('BLEND_READ', mastery, { ...config, shortWordsBeforeLong: 2 })).toBe(false);
  });
});
