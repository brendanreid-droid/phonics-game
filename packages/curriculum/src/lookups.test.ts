import { describe, expect, it, vi } from 'vitest';
import type { Grapheme } from './types';
import {
  GRAPHEME_LIST,
  PICTURABLE_WORD_LIST,
  TRICKY_WORD_LIST,
  WORD_LIST,
  allAudioKeys,
  creatureForGrapheme,
  getGrapheme,
  getLevel,
  getTrickyWord,
  getWord,
  graphemesForLevel,
  introductionGroupIndex,
  picturableWordsForLevel,
  picturableWordsStartingWith,
  wordsForLevel,
} from './index';

// TEMPORARY: only Level 1 exists as data, and introductionGroupIndex needs a
// later level to answer the "taught earlier" question, so this mock adds an
// empty Level 2. DELETE THIS MOCK when real Level 2 data lands in levels.ts;
// it must not outlive its reason, and the tests below should then use the real
// Level 2.
vi.mock('./levels', async (importOriginal) => {
  const original = await importOriginal<typeof import('./levels')>();
  return {
    ...original,
    LEVELS: [
      ...original.LEVELS,
      { number: 2, name: 'test level', graphemeIds: [], introductionGroups: [], trickyWordIds: [] },
    ],
  };
});

// TEMPORARY, and necessary for two reasons. (1) GRAPHEME_LIST is authored in
// sequenceIndex order, so an ordering test against the real data passes even if
// graphemesForLevel never sorts. This mock hands the lookups the same graphemes
// in a deliberately scrambled order, so the sort is the only thing that can put
// them right. (2) It adds a grapheme taught at Level 2, which introductionGroupIndex
// needs in order to answer "known, but taught later than this level". DELETE the
// Level 2 grapheme when real Level 2 graphemes land; keep the scramble for as
// long as the real list happens to be authored in order.
vi.mock('./graphemes', async (importOriginal) => {
  const original = await importOriginal<typeof import('./graphemes')>();
  const taughtAtLevel2: Grapheme = {
    id: 'n',
    phoneme: '/n/',
    letterName: 'en',
    mnemonic: 'nest',
    mnemonicEmoji: '🪹',
    audio: { phoneme: 'ph.n', letterName: 'ln.n' },
    introducedInLevel: 2,
    sequenceIndex: 7,
    confusableWith: [],
  };
  const inOrder = [...original.GRAPHEME_LIST, taughtAtLevel2];
  const GRAPHEME_LIST = [3, 0, 6, 7, 2, 5, 1, 4].map((i) => inOrder[i]);
  const GRAPHEMES = Object.fromEntries(inOrder.map((g) => [g.id, g]));
  const getGrapheme = (id: string) => {
    const grapheme = GRAPHEMES[id];
    if (!grapheme) throw new Error(`Unknown grapheme: ${id}`);
    return grapheme;
  };
  return { ...original, GRAPHEME_LIST, GRAPHEMES, getGrapheme };
});

describe('getLevel', () => {
  it('returns a level whose number matches the request', () => {
    const level = getLevel(1);
    expect(level.number).toBe(1);
    expect(level.name.length).toBeGreaterThan(0);
    expect(level.introductionGroups.length).toBeGreaterThan(0);
  });
});

describe('graphemesForLevel', () => {
  it('starts from a scrambled list, so a passing sort test cannot be an accident', () => {
    const indices = GRAPHEME_LIST.map((g) => g.sequenceIndex);
    expect(indices).not.toEqual([...indices].sort((a, b) => a - b));
  });

  it('returns graphemes ordered by sequenceIndex however the list is authored', () => {
    expect(graphemesForLevel(1).map((g) => g.sequenceIndex)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(graphemesForLevel(2).map((g) => g.sequenceIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('does not reorder the shared GRAPHEME_LIST', () => {
    const before = GRAPHEME_LIST.map((g) => g.id);
    graphemesForLevel(1);
    expect(GRAPHEME_LIST.map((g) => g.id)).toEqual(before);
  });
});

describe('wordsForLevel', () => {
  // WEAK TODAY: every word is decodable at Level 1, so no word is ever above a
  // requested level and the `<= levelNumber` filter is only really exercised by
  // level 0. When Level 2 words exist, add: wordsForLevel(1) contains no word
  // with decodableFromLevel 2, and wordsForLevel(2) contains both.
  it('excludes words above the level', () => {
    for (const level of [1, 2]) {
      for (const w of wordsForLevel(level)) {
        expect(w.decodableFromLevel).toBeLessThanOrEqual(level);
      }
    }
    expect(wordsForLevel(0)).toEqual([]);
  });
});

describe('picturableWordsForLevel', () => {
  // WEAK TODAY: every word is decodable at Level 1, so the level cutoff cannot
  // be exercised beyond level 0. When Level 2 words exist, add: a Level 2
  // picturable word is absent from picturableWordsForLevel(1) and present in (2).
  it('returns only words with a picture', () => {
    expect(picturableWordsForLevel(0)).toEqual([]);
    const words = picturableWordsForLevel(1);
    expect(words.length).toBeGreaterThan(0);
    for (const w of words) expect(w.picture).toBeDefined();
    expect(words.length).toBeLessThanOrEqual(PICTURABLE_WORD_LIST.length);
  });
});

describe('picturableWordsStartingWith', () => {
  it('finds the picturable words beginning with a sound', () => {
    const ids = picturableWordsStartingWith('m', 1).map((w) => w.id);
    expect(ids.sort()).toEqual(['map', 'mat']);
  });

  it('returns nothing for a vowel with no picturable word', () => {
    // `at`, `am`, `if` and `it` exist but are function words with no picture.
    // This is why Picture Start cannot be built for the vowels — see the plan.
    expect(picturableWordsStartingWith('a', 1)).toEqual([]);
    expect(picturableWordsStartingWith('i', 1)).toEqual([]);
  });

  it('only returns words whose FIRST grapheme is the one asked for', () => {
    // `map` starts with m; `sam` merely contains it.
    const ids = picturableWordsStartingWith('m', 1).map((w) => w.id);
    expect(ids).not.toContain('sam');
  });

  // The test above is weak on its own: `sam` has no picture, so a filter that
  // matched words merely CONTAINING the grapheme would still exclude it, and no
  // picturable word has `m` anywhere but first. These pin the position
  // directly, using graphemes that do appear mid-word in picturable words
  // (`t` ends pat/pit/sit/fit/mat; `p` ends tap/sip/pip/map).
  it('does not match a grapheme in a later position', () => {
    expect(picturableWordsStartingWith('t', 1).map((w) => w.id)).toEqual(['tap']);
    expect(picturableWordsStartingWith('f', 1).map((w) => w.id)).toEqual(['fit']);
    expect(picturableWordsStartingWith('p', 1).map((w) => w.id).sort()).toEqual(['pat', 'pip', 'pit']);
    expect(picturableWordsStartingWith('s', 1).map((w) => w.id).sort()).toEqual(['sip', 'sit']);
  });

  it('returns exactly the words whose first grapheme matches, for every Level 1 grapheme', () => {
    for (const g of graphemesForLevel(1)) {
      const expected = picturableWordsForLevel(1)
        .filter((w) => w.graphemes[0] === g.id)
        .map((w) => w.id)
        .sort();
      const actual = picturableWordsStartingWith(g.id, 1).map((w) => w.id).sort();
      expect(actual, g.id).toEqual(expected);
    }
  });

  it('only returns words with a picture', () => {
    for (const word of picturableWordsStartingWith('s', 1)) {
      expect(word.picture).toBeDefined();
    }
    // `i` starts `it` and `if`, which are real words but unpictured. A filter
    // that dropped the picture requirement would return them.
    expect(picturableWordsStartingWith('i', 1)).toEqual([]);
  });

  it('respects the level cutoff', () => {
    expect(picturableWordsStartingWith('m', 0)).toEqual([]);
  });

  it('throws for an unknown grapheme', () => {
    expect(() => picturableWordsStartingWith('zz', 1)).toThrow(/unknown grapheme/i);
  });
});

describe('creatureForGrapheme', () => {
  it('returns the creature for that grapheme', () => {
    expect(creatureForGrapheme('s').graphemeId).toBe('s');
    expect(creatureForGrapheme('a').name).toBe('Annie');
  });

  it('throws on an unknown grapheme', () => {
    expect(() => creatureForGrapheme('zz')).toThrow(/zz/);
  });
});

describe('introductionGroupIndex', () => {
  it('returns the group index for a grapheme taught at the current level', () => {
    expect(introductionGroupIndex(1, 's')).toBe(0);
    expect(introductionGroupIndex(1, 't')).toBe(0);
    expect(introductionGroupIndex(1, 'p')).toBe(1);
    expect(introductionGroupIndex(1, 'i')).toBe(1);
    expect(introductionGroupIndex(1, 'm')).toBe(2);
    expect(introductionGroupIndex(1, 'f')).toBe(2);
  });

  it('returns -1 for a grapheme taught at an earlier level, meaning "treat as oldest"', () => {
    expect(introductionGroupIndex(2, 's')).toBe(-1);
  });

  it('throws for a grapheme that exists but is taught later than the requested level', () => {
    // 'n' is a test-only Level 2 grapheme (see the ./graphemes mock above).
    expect(() => introductionGroupIndex(1, 'n')).toThrow(/n.*not taught.*level 1/i);
  });

  it('throws for a grapheme that does not exist at all', () => {
    expect(() => introductionGroupIndex(1, 'zz')).toThrow(/zz/);
    expect(() => introductionGroupIndex(2, 'zz')).toThrow(/zz/);
  });
});

describe('allAudioKeys', () => {
  it('includes grapheme, word and tricky-word keys', () => {
    const keys = allAudioKeys();
    for (const g of GRAPHEME_LIST) {
      expect(keys).toContain(g.audio.phoneme);
      expect(keys).toContain(g.audio.letterName);
    }
    for (const w of WORD_LIST) expect(keys).toContain(w.audio);
    for (const w of TRICKY_WORD_LIST) expect(keys, w.id).toContain(w.audio);
  });
});

describe('throwing accessors', () => {
  it('getGrapheme returns the grapheme and names an unknown id', () => {
    expect(getGrapheme('s').phoneme).toBe('/s/');
    expect(() => getGrapheme('zz')).toThrow(/zz/);
  });

  it('getWord returns the word and names an unknown id', () => {
    expect(getWord('sam').text).toBe('Sam');
    expect(() => getWord('zzz')).toThrow(/zzz/);
  });

  it('getTrickyWord returns the word and names an unknown id', () => {
    expect(getTrickyWord('the').text).toBe('the');
    expect(() => getTrickyWord('zzz')).toThrow(/zzz/);
  });
});
