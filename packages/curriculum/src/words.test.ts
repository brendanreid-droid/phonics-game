import { describe, expect, it } from 'vitest';
import { GRAPHEMES } from './graphemes';
import { WORDS, WORD_LIST, PICTURABLE_WORD_LIST } from './words';

describe('words', () => {
  it('keys the record by word id', () => {
    for (const w of WORD_LIST) {
      expect(WORDS[w.id]).toBe(w);
    }
  });

  it('has no duplicate ids', () => {
    const ids = WORD_LIST.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('spells every word from its own grapheme sequence', () => {
    for (const w of WORD_LIST) {
      expect(w.graphemes.join('')).toBe(w.id.toLowerCase());
    }
  });

  it('only uses graphemes that exist', () => {
    for (const w of WORD_LIST) {
      for (const g of w.graphemes) {
        expect(GRAPHEMES[g], `${w.id} uses unknown grapheme ${g}`).toBeDefined();
      }
    }
  });

  it('derives decodableFromLevel as the latest grapheme introduction', () => {
    for (const w of WORD_LIST) {
      const expected = Math.max(...w.graphemes.map((g) => GRAPHEMES[g].introducedInLevel));
      expect(w.decodableFromLevel, w.id).toBe(expected);
    }
  });

  it('gives every word an audio key matching its id', () => {
    for (const w of WORD_LIST) {
      expect(w.audio).toBe(`wd.${w.id.toLowerCase()}`);
    }
  });

  it('excludes the /z/ words "as" and "is" — their s does not say /s/', () => {
    expect(WORDS['as']).toBeUndefined();
    expect(WORDS['is']).toBeUndefined();
  });

  it('matches the declared pattern to the grapheme count', () => {
    for (const w of WORD_LIST) {
      expect(w.graphemes.length, w.id).toBe(w.pattern.length);
    }
  });

  it('offers at least 8 picturable Level 1 words, so Picture Match has headroom', () => {
    const level1 = PICTURABLE_WORD_LIST.filter((w) => w.decodableFromLevel === 1);
    expect(level1.length).toBeGreaterThanOrEqual(8);
  });

  it('never gives a function word a picture', () => {
    for (const id of ['at', 'am', 'if', 'it']) {
      expect(WORDS[id].picture, id).toBeUndefined();
    }
  });
});
