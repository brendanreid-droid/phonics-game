import { describe, expect, it } from 'vitest';
import { CREATURE_LIST } from '@soundlings/curriculum';
import { CREATURE_COLOURS } from './palette';

/**
 * The art and the curriculum must hold exactly the same creatures.
 *
 * A creature added to the curriculum without a drawing would render as a blank
 * square on a child's island — the reward for mastering a sound, missing — and
 * nothing else in the suite would notice. A drawing with no creature is dead
 * code that looks maintained.
 */
describe('every creature has a drawing, and every drawing has a creature', () => {
  it('matches the curriculum, id for id', () => {
    expect(Object.keys(CREATURE_COLOURS).sort()).toEqual(CREATURE_LIST.map((c) => c.id).sort());
  });

  it('gives every creature a colour of its own', () => {
    // Two creatures sharing a hue are two creatures a five-year-old cannot
    // tell apart at 56pt, which is the size they are actually drawn at.
    const colours = Object.values(CREATURE_COLOURS);
    expect(new Set(colours).size).toBe(colours.length);
  });
});
