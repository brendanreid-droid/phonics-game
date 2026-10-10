import { describe, expect, it, vi } from 'vitest';

/**
 * Level 1 is the only level with data, so the "taught at an EARLIER level"
 * path (introductionGroupIndex === -1) and the "above the requested level"
 * filter cannot be reached through real curriculum. This file stands up a tiny
 * two-level curriculum so those branches run. Level 2 adds n and d in groups
 * [n], [d]; Level 1 is s, a.
 */
vi.mock('@soundlings/curriculum', async (importOriginal) => {
  const real = await importOriginal<typeof import('@soundlings/curriculum')>();
  const fakeGraphemes: Record<string, { id: string; introducedInLevel: number; sequenceIndex: number; confusableWith: string[] }> = {
    n: { id: 'n', introducedInLevel: 2, sequenceIndex: 7, confusableWith: ['m'] },
    d: { id: 'd', introducedInLevel: 2, sequenceIndex: 8, confusableWith: ['t', 'p'] },
  };
  const level1 = ['s', 'a'].map((id) => real.getGrapheme(id));
  const level2Groups = [['n'], ['d']];

  const getGrapheme = (id: string) => fakeGraphemes[id] ?? real.getGrapheme(id);
  const getLevel = (n: number) => {
    if (n === 1) return { number: 1, introductionGroups: [['s', 'a']] };
    if (n === 2) return { number: 2, introductionGroups: level2Groups };
    throw new Error(`Unknown level: ${n}`);
  };
  const graphemesForLevel = (n: number) => {
    const ids = n >= 2 ? [...level1.map((g) => g.id), 'n', 'd'] : level1.map((g) => g.id);
    return ids.map((id) => getGrapheme(id));
  };
  const introductionGroupIndex = (n: number, id: string) => {
    const index = getLevel(n).introductionGroups.findIndex((g) => g.includes(id));
    if (index !== -1) return index;
    if (getGrapheme(id).introducedInLevel < n) return -1;
    throw new Error(`Grapheme ${id} is not taught in level ${n}`);
  };
  return { ...real, getGrapheme, getLevel, graphemesForLevel, introductionGroupIndex };
});

import { pickGraphemeDistractors } from './distractors';
import { graphemesMetAt } from './metGraphemes';
import { makeRng } from './rng';

describe('graphemesMetAt across levels', () => {
  it('always counts graphemes taught at an earlier level as met', () => {
    expect(graphemesMetAt(2, ['n'])).toEqual(['s', 'a', 'n']);
  });

  it('opens further groups of the current level up to the focus, after the earlier ones', () => {
    expect(graphemesMetAt(2, ['d'])).toEqual(['s', 'a', 'n', 'd']);
  });

  it('opens the whole level when every focus grapheme was taught earlier', () => {
    // introductionGroupIndex is -1 for these: they say nothing about how far through
    // Level 2 the child is, so the whole level is treated as open.
    expect(graphemesMetAt(2, ['s'])).toEqual(['s', 'a', 'n', 'd']);
    expect(graphemesMetAt(2, ['s', 'a'])).toEqual(['s', 'a', 'n', 'd']);
  });

  it('uses the current-level focus when it is mixed with earlier-level graphemes', () => {
    expect(graphemesMetAt(2, ['s', 'n'])).toEqual(['s', 'a', 'n']);
  });
});

describe('pickGraphemeDistractors above the requested level', () => {
  it('silently drops an allowed grapheme from a later level', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      expect(
        pickGraphemeDistractors({
          target: 's', count: 5, level: 1, confusions: {}, rng: makeRng(seed), allowed: ['s', 'a', 'n', 'd'],
        }),
      ).toEqual(['a']);
    }
  });

  it('keeps a grapheme once its level is reached', () => {
    const picks = pickGraphemeDistractors({
      target: 's', count: 5, level: 2, confusions: {}, rng: makeRng(1), allowed: ['s', 'a', 'n'],
    });
    expect(picks.slice().sort()).toEqual(['a', 'n']);
  });
});
