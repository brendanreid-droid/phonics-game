import { getGrapheme, picturableWordsStartingWith } from '@soundlings/curriculum';
import type { Grapheme, GraphemeId, Word } from '@soundlings/curriculum';

/**
 * Which pictures can answer a Picture Start question. Lives in the engine,
 * not the app, because two things must agree on it: the mini-game, which draws
 * the pictures, and `TaskTypeMeta.canServeTarget`, which tells the mastery
 * model how many games can prove a sound. Two copies could drift, and a drift
 * is a sound that demands a second game nobody can schedule.
 */

/**
 * From `candidates`, the words that can be the right answer to "which picture
 * starts with this letter's sound?".
 *
 * A word must start with the grapheme and have a picture. And its picture must
 * NOT be the grapheme's own mnemonic. `m`'s mnemonic is the moon, so the answer
 * is a mat or a map, never the moon: if the moon could be the answer, a child
 * could respond from the letter-picture pairing they were taught alongside the
 * sound, which is exactly the memorisation a second game is there to rule out.
 * A game passable by the same association is not a second proof.
 *
 * Judged by picture, not by word, so a different word drawn with the same
 * picture is barred as well.
 */
export function answerWords(grapheme: Grapheme, candidates: readonly Word[]): Word[] {
  return candidates.filter(
    (word) =>
      word.graphemes[0] === grapheme.id && word.picture !== undefined && word.picture !== grapheme.mnemonicEmoji,
  );
}

/** The words that can answer for this grapheme at this level. Throws on an unknown grapheme. */
export function pictureStartAnswers(graphemeId: GraphemeId, levelNumber: number): Word[] {
  const grapheme = getGrapheme(graphemeId);
  return answerWords(grapheme, picturableWordsStartingWith(graphemeId, levelNumber));
}

/**
 * Whether a picture can stand for this grapheme at all: some picturable word
 * starts with it and does not show its own mnemonic. That is what an answer
 * needs, and it is held to for a WRONG answer as well, so a card never shows a
 * letter's own mnemonic whichever letter is being asked about. False for the
 * vowels: no picturable Level 1 word starts with one.
 */
export function hasInitialPicture(graphemeId: GraphemeId, levelNumber: number): boolean {
  return pictureStartAnswers(graphemeId, levelNumber).length > 0;
}

/**
 * Whether Picture Start can be asked about this grapheme at all. Used as the
 * task type's `canServeTarget`, which has no level to hand, so it asks at the
 * level the grapheme is introduced in: a child cannot have met it earlier, and
 * a later level only adds words. An unknown id, or a word id, is simply "no".
 */
export function picturesCanAnswerFor(targetId: string): boolean {
  let grapheme: Grapheme;
  try {
    grapheme = getGrapheme(targetId);
  } catch {
    return false;
  }
  return hasInitialPicture(grapheme.id, grapheme.introducedInLevel);
}
