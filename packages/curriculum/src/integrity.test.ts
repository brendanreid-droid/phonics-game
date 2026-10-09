import { describe, expect, it } from 'vitest';
import {
  CREATURES,
  CREATURE_LIST,
  GRAPHEMES,
  GRAPHEME_LIST,
  LEVELS,
  PICTURABLE_WORD_LIST,
  TRICKY_WORDS,
  TRICKY_WORD_LIST,
  WORDS,
  WORD_LIST,
} from './index';
import { getLevel, graphemesForLevel, picturableWordsForLevel, wordsForLevel } from './lookups';

describe('curriculum integrity', () => {
  it('gives every grapheme exactly one creature', () => {
    for (const g of GRAPHEME_LIST) {
      const matches = Object.values(CREATURES).filter((c) => c.graphemeId === g.id);
      expect(matches.length, `grapheme ${g.id}`).toBe(1);
    }
  });

  // This checks SPELLING only. It cannot check pronunciation: "Ada" starts with
  // "a" but says the letter name AY, not the sound /a/. Whether a name actually
  // opens with its grapheme's sound is reviewed by hand when creatures are added.
  it('begins each creature name with its own grapheme (spelling only; the sound match is hand-reviewed)', () => {
    for (const creature of Object.values(CREATURES)) {
      expect(
        creature.name.toLowerCase().startsWith(creature.graphemeId),
        `${creature.name} should start with "${creature.graphemeId}"`,
      ).toBe(true);
    }
  });

  it('does not name the /a/ creature after the letter name "Ada"', () => {
    expect(CREATURE_LIST.find((c) => c.graphemeId === 'a')?.name).toBe('Annie');
  });

  it('lists only known graphemes in each level', () => {
    for (const level of LEVELS) {
      for (const id of level.graphemeIds) {
        expect(GRAPHEMES[id], `level ${level.number} grapheme ${id}`).toBeDefined();
      }
    }
  });

  it('agrees with each grapheme about which level introduces it', () => {
    for (const level of LEVELS) {
      for (const id of level.graphemeIds) {
        expect(GRAPHEMES[id].introducedInLevel, `grapheme ${id}`).toBe(level.number);
      }
    }
  });

  it('covers every level grapheme exactly once across its introduction groups', () => {
    for (const level of LEVELS) {
      const flattened = level.introductionGroups.flat();
      expect(flattened.slice().sort()).toEqual(level.graphemeIds.slice().sort());
      expect(new Set(flattened).size).toBe(flattened.length);
    }
  });

  it('lists only known tricky words in each level', () => {
    for (const level of LEVELS) {
      for (const id of level.trickyWordIds) {
        expect(TRICKY_WORDS[id], `level ${level.number} tricky word ${id}`).toBeDefined();
      }
    }
  });

  it('agrees with each tricky word about which level introduces it', () => {
    for (const level of LEVELS) {
      for (const id of level.trickyWordIds) {
        expect(TRICKY_WORDS[id].introducedInLevel, `tricky word ${id}`).toBe(level.number);
      }
    }
  });

  it('holds "as" and "is" back for Level 2, where /z/ is taught', () => {
    expect(TRICKY_WORDS['as'].introducedInLevel).toBe(2);
    expect(TRICKY_WORDS['is'].introducedInLevel).toBe(2);
  });

  it('never lets a word require a grapheme the child has not met', () => {
    for (const level of LEVELS) {
      const taught = new Set(graphemesForLevel(level.number).map((g) => g.id));
      for (const word of wordsForLevel(level.number)) {
        for (const g of word.graphemes) {
          expect(taught.has(g), `${word.id} needs ${g}, not taught by level ${level.number}`).toBe(true);
        }
      }
    }
  });

  it('gives every level at least 8 picturable words', () => {
    for (const level of LEVELS) {
      expect(picturableWordsForLevel(level.number).length, `level ${level.number}`)
        .toBeGreaterThanOrEqual(8);
    }
  });

  it('never marks a word as both decodable and tricky', () => {
    for (const id of Object.keys(TRICKY_WORDS)) {
      expect(WORDS[id], `${id} is in both lists`).toBeUndefined();
    }
  });

  it('keeps every word id and tricky-word id lowercase; display casing lives in `text`', () => {
    for (const w of WORD_LIST) expect(w.id, `word ${w.id}`).toBe(w.id.toLowerCase());
    for (const w of TRICKY_WORD_LIST) expect(w.id, `tricky word ${w.id}`).toBe(w.id.toLowerCase());
  });

  it('gives every tricky word its display text', () => {
    expect(TRICKY_WORDS['i'].text).toBe('I');
    for (const w of TRICKY_WORD_LIST) expect(w.text.toLowerCase(), w.id).toBe(w.id);
  });

  it('returns Level 1 by number', () => {
    expect(getLevel(1).graphemeIds).toEqual(['s', 'a', 't', 'p', 'i', 'm', 'f']);
  });

  it('throws on an unknown level rather than returning undefined', () => {
    expect(() => getLevel(99)).toThrow(/unknown level/i);
  });

  describe('data invariants', () => {
    it('uses every audio key once across graphemes, words and tricky words', () => {
      const keys = [
        ...GRAPHEME_LIST.flatMap((g) => [g.audio.phoneme, g.audio.letterName]),
        ...WORD_LIST.map((w) => w.audio),
        ...TRICKY_WORD_LIST.map((w) => w.audio),
      ];
      const duplicates = keys.filter((k, i) => keys.indexOf(k) !== i);
      expect(duplicates).toEqual([]);
    });

    it('gives every grapheme a unique sequence index', () => {
      const indices = GRAPHEME_LIST.map((g) => g.sequenceIndex);
      expect(new Set(indices).size).toBe(indices.length);
    });

    it('lists no grapheme twice in any confusableWith', () => {
      for (const g of GRAPHEME_LIST) {
        expect(new Set(g.confusableWith).size, g.id).toBe(g.confusableWith.length);
      }
    });

    it('gives every picture a single owner, so a picture never means two words', () => {
      const pictures = PICTURABLE_WORD_LIST.map((w) => w.picture);
      expect(new Set(pictures).size).toBe(pictures.length);
    });

    it('never reuses a grapheme mnemonic or creature emoji as a word picture', () => {
      const owners = new Map<string, string[]>();
      const claim = (emoji: string, owner: string) =>
        owners.set(emoji, [...(owners.get(emoji) ?? []), owner]);
      for (const g of GRAPHEME_LIST) claim(g.mnemonicEmoji, `grapheme "${g.id}" mnemonic (${g.mnemonic})`);
      for (const c of CREATURE_LIST) claim(c.emoji, `creature ${c.name}`);

      for (const w of PICTURABLE_WORD_LIST) {
        const clashes = owners.get(w.picture as string) ?? [];
        expect(
          clashes,
          `word "${w.id}" picture ${w.picture} is already used by: ${clashes.join(' and ')}`,
        ).toEqual([]);
      }
    });
  });
});
