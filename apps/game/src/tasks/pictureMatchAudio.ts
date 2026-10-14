import type { Word } from '@soundlings/curriculum';

/** The only spoken instruction in Picture Match. */
export const PICTURE_MATCH_PROMPT_KEYS: readonly string[] = ['ui.tap_picture'];

/**
 * The tier-2 hint: each grapheme's sound, one at a time, in order.
 *
 * The word itself is deliberately absent. Reading it is the task; hearing it
 * blended first would turn the whole game into picture vocabulary. Sounding the
 * letters out is the strategy being taught, and the child does the blending.
 */
export function soundOutKeys(word: Word): string[] {
  return word.graphemes.map((grapheme) => `ph.${grapheme}`);
}

/**
 * The only spoken instruction in Word Pick. It must never name the word: the
 * picture is shown and the child reads the cards, so hearing the word would
 * turn reading into listening.
 */
export const WORD_PICK_PROMPT_KEYS: readonly string[] = ['ui.find_word'];
