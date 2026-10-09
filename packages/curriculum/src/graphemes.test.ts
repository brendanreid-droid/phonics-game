import { describe, expect, it } from 'vitest';
import { GRAPHEMES, GRAPHEME_LIST } from './graphemes';

const LEVEL_1 = GRAPHEME_LIST.filter((g) => g.introducedInLevel === 1);

describe('Level 1 graphemes', () => {
  it('teaches exactly the Level 1 sequence s a t p i m f', () => {
    expect(LEVEL_1.map((g) => g.id)).toEqual(['s', 'a', 't', 'p', 'i', 'm', 'f']);
  });

  it('keys the record by grapheme id', () => {
    for (const g of GRAPHEME_LIST) {
      expect(GRAPHEMES[g.id]).toBe(g);
    }
  });

  it('gives every Level 1 grapheme a distinct sequence index in list order', () => {
    expect(LEVEL_1.map((g) => g.sequenceIndex)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('gives every grapheme both phoneme and letter-name audio keys', () => {
    for (const g of GRAPHEME_LIST) {
      expect(g.audio.phoneme).toBe(`ph.${g.id}`);
      expect(g.audio.letterName).toBe(`ln.${g.id}`);
    }
  });

  it('never lists a grapheme as confusable with itself', () => {
    for (const g of GRAPHEME_LIST) {
      expect(g.confusableWith).not.toContain(g.id);
    }
  });

  it('gives every grapheme a mnemonic and stand-in art', () => {
    for (const g of GRAPHEME_LIST) {
      expect(g.mnemonic.length).toBeGreaterThan(0);
      expect(g.mnemonicEmoji.length).toBeGreaterThan(0);
    }
  });
});
