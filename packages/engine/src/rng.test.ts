import { describe, expect, it } from 'vitest';
import { makeRng, shuffle } from './rng';

describe('seeded rng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const seqA = [a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    expect(makeRng(1)()).not.toBe(makeRng(2)());
  });

  it('stays within [0, 1)', () => {
    const rng = makeRng(7);
    for (let i = 0; i < 500; i += 1) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('shuffles deterministically and keeps every element', () => {
    const input = ['a', 'b', 'c', 'd', 'e'];
    const first = shuffle(input, makeRng(99));
    const second = shuffle(input, makeRng(99));
    expect(first).toEqual(second);
    expect(first.slice().sort()).toEqual(input.slice().sort());
  });

  it('does not mutate the input array', () => {
    const input = ['a', 'b', 'c'];
    shuffle(input, makeRng(5));
    expect(input).toEqual(['a', 'b', 'c']);
  });
});
