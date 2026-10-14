import { describe, expect, it } from 'vitest';
import { WORD_LIST, getWord } from '@soundlings/curriculum';
import { makeRng } from '@soundlings/engine';
import { answerFor, blankPositionFor, judgeMissingLetter } from './missingLetterLogic';

describe('blankPositionFor', () => {
  it('blanks the medial vowel in a CVC word most of the time', () => {
    // The middle of a CVC word is the hardest position for a beginner, and
    // the one Word Builder lets them reach by elimination. This game exists
    // to ask for it directly.
    const picks = Array.from({ length: 200 }, (_, i) => blankPositionFor(['m', 'a', 't'], makeRng(i)));
    const middle = picks.filter((p) => p === 1).length;
    expect(middle / picks.length).toBeGreaterThan(0.5);
  });

  it('asks for the middle more often than the first or the last letter put together', () => {
    const picks = Array.from({ length: 1000 }, (_, i) => blankPositionFor(['p', 'i', 't'], makeRng(i * 7 + 1)));
    const count = (position: number) => picks.filter((p) => p === position).length;
    expect(count(1)).toBeGreaterThan(count(0) + count(2));
    expect(count(1) / picks.length).toBeGreaterThan(0.6);
    expect(count(1) / picks.length).toBeLessThan(0.8);
  });

  it('still blanks other positions sometimes, so it is not memorisable', () => {
    const picks = new Set(Array.from({ length: 200 }, (_, i) => blankPositionFor(['m', 'a', 't'], makeRng(i))));
    expect(picks.size).toBeGreaterThan(1);
    expect(picks.has(0)).toBe(true);
    expect(picks.has(2)).toBe(true);
  });

  it('always returns a position inside the word', () => {
    for (let i = 0; i < 100; i += 1) {
      const p = blankPositionFor(['a', 't'], makeRng(i));
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(2);
    }
    for (const word of WORD_LIST) {
      for (let i = 0; i < 20; i += 1) {
        const p = blankPositionFor(word.graphemes, makeRng(i));
        expect(Number.isInteger(p), word.id).toBe(true);
        expect(p, word.id).toBeGreaterThanOrEqual(0);
        expect(p, word.id).toBeLessThan(word.graphemes.length);
      }
    }
  });

  it('splits a two-letter word evenly', () => {
    const picks = Array.from({ length: 400 }, (_, i) => blankPositionFor(['a', 't'], makeRng(i)));
    const first = picks.filter((p) => p === 0).length / picks.length;
    expect(first).toBeGreaterThan(0.35);
    expect(first).toBeLessThan(0.65);
  });

  it('is deterministic for a seed', () => {
    expect(blankPositionFor(['m', 'a', 't'], makeRng(7))).toBe(blankPositionFor(['m', 'a', 't'], makeRng(7)));
  });
});

describe('judgeMissingLetter', () => {
  it('accepts the letter that belongs in the gap', () => {
    expect(judgeMissingLetter(['m', 'a', 't'], 1, 'a')).toBe(true);
  });

  it('rejects a letter that belongs elsewhere in the same word', () => {
    // `pip` has p at both ends; choosing p for the middle is still wrong.
    expect(judgeMissingLetter(['p', 'i', 'p'], 1, 'p')).toBe(false);
    // And a letter from elsewhere in an ordinary word.
    expect(judgeMissingLetter(['m', 'a', 't'], 1, 'm')).toBe(false);
    expect(judgeMissingLetter(['m', 'a', 't'], 1, 't')).toBe(false);
  });

  it('accepts a repeated letter in a position where it does belong', () => {
    expect(judgeMissingLetter(['p', 'i', 'p'], 2, 'p')).toBe(true);
    expect(judgeMissingLetter(['p', 'i', 'p'], 0, 'p')).toBe(true);
  });

  it('rejects a letter that is not in the word at all', () => {
    expect(judgeMissingLetter(['m', 'a', 't'], 1, 'i')).toBe(false);
  });

  it('rejects a position outside the word rather than accepting anything', () => {
    expect(judgeMissingLetter(['m', 'a', 't'], 3, 'a')).toBe(false);
    expect(judgeMissingLetter(['m', 'a', 't'], -1, 'a')).toBe(false);
  });
});

describe('answerFor', () => {
  // The quest runner judges a spelling by comparing the whole assembled word to
  // the word id, so the component reports the word with the child's letter in the gap.
  it('is the word itself when the child fills the gap correctly', () => {
    expect(answerFor(['m', 'a', 't'], 1, 'a')).toBe('mat');
  });

  it('is a different word when they fill it wrongly, so the runner marks it wrong', () => {
    expect(answerFor(['m', 'a', 't'], 1, 'i')).toBe('mit');
    expect(answerFor(['p', 'i', 'p'], 1, 'p')).toBe('ppp');
  });

  it('never equals the word unless the letter is the right one, for every word and every letter', () => {
    const letters = ['s', 'a', 't', 'p', 'i', 'm', 'f'];
    for (const word of WORD_LIST) {
      for (let position = 0; position < word.graphemes.length; position += 1) {
        for (const letter of letters) {
          const matches = answerFor(word.graphemes, position, letter) === word.graphemes.join('');
          expect(matches, `${word.id}[${position}] with ${letter}`).toBe(judgeMissingLetter(word.graphemes, position, letter));
        }
      }
    }
  });

  it('agrees with the runner on the display text: Sam is the word id sam', () => {
    expect(answerFor(getWord('sam').graphemes, 0, 's')).toBe('sam');
  });
});
