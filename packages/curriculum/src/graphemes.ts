import type { Grapheme, GraphemeId } from './types';

/**
 * Level 1 of the Australian synthetic phonics sequence: s, a, t, p, i, m, f.
 *
 * This order is not arbitrary and must not be "tidied" alphabetically. These
 * seven graphemes are taught first because they combine into a large number of
 * real CVC words (sat, pat, tap, pit, mat, map...), so a child can read actual
 * words within their first few sessions rather than reciting isolated letters.
 *
 * `confusableWith` may name graphemes from later levels (n, d, b, v). The
 * distractor picker filters to graphemes the child has met, so listing them
 * early is free and pays off at Level 2.
 */
export const GRAPHEME_LIST: readonly Grapheme[] = [
  {
    id: 's',
    phoneme: '/s/',
    letterName: 'ess',
    mnemonic: 'snake',
    mnemonicEmoji: '🐍',
    startPictures: [{ emoji: '🧦', label: 'sock' }, { emoji: '☀️', label: 'sun' }, { emoji: '🧽', label: 'sponge' }],
    audio: { phoneme: 'ph.s', letterName: 'ln.s' },
    introducedInLevel: 1,
    sequenceIndex: 0,
    confusableWith: ['f', 'z'],
  },
  {
    id: 'a',
    phoneme: '/a/',
    letterName: 'ay',
    mnemonic: 'apple',
    mnemonicEmoji: '🍎',
    startPictures: [{ emoji: '🐜', label: 'ant' }, { emoji: '🚑', label: 'ambulance' }],
    audio: { phoneme: 'ph.a', letterName: 'ln.a' },
    introducedInLevel: 1,
    sequenceIndex: 1,
    confusableWith: ['i', 'e', 'u'],
  },
  {
    id: 't',
    phoneme: '/t/',
    letterName: 'tee',
    mnemonic: 'teddy',
    mnemonicEmoji: '🧸',
    startPictures: [{ emoji: '🌳', label: 'tree' }, { emoji: '🚂', label: 'train' }, { emoji: '🦷', label: 'tooth' }],
    audio: { phoneme: 'ph.t', letterName: 'ln.t' },
    introducedInLevel: 1,
    sequenceIndex: 2,
    confusableWith: ['p', 'd', 'f'],
  },
  {
    id: 'p',
    phoneme: '/p/',
    letterName: 'pee',
    mnemonic: 'pig',
    mnemonicEmoji: '🐷',
    startPictures: [{ emoji: '🖊️', label: 'pen' }, { emoji: '🍕', label: 'pizza' }, { emoji: '🥔', label: 'potato' }],
    audio: { phoneme: 'ph.p', letterName: 'ln.p' },
    introducedInLevel: 1,
    sequenceIndex: 3,
    confusableWith: ['t', 'b', 'd'],
  },
  {
    id: 'i',
    phoneme: '/i/',
    letterName: 'eye',
    mnemonic: 'insect',
    mnemonicEmoji: '🐛',
    startPictures: [{ emoji: '🛖', label: 'igloo' }, { emoji: '🖋️', label: 'ink' }],
    audio: { phoneme: 'ph.i', letterName: 'ln.i' },
    introducedInLevel: 1,
    sequenceIndex: 4,
    confusableWith: ['a', 'e'],
  },
  {
    id: 'm',
    phoneme: '/m/',
    letterName: 'em',
    mnemonic: 'moon',
    mnemonicEmoji: '🌙',
    startPictures: [{ emoji: '🥛', label: 'milk' }, { emoji: '🐵', label: 'monkey' }, { emoji: '🗺️', label: 'map' }],
    audio: { phoneme: 'ph.m', letterName: 'ln.m' },
    introducedInLevel: 1,
    sequenceIndex: 5,
    confusableWith: ['n', 'w'],
  },
  {
    id: 'f',
    phoneme: '/f/',
    letterName: 'ef',
    mnemonic: 'fish',
    mnemonicEmoji: '🐟',
    startPictures: [{ emoji: '🔥', label: 'fire' }, { emoji: '🪶', label: 'feather' }, { emoji: '🍟', label: 'fries' }],
    audio: { phoneme: 'ph.f', letterName: 'ln.f' },
    introducedInLevel: 1,
    sequenceIndex: 6,
    confusableWith: ['s', 'v', 'th'],
  },
];

export const GRAPHEMES: Record<GraphemeId, Grapheme> = Object.fromEntries(
  GRAPHEME_LIST.map((g) => [g.id, g]),
);

/** Like indexing GRAPHEMES, but an unknown id throws and names itself. */
export function getGrapheme(id: GraphemeId): Grapheme {
  const grapheme = GRAPHEMES[id];
  if (!grapheme) throw new Error(`Unknown grapheme: ${id}`);
  return grapheme;
}
