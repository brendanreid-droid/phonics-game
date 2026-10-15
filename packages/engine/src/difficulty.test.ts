import { describe, expect, it } from 'vitest';
import { difficultyFor } from './difficulty';
import { TASK_TYPES } from './taskTypes';

/**
 * These are claims about teaching, not about code, which is why each one is
 * named as a sentence a teacher would recognise.
 */
describe('difficultyFor', () => {
  it('rates reading below spelling, for the same word', () => {
    // Blending is receptive: every piece of the answer is on the screen.
    // Segmenting is productive: the child holds the word, pulls it apart, and
    // retrieves letter shapes from nothing. Rating them equal is how an
    // inverted teaching order survived review.
    expect(difficultyFor('word-pick', 'sat')).toBeLessThan(difficultyFor('missing-letter', 'sat'));
    expect(difficultyFor('picture-match', 'sat')).toBeLessThan(difficultyFor('word-builder', 'sat'));
  });

  it('rates two sounds below three, for the same game', () => {
    // A VC word is one blend; a CVC word is two.
    expect(difficultyFor('missing-letter', 'at')).toBeLessThan(difficultyFor('missing-letter', 'sat'));
    expect(difficultyFor('word-builder', 'at')).toBeLessThan(difficultyFor('word-builder', 'sat'));
  });

  it('puts a sound task below any word task', () => {
    expect(difficultyFor('sound-hunt', 's')).toBeLessThan(difficultyFor('picture-match', 'at'));
    expect(difficultyFor('sound-singer', 's')).toBeLessThan(difficultyFor('picture-match', 'at'));
  });

  it('does not vary a sound task by its grapheme', () => {
    // Nothing in this engine knows that /f/ is harder than /s/, and inventing
    // an order would be a guess dressed as data.
    expect(difficultyFor('sound-hunt', 'f')).toBe(difficultyFor('sound-hunt', 's'));
  });

  it('is defined, and finite, for every registered task type', () => {
    for (const type of TASK_TYPES) {
      const target = type.skill === 'SOUND_ID' || type.skill === 'LETTER_SOUND' ? 's' : 'sat';
      expect(Number.isFinite(difficultyFor(type.id, target)), `${type.id} has no difficulty`).toBe(true);
    }
  });

  it('refuses an unknown task type rather than guessing a number', () => {
    expect(() => difficultyFor('no-such-game', 'sat')).toThrow(/no-such-game/);
  });
});
