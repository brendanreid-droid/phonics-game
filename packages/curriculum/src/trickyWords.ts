import type { TrickyWord, WordId } from './types';

/**
 * Words a Level 1 child cannot sound out with s a t p i m f. Taught as whole
 * shapes. `reason` is surfaced in the parent area so a grown-up can explain
 * why the usual "sound it out" advice does not apply here.
 */
export const TRICKY_WORD_LIST: TrickyWord[] = [
  { id: 'I', audio: 'wd.i_pronoun', introducedInLevel: 1, reason: 'The letter i says its name, not /i/.' },
  { id: 'the', audio: 'wd.the', introducedInLevel: 1, reason: 'Contains th and a weak vowel, neither taught yet.' },
  { id: 'a', audio: 'wd.a_word', introducedInLevel: 1, reason: 'As a word it says /uh/, not /a/.' },
  { id: 'as', audio: 'wd.as', introducedInLevel: 1, reason: 'The s says /z/.' },
  { id: 'is', audio: 'wd.is', introducedInLevel: 1, reason: 'The s says /z/.' },
];

export const TRICKY_WORDS: Record<WordId, TrickyWord> = Object.fromEntries(
  TRICKY_WORD_LIST.map((w) => [w.id, w]),
);
