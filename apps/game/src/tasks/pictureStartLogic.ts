import { getGrapheme, getWord, graphemesForLevel } from '@soundlings/curriculum';
import type { GraphemeId, WordId } from '@soundlings/curriculum';
import { hasInitialPicture, pictureStartAnswers, shuffle } from '@soundlings/engine';
import type { Rng } from '@soundlings/engine';

/**
 * The rules of Picture Start as plain functions: which pictures a question
 * offers, and which of them is right. No React, so they are tested directly.
 *
 * "Which picture starts with this letter's sound?" The answer must never be the
 * letter's own mnemonic (m's is the moon, so the answer is a mat or a map), or a
 * child could pass from the memorised letter-picture pairing and this would be
 * the same proof as Sound Singer wearing different clothes. The rule itself is
 * `answerWords` in the engine, because the mastery model's proving count must
 * agree with it exactly.
 */

/**
 * Whether Picture Start can be asked about this grapheme. False for the vowels:
 * `at`, `am`, `if` and `it` are function words with no picture, so no picturable
 * Level 1 word starts with one. Documented, not an oversight; they get a second
 * proving game only when SAY_IT ships.
 */
export function supportsPictureStart(graphemeId: GraphemeId, level: number): boolean {
  return hasInitialPicture(graphemeId, level);
}

export interface PictureStartOptions {
  /** The word whose picture is the right answer. */
  answer: WordId;
  /** Every picture to show, the answer included, in a shuffled order. */
  choices: WordId[];
}

/**
 * The pictures for one question about `graphemeId`.
 *
 * The answer is a picturable word that starts with the sound and is not the
 * letter's mnemonic, drawn at random so it cannot be memorised. Every wrong
 * answer is a picture of a word starting with a DIFFERENT letter, so there is
 * exactly one right answer on the screen.
 *
 * `among` is the letters the session builder chose to offer, ranked by what this
 * child has confused and restricted to letters they have met. When given, the
 * wrong answers come from it and only from it, in its order, one picture per
 * letter: a picture of a letter the child has not met would be a trick question.
 * A letter in it with no picture is skipped, never drawn as a blank card.
 * Without it, any letter at this level with a picture may be a wrong answer.
 *
 * Throws for a letter it cannot support: a quiet fallback would put a question
 * with no honest answer in front of a child.
 */
export function pictureStartOptions(
  graphemeId: GraphemeId,
  level: number,
  choiceCount: number,
  rng: Rng,
  among?: readonly GraphemeId[],
): PictureStartOptions {
  const answers = pictureStartAnswers(graphemeId, level);
  if (answers.length === 0) {
    throw new Error(`Picture Start cannot be built for "${graphemeId}": no picturable word starts with that sound`);
  }
  const answer = shuffle(answers, rng)[0];

  const candidates = among ?? graphemesForLevel(level).map((g) => g.id);
  const rivals = [...new Set(candidates)].filter((g) => g !== graphemeId && hasInitialPicture(g, level));
  const chosen = (among === undefined ? shuffle(rivals, rng) : rivals).slice(0, Math.max(0, choiceCount - 1));

  const wrong = chosen.map((g) => shuffle(pictureStartAnswers(g, level), rng)[0]);
  return { answer: answer.id, choices: shuffle([answer, ...wrong], rng).map((w) => w.id) };
}

/** The letter a picture stands for: the first grapheme of its word. Tapping a picture reports this. */
export function wordFor(wordId: WordId): GraphemeId {
  return getWord(wordId).graphemes[0];
}

/**
 * The level to draw pictures at, from the letters a task offers: the highest
 * one any of them was introduced in. A task does not carry its level, and every
 * letter it offers has been met, so this is the level the child is at.
 */
export function taskLevel(choices: readonly GraphemeId[]): number {
  return Math.max(1, ...choices.map((g) => getGrapheme(g).introducedInLevel));
}
