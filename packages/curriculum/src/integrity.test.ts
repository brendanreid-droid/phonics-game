import { describe, expect, it } from 'vitest';
import {
  CREATURES,
  GRAPHEMES,
  GRAPHEME_LIST,
  LEVELS,
  TRICKY_WORDS,
  WORDS,
  getLevel,
  graphemesForLevel,
  picturableWordsForLevel,
  wordsForLevel,
} from './index';

describe('curriculum integrity', () => {
  it('gives every grapheme exactly one creature', () => {
    for (const g of GRAPHEME_LIST) {
      const matches = Object.values(CREATURES).filter((c) => c.graphemeId === g.id);
      expect(matches.length, `grapheme ${g.id}`).toBe(1);
    }
  });

  it('names each creature using its own grapheme, so the reward rehearses the lesson', () => {
    for (const creature of Object.values(CREATURES)) {
      expect(
        creature.name.toLowerCase().startsWith(creature.graphemeId),
        `${creature.name} should start with "${creature.graphemeId}"`,
      ).toBe(true);
    }
  });

  it('lists only known graphemes in each level', () => {
    for (const level of LEVELS) {
      for (const id of level.graphemeIds) {
        expect(GRAPHEMES[id], `level ${level.number} grapheme ${id}`).toBeDefined();
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

  it('returns Level 1 by number', () => {
    expect(getLevel(1).graphemeIds).toEqual(['s', 'a', 't', 'p', 'i', 'm', 'f']);
  });

  it('throws on an unknown level rather than returning undefined', () => {
    expect(() => getLevel(99)).toThrow(/unknown level/i);
  });
});
