import { getGrapheme } from './graphemes';
import type { Word, WordId, WordSeed } from './types';

/**
 * Level 1 words, buildable from s a t p i m f.
 *
 * Deliberately absent: "as" and "is". The `s` in both says /z/, so teaching
 * them as decodable would teach a child to sound "is" as "iss". They are
 * tricky words — see trickyWords.ts.
 *
 * `picturable` says whether a five-year-old shown a picture of the word says
 * the word, unprompted — the acceptance test for the real artwork too (see
 * spec §14). Function words and the words whose obvious image is named
 * something else (sat vs sit, tip) are deliberately not picturable, and so
 * never appear in Robot Talk or Picture Match.
 *
 * `picture` is the stand-in emoji for a picturable word that nobody has drawn
 * yet. Sam and Pam have drawings and no emoji could stand for them, so they
 * carry none.
 */
const SEEDS: WordSeed[] = [
  // Function words — nothing to draw.
  { id: 'at', text: 'at', graphemes: ['a', 't'], pattern: 'vc', picturable: false, audio: 'wd.at' },
  { id: 'am', text: 'am', graphemes: ['a', 'm'], pattern: 'vc', picturable: false, audio: 'wd.am' },
  { id: 'if', text: 'if', graphemes: ['i', 'f'], pattern: 'vc', picturable: false, audio: 'wd.if' },
  { id: 'it', text: 'it', graphemes: ['i', 't'], pattern: 'vc', picturable: false, audio: 'wd.it' },

  // Picturable, still on a stand-in emoji. See packages/curriculum/artwork-brief.txt
  // for what each one has to be drawn as, and what it must not read as.
  { id: 'tap', text: 'tap', graphemes: ['t', 'a', 'p'], pattern: 'cvc', picturable: true, picture: '🚰', audio: 'wd.tap' },
  { id: 'pit', text: 'pit', graphemes: ['p', 'i', 't'], pattern: 'cvc', picturable: true, picture: '🕳️', audio: 'wd.pit' },
  { id: 'mat', text: 'mat', graphemes: ['m', 'a', 't'], pattern: 'cvc', picturable: true, picture: '🧘', audio: 'wd.mat' },

  // Picturable and drawn. The emoji stays as the fallback until the
  // commissioned art lands; apps/game renders the drawing in preference.
  { id: 'pat', text: 'pat', graphemes: ['p', 'a', 't'], pattern: 'cvc', picturable: true, picture: '🐶', audio: 'wd.pat' },
  { id: 'sit', text: 'sit', graphemes: ['s', 'i', 't'], pattern: 'cvc', picturable: true, picture: '🪑', audio: 'wd.sit' },
  { id: 'sip', text: 'sip', graphemes: ['s', 'i', 'p'], pattern: 'cvc', picturable: true, picture: '🥤', audio: 'wd.sip' },
  { id: 'map', text: 'map', graphemes: ['m', 'a', 'p'], pattern: 'cvc', picturable: true, picture: '🗺️', audio: 'wd.map' },

  // The cast. Picturable with no emoji: no emoji can mean "Sam" rather than
  // "a child", so these are drawn or they are nothing. The plaits are what
  // tell Pam from Sam at 56pt, not the face.
  { id: 'sam', text: 'Sam', graphemes: ['s', 'a', 'm'], pattern: 'cvc', picturable: true, audio: 'wd.sam' },
  { id: 'pam', text: 'Pam', graphemes: ['p', 'a', 'm'], pattern: 'cvc', picturable: true, audio: 'wd.pam' },

  // Not picturable — still read and spelt, just never shown as a picture.
  //
  // fat: the obvious image is a pig, which a child names "pig", and that emoji
  //   already belongs to /p/'s mnemonic and to Popo.
  // pip: a pip is an apple seed. A child shown one says "seed" at best, and
  //   said "nut" at the 🌰 this used to carry.
  // fit: an adjective with nothing to draw. The 💪 it used to carry is named
  //   "muscle" by every child.
  // sat, tip: drawable, but indistinguishable from `sit` and `tap` in a
  //   picture — and those two are the pair a child must tell apart.
  { id: 'fat', text: 'fat', graphemes: ['f', 'a', 't'], pattern: 'cvc', picturable: false, audio: 'wd.fat' },
  { id: 'sat', text: 'sat', graphemes: ['s', 'a', 't'], pattern: 'cvc', picturable: false, audio: 'wd.sat' },
  { id: 'tip', text: 'tip', graphemes: ['t', 'i', 'p'], pattern: 'cvc', picturable: false, audio: 'wd.tip' },
  { id: 'sap', text: 'sap', graphemes: ['s', 'a', 'p'], pattern: 'cvc', picturable: false, audio: 'wd.sap' },
  { id: 'pip', text: 'pip', graphemes: ['p', 'i', 'p'], pattern: 'cvc', picturable: false, audio: 'wd.pip' },
  { id: 'fit', text: 'fit', graphemes: ['f', 'i', 't'], pattern: 'cvc', picturable: false, audio: 'wd.fit' },
];

function decodableFromLevel(seed: WordSeed): number {
  // getGrapheme throws on a bad id; naming the word here tells the author which seed to fix.
  return Math.max(
    ...seed.graphemes.map((g) => {
      try {
        return getGrapheme(g).introducedInLevel;
      } catch (error) {
        throw new Error(`Word "${seed.id}": ${(error as Error).message}`);
      }
    }),
  );
}

export const WORD_LIST: readonly Word[] = SEEDS.map((seed) => ({
  ...seed,
  decodableFromLevel: decodableFromLevel(seed),
}));

export const WORDS: Record<WordId, Word> = Object.fromEntries(
  WORD_LIST.map((w) => [w.id, w]),
);

/** Words usable in Picture Match. */
export const PICTURABLE_WORD_LIST: readonly Word[] = WORD_LIST.filter((w) => w.picturable);

/** Like indexing WORDS, but an unknown id throws and names itself. */
export function getWord(id: WordId): Word {
  const word = WORDS[id];
  if (!word) throw new Error(`Unknown word: ${id}`);
  return word;
}
