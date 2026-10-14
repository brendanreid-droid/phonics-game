import { getGrapheme } from '@soundlings/curriculum';
import type { Grapheme, GraphemeId, StartPicture } from '@soundlings/curriculum';

/**
 * Which pictures can stand for a grapheme in Picture Start. Lives in the
 * engine, not the app, because two things must agree on it: the mini-game, which
 * draws the pictures, and `TaskTypeMeta.canServeTarget`, which tells the mastery
 * model how many games can prove a sound. Two copies could drift, and a drift is
 * a sound that demands a second game nobody can schedule.
 *
 * The pictures are the grapheme's own `startPictures`, chosen for this one game:
 * named unambiguously by a five-year-old, with a name that begins with the
 * sound. They are not word pictures. A word picture is survivable when
 * ambiguous because the child reads the word; here the child NAMES the picture,
 * so 💪 for "fit" (it is a muscle) would mark a child wrong for knowing /m/.
 */

/**
 * The pictures that can stand for `grapheme`, as answer or as wrong answer.
 *
 * Never its own mnemonic. `m`'s mnemonic is the moon, so the answer is a milk or
 * a monkey: if the moon could be the answer, a child could respond from the
 * letter-picture pairing they were taught alongside the sound, which is the
 * memorisation a second game exists to rule out. A game passable by the same
 * association is not a second proof. The curriculum data is tested never to hold
 * one, and this filter is the second line: it is the rule, in the one place both
 * the mastery model and the UI go through.
 */
export function answerPictures(grapheme: Grapheme): StartPicture[] {
  return grapheme.startPictures.filter((picture) => picture.emoji !== grapheme.mnemonicEmoji);
}

/** The pictures that can stand for this grapheme. Throws on an unknown grapheme. */
export function pictureStartAnswers(graphemeId: GraphemeId): StartPicture[] {
  return answerPictures(getGrapheme(graphemeId));
}

/**
 * Whether a picture can stand for this grapheme at all, so Picture Start can be
 * asked about it and a picture of it can be a wrong answer for another letter.
 * True for every Level 1 grapheme, vowels included, because the pictures are
 * chosen for this game rather than borrowed from words.
 */
export function hasInitialPicture(graphemeId: GraphemeId): boolean {
  return pictureStartAnswers(graphemeId).length > 0;
}

/**
 * Whether Picture Start can be asked about this target. Used as the task type's
 * `canServeTarget`. An unknown id, or a word id, is simply "no".
 */
export function picturesCanAnswerFor(targetId: string): boolean {
  try {
    return hasInitialPicture(targetId);
  } catch {
    return false;
  }
}
