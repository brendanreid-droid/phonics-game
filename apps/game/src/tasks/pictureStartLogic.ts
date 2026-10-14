import { getGrapheme, graphemesForLevel } from '@soundlings/curriculum';
import type { GraphemeId } from '@soundlings/curriculum';
import { hasInitialPicture, pictureStartAnswers, shuffle } from '@soundlings/engine';
import type { Rng } from '@soundlings/engine';

/**
 * The rules of Picture Start as plain functions: which pictures a question
 * offers, and which of them is right. No React, so they are tested directly.
 *
 * "Which picture starts with this letter's sound?" The pictures are each
 * letter's own `startPictures`, chosen so a five-year-old names them
 * unambiguously, and the answer is never the letter's mnemonic (m's is the moon,
 * so the answer is a milk or a monkey), or a child could pass from the memorised
 * letter-picture pairing and this would be Sound Singer in different clothes.
 * The rule itself is `answerPictures` in the engine, because the mastery
 * model's proving count must agree with it exactly.
 */

/** One card: a picture, the name a child gives it, and the letter it starts with. */
export interface PictureChoice {
  /** Tapping this card reports this letter, and the runner judges it against the task. */
  grapheme: GraphemeId;
  emoji: string;
  label: string;
}

/**
 * Whether Picture Start can be asked about this grapheme: it has pictures of its
 * own. True for all seven Level 1 letters, vowels included, which is what lets
 * the vowels be proved a second way.
 */
export function supportsPictureStart(graphemeId: GraphemeId): boolean {
  return hasInitialPicture(graphemeId);
}

export interface PictureStartOptions {
  /** The card that is the right answer. */
  answer: PictureChoice;
  /** Every card to show, the answer included, in a shuffled order. */
  choices: PictureChoice[];
}

const choiceOf = (grapheme: GraphemeId, rng: Rng): PictureChoice => {
  const picture = shuffle(pictureStartAnswers(grapheme), rng)[0];
  return { grapheme, emoji: picture.emoji, label: picture.label };
};

/**
 * The pictures for one question about `graphemeId`.
 *
 * The answer is one of the letter's own start pictures, drawn at random so it
 * cannot be memorised. Every wrong answer is a start picture of a DIFFERENT
 * letter, so there is exactly one right answer on the screen: no picture is ever
 * under two letters (the curriculum is tested for that).
 *
 * `among` is the letters the session builder chose to offer, ranked by what this
 * child has confused and restricted to letters they have met. When given, the
 * wrong answers come from it and only from it, in its order, one picture per
 * letter: a picture of a letter the child has not met would be a trick question.
 * Without it, any letter at `level` may be a wrong answer.
 *
 * Throws for a letter with no pictures: a quiet fallback would put a question
 * with no honest answer in front of a child.
 */
export function pictureStartOptions(
  graphemeId: GraphemeId,
  level: number,
  choiceCount: number,
  rng: Rng,
  among?: readonly GraphemeId[],
): PictureStartOptions {
  if (!supportsPictureStart(graphemeId)) {
    throw new Error(`Picture Start cannot be built for "${graphemeId}": it has no pictures`);
  }
  const answer = choiceOf(graphemeId, rng);

  const candidates = among ?? graphemesForLevel(level).map((g) => g.id);
  const rivals = [...new Set(candidates)].filter((g) => g !== graphemeId && hasInitialPicture(g));
  const chosen = (among === undefined ? shuffle(rivals, rng) : rivals).slice(0, Math.max(0, choiceCount - 1));

  const wrong = chosen.map((g) => choiceOf(g, rng));
  return { answer, choices: shuffle([answer, ...wrong], rng) };
}

/**
 * The level to draw pictures at, from the letters a task offers: the highest
 * one any of them was introduced in. A task does not carry its level, and every
 * letter it offers has been met, so this is the level the child is at.
 */
export function taskLevel(choices: readonly GraphemeId[]): number {
  return Math.max(1, ...choices.map((g) => getGrapheme(g).introducedInLevel));
}
