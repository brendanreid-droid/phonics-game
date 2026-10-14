import { describe, expect, it } from 'vitest';
import { GRAPHEMES, GRAPHEME_LIST } from './graphemes';
import { WORD_LIST } from './words';

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

/**
 * `startPictures` are pictures for Picture Start, chosen for ONE purpose: a
 * five-year-old names the picture unprompted, and the name begins with this
 * grapheme's sound. They are not word pictures. A word picture is survivable
 * when ambiguous because the child reads the word; here the child names the
 * picture, so an ambiguous one marks a child wrong for knowing the sound.
 */
describe('start pictures', () => {
  it('gives every grapheme at least two, so a question can vary', () => {
    for (const g of GRAPHEME_LIST) expect(g.startPictures.length, g.id).toBeGreaterThanOrEqual(2);
  });

  it('never uses a grapheme own mnemonic as one of its pictures', () => {
    // A mnemonic answer is answerable from the picture the child was taught
    // alongside the sound: the memorisation Picture Start exists to rule out.
    for (const g of GRAPHEME_LIST) {
      for (const p of g.startPictures) expect(p.emoji, `${g.id}: ${p.label}`).not.toBe(g.mnemonicEmoji);
    }
  });

  it('labels every picture with a name that starts with the grapheme', () => {
    for (const g of GRAPHEME_LIST) {
      for (const p of g.startPictures) {
        expect(p.label.length, `${g.id}`).toBeGreaterThan(0);
        expect(p.label.toLowerCase().startsWith(g.id), `${g.id}: ${p.emoji} is labelled "${p.label}"`).toBe(true);
      }
    }
  });

  it('never puts one emoji under two graphemes, or a wrong answer could be a right one', () => {
    const owner = new Map<string, string>();
    for (const g of GRAPHEME_LIST) {
      for (const p of g.startPictures) {
        expect(owner.has(p.emoji) ? `${p.emoji} under ${owner.get(p.emoji)} and ${g.id}` : 'unique').toBe('unique');
        owner.set(p.emoji, g.id);
      }
    }
  });

  it('shows no mnemonic of ANY grapheme, so no card can be answered from a taught pairing', () => {
    const mnemonics = new Set(GRAPHEME_LIST.map((g) => g.mnemonicEmoji));
    for (const g of GRAPHEME_LIST) {
      for (const p of g.startPictures) expect(mnemonics.has(p.emoji), `${g.id}: ${p.emoji}`).toBe(false);
    }
  });

  it('never reuses a word picture for a different sound than the word starts with', () => {
    // Picture Match shows 🗺️ for `map`; it may also stand for m here, because map starts with m. It must
    // never be a start picture for a letter that word does not begin with.
    for (const g of GRAPHEME_LIST) {
      for (const p of g.startPictures) {
        for (const w of WORD_LIST.filter((word) => word.picture === p.emoji)) {
          expect(w.graphemes[0], `${g.id}: ${p.emoji} is also the picture of "${w.id}"`).toBe(g.id);
        }
      }
    }
  });

  it('keeps the short vowel: no picture whose name starts with the LONG sound', () => {
    // 🧊 ice and 🦎 iguana begin with the long /ai/ and would teach i the wrong sound.
    const forbidden = ['🧊', '🦎'];
    for (const g of GRAPHEME_LIST) {
      for (const p of g.startPictures) expect(forbidden, `${g.id}: ${p.label}`).not.toContain(p.emoji);
    }
  });

  it('has the same pictures for the same grapheme every time: a plain data table, no randomness', () => {
    expect(GRAPHEMES['m'].startPictures.map((p) => p.label)).toEqual(['milk', 'monkey', 'map']);
  });
});
