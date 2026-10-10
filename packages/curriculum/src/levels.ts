import type { Level } from './types';

export const LEVELS: Level[] = [
  {
    number: 1,
    name: 'Island of First Sounds',
    graphemeIds: ['s', 'a', 't', 'p', 'i', 'm', 'f'],
    // s, a, t first because the three build real words (at, sat) in the first
    // session. From s and a alone no Level 1 word is buildable, which left the
    // opening focus unable to ever be mastered. Then p, i and m, f: small fronts a
    // child can finish. Blend reading starts at the second group, since no
    // s, a, t word has a picture.
    introductionGroups: [['s', 'a', 't'], ['p', 'i'], ['m', 'f']],
    trickyWordIds: ['i', 'the', 'a'],
  },
];
