import { getWord } from '@soundlings/curriculum';
import type { Skill, WordId } from '@soundlings/curriculum';
import type { EngineConfig } from './config';
import { getRecord } from './mastery';
import type { MasteryMap } from './types';

/**
 * The two word-order gates of the teaching sequence, as pure predicates.
 *
 * They live apart from the session builder because they are claims about a
 * child's readiness, not about how a quest is arranged, and because the builder
 * is already long enough that a rule buried in it is a rule nobody will find.
 * Both read counts rather than strengths, for the same reason `knownGraphemes`
 * does: a child who comes back after a month has not un-read a word.
 */

/**
 * Invariant 5b: a word may not be asked for in writing until the child has
 * read it.
 *
 * Reading and spelling are not two difficulties of one skill. Blending is
 * recognition — the letters are in front of the child and in order. Segmenting
 * is recall: hold the word in mind, pull it apart, and produce each letter from
 * nothing. Every synthetic phonics programme reads a word before it writes it,
 * and shipping it the other way round is what the original complaint was about.
 *
 * `primaryCorrectCount` is the right counter and not a convenience: scaffolded
 * attempts return before touching it, wrong answers never reach it, and
 * half-weight secondary credit is excluded by construction. So "has read it"
 * here means unaided, correct, and asked about the word itself.
 *
 * Per word, deliberately. Reading `sat` says nothing about whether a child can
 * spell `map`; they share not one letter of overlap in the same position, and
 * the only thing generalising from one to the other would be our optimism.
 */
export function readyToSpell(wordId: WordId, mastery: MasteryMap, config: EngineConfig): boolean {
  const read = getRecord(mastery, wordId, 'BLEND_READ', config);
  return read.primaryCorrectCount >= config.readsBeforeSpelling;
}

/**
 * Invariant 5c: three-sound words only once a two-sound word has been done on
 * this same skill.
 *
 * VC before CVC. `at` has one consonant to hold; `sat` asks the child to track
 * three sounds left to right and keep the first in mind while they decode the
 * last. Level 1's VC ramp (`at`, `am`, `if`, `it`) exists for this and was
 * being spent entirely on spelling.
 *
 * Per skill, because the gate is about the load of the skill rather than about
 * the word: a child who can read `at` has not thereby learned to segment
 * anything.
 *
 * Only the print skills are gated. `ORAL_BLEND` is exempt — see the test, and
 * the comment below.
 */
export function readyForThreeSounds(skill: Skill, mastery: MasteryMap, config: EngineConfig): boolean {
  // ORAL_BLEND is exempt for a reason that is practical as well as
  // pedagogical. Robot Talk needs a picture, every picturable Level 1 word has
  // three sounds, and so a two-sound oral word does not exist: the gate would
  // not slow oral blending down, it would forbid it outright, and oral blending
  // is the stage that comes first. The load 5c is about is tracking print left
  // to right, which Robot Talk does not ask for at all.
  //
  // SOUND_ID and LETTER_SOUND have graphemes as targets and no word length to
  // compare, so the question does not arise.
  if (skill !== 'BLEND_READ' && skill !== 'SEGMENT_SPELL') return true;

  let proven = 0;
  for (const record of Object.values(mastery)) {
    // Filter by skill BEFORE looking the target up: records for SOUND_ID have
    // a grapheme as their target and `getWord('s')` throws.
    if (record.skill !== skill) continue;
    if (getWord(record.targetId).graphemes.length !== 2) continue;
    // Integral by construction: `primaryCorrectCount` rises by exactly 1, and
    // only for a full-weight attempt. No epsilon needed, unlike `correctCount`.
    proven += record.primaryCorrectCount;
  }
  return proven >= config.shortWordsBeforeLong;
}
