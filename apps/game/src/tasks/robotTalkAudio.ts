import type { Word } from '@soundlings/curriculum';
import type { HintTier } from './useHintLadder';

/** The only spoken instruction in Robot Talk. */
export const ROBOT_TALK_PROMPT_KEYS: readonly string[] = ['ui.robot_listen'];

/**
 * The word said in robot talk: each sound on its own, in order.
 *
 * The whole word is deliberately absent. Hearing "map" and then picking the
 * picture of a map is a listening game a two-year-old can win; pushing
 * /m/-/a/-/p/ together into "map" is the thing being taught. The blended word
 * is spoken only after the child has answered — see `robotRevealKey`.
 */
export function robotTalkKeys(word: Word): string[] {
  return word.graphemes.map((grapheme) => `ph.${grapheme}`);
}

/** The blended word, played once the child has answered and not before. */
export function robotRevealKey(word: Word): string {
  return word.audio;
}

/**
 * The silence between sounds, in milliseconds.
 *
 * Shortening the gap IS the teaching move. A teacher stretching /mmm/ /aaa/
 * /p/ apart and then saying it faster and faster until the child hears the word
 * is how blending is taught at a table, and it is the only hint this game has
 * that does not simply give the answer away.
 *
 * Tier 3 is not zero: at zero the game says the word, which is the one thing it
 * must not do before the child answers.
 */
export function robotGapMs(tier: HintTier): number {
  if (tier >= 3) return 120;
  if (tier >= 2) return 320;
  return 650;
}
