import { describe, expect, it } from 'vitest';
import { CREATURE_LIST } from '@soundlings/curriculum';
import { collectionFor } from './collection';

describe('collectionFor', () => {
  it('shows every Level 1 creature, hatched or not', () => {
    const entries = collectionFor([]);
    expect(entries.length).toBe(CREATURE_LIST.length);
    expect(entries.map((e) => e.creature.id).sort()).toEqual(CREATURE_LIST.map((c) => c.id).sort());
  });

  it('marks nothing hatched for a new child', () => {
    expect(collectionFor([]).every((e) => !e.hatched)).toBe(true);
  });

  it('marks an earned creature hatched', () => {
    const entries = collectionFor(['momo']);
    const momo = entries.find((e) => e.creature.id === 'momo');
    expect(momo?.hatched).toBe(true);
  });

  it('hatches only the creatures earned', () => {
    const hatched = collectionFor(['momo', 'sisi']).filter((e) => e.hatched).map((e) => e.creature.id);
    expect(hatched.sort()).toEqual(['momo', 'sisi']);
  });

  it('keeps teaching order, so the collection fills left to right', () => {
    const ids = collectionFor([]).map((e) => e.creature.graphemeId);
    expect(ids).toEqual(['s', 'a', 't', 'p', 'i', 'm', 'f']);
  });

  it('keeps teaching order whichever creatures are hatched', () => {
    const ids = collectionFor(['fifi', 'sisi']).map((e) => e.creature.graphemeId);
    expect(ids).toEqual(['s', 'a', 't', 'p', 'i', 'm', 'f']);
  });

  it('ignores an unknown creature id rather than throwing', () => {
    // Stored data outlives code. A creature removed in a later version must
    // not stop a child seeing their island.
    expect(() => collectionFor(['nobody'])).not.toThrow();
    expect(collectionFor(['nobody']).every((e) => !e.hatched)).toBe(true);
  });

  it('still hatches the known creatures when the list also holds an unknown one', () => {
    const entries = collectionFor(['nobody', 'momo']);
    expect(entries.filter((e) => e.hatched).map((e) => e.creature.id)).toEqual(['momo']);
  });

  it('counts a creature once however many times it was recorded', () => {
    const entries = collectionFor(['momo', 'momo', 'momo']);
    expect(entries.filter((e) => e.hatched).length).toBe(1);
  });

  it('counts how many are hatched', () => {
    const entries = collectionFor(['momo', 'sisi']);
    expect(entries.filter((e) => e.hatched).length).toBe(2);
  });

  it('hatches every creature when all are earned', () => {
    const entries = collectionFor(CREATURE_LIST.map((c) => c.id));
    expect(entries.every((e) => e.hatched)).toBe(true);
  });
});
