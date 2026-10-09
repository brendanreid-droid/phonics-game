import { GRAPHEMES } from './graphemes';
import type { Word, WordId, WordSeed } from './types';

/**
 * Level 1 words, buildable from s a t p i m f.
 *
 * Deliberately absent: "as" and "is". The `s` in both says /z/, so teaching
 * them as decodable would teach a child to sound "is" as "iss". They are
 * tricky words — see trickyWords.ts.
 *
 * `picture` is a stand-in emoji pending real illustration. It is present only
 * where a five-year-old can reliably name the image unprompted; that is the
 * acceptance test for the real artwork too (see spec §14). Function words and
 * ambiguous pictures (sat vs sit, tip) are intentionally picture-less and so
 * never appear in Picture Match.
 */
const SEEDS: WordSeed[] = [
  // Function words — no picture possible.
  { id: 'at', graphemes: ['a', 't'], pattern: 'vc', audio: 'wd.at' },
  { id: 'am', graphemes: ['a', 'm'], pattern: 'vc', audio: 'wd.am' },
  { id: 'if', graphemes: ['i', 'f'], pattern: 'vc', audio: 'wd.if' },
  { id: 'it', graphemes: ['i', 't'], pattern: 'vc', audio: 'wd.it' },

  // CVC words with reliable pictures.
  { id: 'pat', graphemes: ['p', 'a', 't'], pattern: 'cvc', picture: '🐶', audio: 'wd.pat' },
  { id: 'tap', graphemes: ['t', 'a', 'p'], pattern: 'cvc', picture: '🚰', audio: 'wd.tap' },
  { id: 'pit', graphemes: ['p', 'i', 't'], pattern: 'cvc', picture: '🕳️', audio: 'wd.pit' },
  { id: 'sit', graphemes: ['s', 'i', 't'], pattern: 'cvc', picture: '🪑', audio: 'wd.sit' },
  { id: 'sip', graphemes: ['s', 'i', 'p'], pattern: 'cvc', picture: '🥤', audio: 'wd.sip' },
  { id: 'pip', graphemes: ['p', 'i', 'p'], pattern: 'cvc', picture: '🌰', audio: 'wd.pip' },
  { id: 'fat', graphemes: ['f', 'a', 't'], pattern: 'cvc', picture: '🐷', audio: 'wd.fat' },
  { id: 'fit', graphemes: ['f', 'i', 't'], pattern: 'cvc', picture: '💪', audio: 'wd.fit' },
  { id: 'mat', graphemes: ['m', 'a', 't'], pattern: 'cvc', picture: '🧘', audio: 'wd.mat' },
  { id: 'map', graphemes: ['m', 'a', 'p'], pattern: 'cvc', picture: '🗺️', audio: 'wd.map' },

  // CVC words without a reliable picture — still used for spelling and blending.
  { id: 'sat', graphemes: ['s', 'a', 't'], pattern: 'cvc', audio: 'wd.sat' },
  { id: 'tip', graphemes: ['t', 'i', 'p'], pattern: 'cvc', audio: 'wd.tip' },
  { id: 'sap', graphemes: ['s', 'a', 'p'], pattern: 'cvc', audio: 'wd.sap' },
  { id: 'Sam', graphemes: ['s', 'a', 'm'], pattern: 'cvc', audio: 'wd.sam' },
  { id: 'Pam', graphemes: ['p', 'a', 'm'], pattern: 'cvc', audio: 'wd.pam' },
];

function decodableFromLevel(seed: WordSeed): number {
  return Math.max(...seed.graphemes.map((g) => GRAPHEMES[g].introducedInLevel));
}

export const WORD_LIST: Word[] = SEEDS.map((seed) => ({
  ...seed,
  decodableFromLevel: decodableFromLevel(seed),
}));

export const WORDS: Record<WordId, Word> = Object.fromEntries(
  WORD_LIST.map((w) => [w.id, w]),
);

/** Words usable in Picture Match. */
export const PICTURABLE_WORD_LIST: Word[] = WORD_LIST.filter((w) => w.picture !== undefined);
