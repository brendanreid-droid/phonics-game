import type { GraphemeId } from '@soundlings/curriculum';

/**
 * The rules of Missing Letter as plain functions: which position is blanked,
 * and whether a letter is right for it. No React, so they are tested directly.
 *
 * Which position to blank lives in the engine, because the session builder
 * decides it (it must also choose letters to offer for that gap, ranked by what
 * the child has confused); it is re-exported here so this file is the one place
 * the game's rules are read.
 */
export { blankPositionFor, MEDIAL_BLANK_WEIGHT } from '@soundlings/engine';

/**
 * Whether `letter` is the one that belongs at `position`. The comparison is to
 * that position only, never "is this letter somewhere in the word": `p` is in
 * `pip`, but it does not belong in the middle of it.
 */
export function judgeMissingLetter(graphemes: readonly GraphemeId[], position: number, letter: GraphemeId): boolean {
  // A position outside the word reads `undefined`, which no letter equals.
  return graphemes[position] === letter;
}

/**
 * The word with `letter` in the gap, as the answer reported to the quest runner.
 * The runner judges a spelling by comparing the whole assembled word to the word
 * id, so a right letter reports the word itself and a wrong one reports some
 * other string.
 */
export function answerFor(graphemes: readonly GraphemeId[], position: number, letter: GraphemeId): string {
  return graphemes.map((grapheme, index) => (index === position ? letter : grapheme)).join('');
}
