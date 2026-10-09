import type { TrickyWord, WordId } from './types';

/**
 * Words a Level 1 child cannot sound out with s a t p i m f. Taught as whole
 * shapes. `reason` is surfaced in the parent area so a grown-up can explain
 * why the usual "sound it out" advice does not apply here.
 *
 * "as" and "is" are held for Level 2 because the /z/ sound that their s makes
 * is taught then. They are not decodable at Level 1 either (see words.ts), so
 * a Level 1 child simply does not meet them yet.
 */
export const TRICKY_WORD_LIST: readonly TrickyWord[] = [
  { id: 'i', text: 'I', audio: 'wd.i_pronoun', introducedInLevel: 1, reason: 'The letter i says its name, not /i/.' },
  { id: 'the', text: 'the', audio: 'wd.the', introducedInLevel: 1, reason: 'Contains th and a weak vowel, neither taught yet.' },
  { id: 'a', text: 'a', audio: 'wd.a_word', introducedInLevel: 1, reason: 'As a word it says /uh/, not /a/.' },
  { id: 'as', text: 'as', audio: 'wd.as', introducedInLevel: 2, reason: 'The s says /z/.' },
  { id: 'is', text: 'is', audio: 'wd.is', introducedInLevel: 2, reason: 'The s says /z/.' },
];

export const TRICKY_WORDS: Record<WordId, TrickyWord> = Object.fromEntries(
  TRICKY_WORD_LIST.map((w) => [w.id, w]),
);

/** Like indexing TRICKY_WORDS, but an unknown id throws and names itself. */
export function getTrickyWord(id: WordId): TrickyWord {
  const word = TRICKY_WORDS[id];
  if (!word) throw new Error(`Unknown tricky word: ${id}`);
  return word;
}
