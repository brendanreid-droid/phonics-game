import { describe, expect, it, vi } from 'vitest';
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

describe('getLevel', () => {
  it('returns a level whose number matches the request', () => {
    const level = getLevel(1);
    expect(level.number).toBe(1);
    expect(level.name.length).toBeGreaterThan(0);
    expect(level.introductionGroups.length).toBeGreaterThan(0);
  });
});

describe('graphemesForLevel', () => {
  it('returns graphemes ordered by sequenceIndex', () => {
    const indices = graphemesForLevel(1).map((g) => g.sequenceIndex);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
    expect(indices.length).toBeGreaterThan(0);
  });

  it('does not reorder the shared GRAPHEME_LIST', () => {
    const before = GRAPHEME_LIST.map((g) => g.id);
    graphemesForLevel(1);
    expect(GRAPHEME_LIST.map((g) => g.id)).toEqual(before);
  });
});

describe('wordsForLevel', () => {
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
  it('returns only words with a picture', () => {
    const words = picturableWordsForLevel(1);
    expect(words.length).toBeGreaterThan(0);
    for (const w of words) expect(w.picture).toBeDefined();
    expect(words.length).toBeLessThanOrEqual(PICTURABLE_WORD_LIST.length);
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
    expect(introductionGroupIndex(1, 'p')).toBe(1);
    expect(introductionGroupIndex(1, 'f')).toBe(3);
  });

  it('returns -1 for a grapheme taught at an earlier level, meaning "treat as oldest"', () => {
    expect(introductionGroupIndex(2, 's')).toBe(-1);
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
