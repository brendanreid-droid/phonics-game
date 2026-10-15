import { WORDS } from '@soundlings/curriculum';
import type { TargetId } from '@soundlings/curriculum';
import { taskTypeById } from './taskTypes';

/**
 * How hard this mini-game is on this particular target.
 *
 * Difficulty used to be one number per mini-game, and that is how an inverted
 * teaching order survived review: `missing-letter` (spelling) and `word-pick`
 * (reading) were both rated 3, so nothing in the engine believed reading came
 * first, and nothing objected when a child was asked to spell `sat` two quests
 * before being asked to read a word.
 *
 * Two claims are encoded here, and both are claims about teaching rather than
 * about code:
 *
 *  - **Reading is easier than spelling.** Blending is receptive and every piece
 *    of the answer is on the screen; segmenting is productive and the child
 *    must hold the word in memory, pull it apart, and retrieve letter shapes
 *    from nothing. The base rungs carry this.
 *  - **Two sounds are easier than three.** A VC word is one blend, a CVC word
 *    is two. The word's own length carries this.
 *
 * Sound tasks do not vary by grapheme. Nothing here knows that /f/ is harder
 * than /s/, and inventing an order would be a guess dressed as data.
 */
export function difficultyFor(taskTypeId: string, targetId: TargetId): number {
  // Throws on an unknown id, which is the point: a caller that invented a task
  // type should fail loudly rather than be handed a plausible number.
  const base = taskTypeById(taskTypeId).baseDifficulty;
  const word = WORDS[targetId];
  if (word === undefined) return base;
  // Two graphemes is the floor the base rungs are quoted at, so a VC word adds
  // nothing and each further sound is one more blend to hold.
  return base + Math.max(0, word.graphemes.length - 2);
}
