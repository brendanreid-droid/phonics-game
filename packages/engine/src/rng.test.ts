import { describe, expect, it } from 'vitest';
import { deriveSeed, makeRng, seedFromString, shuffle } from './rng';

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
    const input = ['a', 'b', 'c', 'd', 'e'];
    const result = shuffle(input, makeRng(1));
    // Guard against the test passing vacuously: this seed must really permute.
    expect(result).not.toEqual(input);
    expect(input).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(result).not.toBe(input);
  });

  it('handles arrays too short to permute', () => {
    expect(shuffle([], makeRng(1))).toEqual([]);
    expect(shuffle(['only'], makeRng(1))).toEqual(['only']);
  });
});

describe('makeRng golden values', () => {
  // Cross-checked against an independent implementation of mulberry32. Seed 1's
  // first output, 0.6270739405881613, is the value usually quoted for it.
  const golden: Array<[number, number[]]> = [
    [0, [0.26642920868471265, 0.0003297457005828619, 0.2232720274478197, 0.1462021479383111]],
    [1, [0.6270739405881613, 0.002735721180215478, 0.5274470399599522, 0.9810509674716741]],
    [42, [0.6011037519201636, 0.44829055899754167, 0.8524657934904099, 0.6697340414393693]],
    [4294967295, [0.8964226141106337, 0.189478256739676, 0.7156526781618595, 0.9440599093213677]],
  ];

  it.each(golden)('seed %s yields the published sequence', (seed, expected) => {
    const rng = makeRng(seed);
    expect(expected.map(() => rng())).toEqual(expected);
  });

  it('coerces its seed with >>> 0, so floats and negatives are accepted and truncated', () => {
    expect(makeRng(1.9)()).toBe(makeRng(1)());
    expect(makeRng(-1)()).toBe(makeRng(4294967295)());
    expect(makeRng(2 ** 32 + 5)()).toBe(makeRng(5)());
  });

  it('never emits 1.0, and is centred across a large sample', () => {
    let max = 0;
    let sum = 0;
    let n = 0;
    for (let seed = 0; seed < 50; seed += 1) {
      const rng = makeRng(seed);
      for (let i = 0; i < 2000; i += 1) {
        const v = rng();
        max = Math.max(max, v);
        sum += v;
        n += 1;
      }
    }
    expect(max).toBeLessThan(1);
    expect(sum / n).toBeGreaterThan(0.49);
    expect(sum / n).toBeLessThan(0.51);
  });
});

describe('shuffle is unbiased', () => {
  function permutationCounts(items: string[], seeds: number): Map<string, number> {
    const counts = new Map<string, number>();
    for (let seed = 0; seed < seeds; seed += 1) {
      const key = shuffle(items, makeRng(seed)).join('');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }

  it('reaches all 6 orderings of three items about equally often', () => {
    const counts = permutationCounts(['a', 'b', 'c'], 6000);
    expect(counts.size).toBe(6);
    // Expected 1000 each, sd ~29: this band is ~5 sd wide on each side.
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(850);
      expect(count).toBeLessThan(1150);
    }
  });

  it('reaches all 24 orderings of four items about equally often', () => {
    const counts = permutationCounts(['a', 'b', 'c', 'd'], 24000);
    expect(counts.size).toBe(24);
    // Expected 1000 each, sd ~31.
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(820);
      expect(count).toBeLessThan(1180);
    }
  });

  it('can leave any element where it started (a biased shuffle never does)', () => {
    const counts = permutationCounts(['a', 'b', 'c', 'd', 'e'], 1200);
    expect(counts.get('abcde') ?? 0).toBeGreaterThan(0);
  });
});

describe('seedFromString', () => {
  // FNV-1a, 32-bit. These are the standard published test vectors.
  it.each([
    ['', 2166136261],
    ['a', 3826002220],
    ['foobar', 3214735720],
  ])('hashes %j to %s', (input, expected) => {
    expect(seedFromString(input)).toBe(expected);
  });

  it('hashes ordinary session ids to the expected values', () => {
    expect(seedFromString('session-1')).toBe(1936347597);
    expect(seedFromString('session-2')).toBe(1886014740);
  });

  it('depends on every character, not just the first', () => {
    expect(seedFromString('ab')).not.toBe(seedFromString('ac'));
    expect(seedFromString('xab')).not.toBe(seedFromString('xac'));
  });
});

describe('deriveSeed', () => {
  it('is deterministic and returns an unsigned 32-bit integer', () => {
    expect(deriveSeed(7, 3)).toBe(deriveSeed(7, 3));
    for (let i = 0; i < 50; i += 1) {
      const seed = deriveSeed(123, i);
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(2 ** 32);
    }
  });

  it('matches the reference values', () => {
    expect([deriveSeed(7, 0), deriveSeed(7, 1), deriveSeed(7, 2)]).toEqual([4139236332, 2902783164, 1679835275]);
    expect(deriveSeed(0, 0)).toBe(301794027);
  });

  it('gives every (seed, index) pair in a grid its own seed', () => {
    const seen = new Set<number>();
    for (let seed = 0; seed < 100; seed += 1) {
      for (let index = 0; index < 100; index += 1) seen.add(deriveSeed(seed, index));
    }
    expect(seen.size).toBe(10000);
  });

  it('does not alias neighbouring sessions the way `seed + index` does', () => {
    // With addition, (seed 5, task 1) and (seed 6, task 0) would collide.
    expect(deriveSeed(5, 1)).not.toBe(deriveSeed(6, 0));
    expect(deriveSeed(5, 1)).toBe(1448432939);
    expect(deriveSeed(6, 0)).toBe(4051782527);
  });

  it('produces uncorrelated streams for consecutive indices', () => {
    expect(makeRng(deriveSeed(9, 0))()).not.toBe(makeRng(deriveSeed(9, 1))());
  });
});
