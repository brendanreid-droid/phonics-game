import type { GraphemeId } from '@soundlings/curriculum';
import type { Rng } from './rng';

/**
 * How much of the time Missing Letter blanks the MIDDLE of a word of three or
 * more graphemes. The middle of a CVC word is its vowel, the hardest slot for a
 * beginner and the one Word Builder lets them reach by elimination: place the
 * two consonants they are sure of and the vowel falls into the last gap without
 * ever being chosen. This game removes that escape by asking for it directly.
 *
 * Not 1: a child who learns "it is always the middle" has found a pattern, not
 * a sound. The rest is shared between the other positions.
 */
export const MEDIAL_BLANK_WEIGHT = 0.7;

/**
 * Which position of a word to blank, as an index into its graphemes.
 *
 * Takes an injected `Rng`, never `Math.random`, so a task is reproducible from
 * its seed. Draws exactly one number, so the result is a pure function of the
 * graphemes and the rng's next value.
 *
 * Words of three or more graphemes blank the middle (`floor(n / 2)`, the vowel
 * of every Level 1 CVC word) `MEDIAL_BLANK_WEIGHT` of the time and share the
 * rest evenly between the other positions. A two-grapheme word splits evenly.
 */
export function blankPositionFor(graphemes: readonly GraphemeId[], rng: Rng): number {
  const length = graphemes.length;
  if (length <= 1) return 0;
  const roll = rng();
  if (length === 2) return roll < 0.5 ? 0 : 1;

  const middle = Math.floor(length / 2);
  if (roll < MEDIAL_BLANK_WEIGHT) return middle;

  const others: number[] = [];
  for (let i = 0; i < length; i += 1) if (i !== middle) others.push(i);
  const share = (1 - MEDIAL_BLANK_WEIGHT) / others.length;
  const index = Math.min(others.length - 1, Math.floor((roll - MEDIAL_BLANK_WEIGHT) / share));
  return others[index];
}
