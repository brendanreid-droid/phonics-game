import { describe, expect, it } from 'vitest';
import { WORDS } from '@soundlings/curriculum';
import { graphemesMetAt, wordsDecodableFrom } from './metGraphemes';

describe('graphemesMetAt', () => {
  it('opens only the first group on day one', () => {
    expect(graphemesMetAt(1, ['s'])).toEqual(['s', 'a']);
    expect(graphemesMetAt(1, ['a'])).toEqual(['s', 'a']);
  });

  it('opens every group up to and including the one the focus sits in, in teaching order', () => {
    expect(graphemesMetAt(1, ['t'])).toEqual(['s', 'a', 't', 'p']);
    expect(graphemesMetAt(1, ['p'])).toEqual(['s', 'a', 't', 'p']);
    expect(graphemesMetAt(1, ['m'])).toEqual(['s', 'a', 't', 'p', 'i', 'm']);
    expect(graphemesMetAt(1, ['f'])).toEqual(['s', 'a', 't', 'p', 'i', 'm', 'f']);
  });

  it('opens up to the furthest focus grapheme when the focus spans groups', () => {
    expect(graphemesMetAt(1, ['s', 'p'])).toEqual(['s', 'a', 't', 'p']);
    expect(graphemesMetAt(1, ['i', 'a'])).toEqual(['s', 'a', 't', 'p', 'i', 'm']);
  });

  it('does not depend on the order of the focus graphemes', () => {
    expect(graphemesMetAt(1, ['f', 's'])).toEqual(graphemesMetAt(1, ['s', 'f']));
  });

  it('throws, naming the grapheme, for an unknown focus grapheme', () => {
    expect(() => graphemesMetAt(1, ['zz'])).toThrow(/unknown grapheme: zz/i);
  });

  it('throws for an empty focus rather than silently opening the whole level', () => {
    expect(() => graphemesMetAt(1, [])).toThrow(/focus/i);
  });

  it('throws for an unknown level', () => {
    expect(() => graphemesMetAt(99, ['s'])).toThrow(/unknown level/i);
  });

  it('does not mutate the focus it is given', () => {
    const focus = ['t', 's'];
    graphemesMetAt(1, focus);
    expect(focus).toEqual(['t', 's']);
  });
});

describe('wordsDecodableFrom', () => {
  it('returns only words built entirely from met graphemes', () => {
    expect(wordsDecodableFrom(1, ['s', 'a', 't']).sort()).toEqual(['at', 'sat']);
  });

  it('includes words with no picture, since spelling and blending use them', () => {
    expect(wordsDecodableFrom(1, ['s', 'a', 't'])).toContain('sat');
    expect(WORDS.sat.picture).toBeUndefined();
  });

  it('grows as more graphemes are met', () => {
    const early = wordsDecodableFrom(1, ['s', 'a']);
    const later = wordsDecodableFrom(1, ['s', 'a', 't', 'p']);
    expect(early).toEqual([]);
    for (const id of ['at', 'sat', 'pat', 'tap', 'sap']) expect(later).toContain(id);
    expect(later).not.toContain('mat');
  });

  it('returns every Level 1 word once all seven graphemes are met', () => {
    const all = wordsDecodableFrom(1, ['s', 'a', 't', 'p', 'i', 'm', 'f']);
    expect(all).toHaveLength(Object.keys(WORDS).length);
  });

  it('never returns a word with a grapheme outside the met set', () => {
    const met = ['s', 'i', 't', 'p'];
    for (const id of wordsDecodableFrom(1, met)) {
      for (const g of WORDS[id].graphemes) expect(met, id).toContain(g);
    }
  });

  it('throws, naming the grapheme, for an unknown met grapheme', () => {
    expect(() => wordsDecodableFrom(1, ['s', 'zz'])).toThrow(/unknown grapheme: zz/i);
  });
});
