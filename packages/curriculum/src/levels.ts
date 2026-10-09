import type { Level } from './types';

export const LEVELS: Level[] = [
  {
    number: 1,
    name: 'Island of First Sounds',
    graphemeIds: ['s', 'a', 't', 'p', 'i', 'm', 'f'],
    // Two at a time, so a child always has a small, finishable front.
    introductionGroups: [['s', 'a'], ['t', 'p'], ['i', 'm'], ['f']],
    trickyWordIds: ['i', 'the', 'a'],
  },
];
