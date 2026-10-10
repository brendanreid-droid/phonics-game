import { describe, expect, it, vi } from 'vitest';

/**
 * The collection's order comes from the teaching order of the graphemes, not
 * from however the creature list happens to be written down. The real list is
 * already in teaching order, so that cannot be seen against it: this file
 * swaps in a reversed list, which a version that merely trusted the list's own
 * order would pass straight through.
 */
vi.mock('@soundlings/curriculum', async (importOriginal) => {
  const real = await importOriginal<typeof import('@soundlings/curriculum')>();
  return { ...real, CREATURE_LIST: real.CREATURE_LIST.slice().reverse() };
});

import { CREATURE_LIST } from '@soundlings/curriculum';
import { collectionFor } from './collection';

// Taken at load, before any test has called collectionFor.
const WRITTEN_ORDER = CREATURE_LIST.map((c) => c.id);

describe('collectionFor order', () => {
  it('follows the teaching order even when the creature list is written in another', () => {
    expect(CREATURE_LIST[0].graphemeId).toBe('f'); // the mock took effect
    expect(collectionFor([]).map((e) => e.creature.graphemeId)).toEqual(['s', 'a', 't', 'p', 'i', 'm', 'f']);
  });

  it('does not reorder the shared creature list as a side effect', () => {
    collectionFor([]);
    expect(CREATURE_LIST.map((c) => c.id)).toEqual(WRITTEN_ORDER);
  });
});
