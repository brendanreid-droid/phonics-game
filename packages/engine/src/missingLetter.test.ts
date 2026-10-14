import { describe, expect, it } from 'vitest';
import { MEDIAL_BLANK_WEIGHT, blankPositionFor } from './missingLetter';
import { makeRng } from './rng';

describe('blankPositionFor', () => {
  it('weights the middle of a three-grapheme word at MEDIAL_BLANK_WEIGHT, the rest split evenly', () => {
    const n = 3000;
    const counts = [0, 0, 0];
    for (let i = 0; i < n; i += 1) counts[blankPositionFor(['s', 'i', 't'], makeRng(i * 2654435761))] += 1;
    expect(counts[1] / n).toBeGreaterThan(MEDIAL_BLANK_WEIGHT - 0.05);
    expect(counts[1] / n).toBeLessThan(MEDIAL_BLANK_WEIGHT + 0.05);
    // 15% each for the consonants, give or take sampling.
    expect(Math.abs(counts[0] - counts[2]) / n).toBeLessThan(0.05);
    expect(counts[0] / n).toBeGreaterThan(0.1);
  });

  it('draws exactly one number from the rng, so it is a pure function of the next value', () => {
    let draws = 0;
    const rng = () => { draws += 1; return 0.5; };
    blankPositionFor(['m', 'a', 't'], rng);
    expect(draws).toBe(1);
  });

  it('maps the edges of the roll to the first and last position, and the middle to the vowel', () => {
    const at = (roll: number, word: string[] = ['m', 'a', 't']) => blankPositionFor(word, () => roll);
    expect(at(0)).toBe(1);
    expect(at(MEDIAL_BLANK_WEIGHT - 0.001)).toBe(1);
    expect(at(MEDIAL_BLANK_WEIGHT + 0.01)).toBe(0);
    expect(at(0.999)).toBe(2);
    expect(at(0.999999999)).toBe(2);
  });

  it('handles a single grapheme, two, and a longer word without leaving the word', () => {
    expect(blankPositionFor(['a'], makeRng(1))).toBe(0);
    expect(blankPositionFor([], makeRng(1))).toBe(0);
    for (let i = 0; i < 200; i += 1) {
      const p = blankPositionFor(['s', 't', 'o', 'p'], makeRng(i));
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(4);
    }
  });
});
