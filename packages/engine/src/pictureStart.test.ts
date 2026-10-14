import { describe, expect, it } from 'vitest';
import { GRAPHEMES, getGrapheme } from '@soundlings/curriculum';
import type { Word } from '@soundlings/curriculum';
import { answerWords, hasInitialPicture, pictureStartAnswers } from './pictureStart';
import { provingTaskTypeCount, taskTypeById } from './taskTypes';

const word = (over: Partial<Word> & { id: string }): Word => ({
  text: over.id, graphemes: [...over.id], pattern: 'cvc', audio: `wd.${over.id}`, decodableFromLevel: 1, ...over,
});

describe('answerWords', () => {
  it('never offers the grapheme own mnemonic as an answer', () => {
    // m's mnemonic is the moon. If a picturable word began with m and showed the moon,
    // a child could answer from the letter-picture pairing they were taught alongside
    // the sound: the memorisation Picture Start exists to rule out.
    const moon = word({ id: 'mon', picture: getGrapheme('m').mnemonicEmoji });
    const map = word({ id: 'map', picture: '🗺️' });
    const answers = answerWords(getGrapheme('m'), [moon, map]);
    expect(answers.map((w) => w.id)).toEqual(['map']);
  });

  it('is empty when the only word starting with the sound shows the mnemonic', () => {
    const moon = word({ id: 'mon', picture: getGrapheme('m').mnemonicEmoji });
    expect(answerWords(getGrapheme('m'), [moon])).toEqual([]);
  });

  it('keeps only words that start with the sound', () => {
    const answers = answerWords(getGrapheme('m'), [word({ id: 'map', picture: '🗺️' }), word({ id: 'sit', picture: '🪑' })]);
    expect(answers.map((w) => w.id)).toEqual(['map']);
  });

  it('keeps only words that have a picture', () => {
    expect(answerWords(getGrapheme('a'), [word({ id: 'at', graphemes: ['a', 't'] })])).toEqual([]);
  });

  it('judges the mnemonic by picture, not by word: another word with the same picture is out too', () => {
    // Different word, same moon.
    const alsoMoon = word({ id: 'mum', picture: getGrapheme('m').mnemonicEmoji });
    expect(answerWords(getGrapheme('m'), [alsoMoon])).toEqual([]);
  });

  it('does not treat another grapheme mnemonic as excluded', () => {
    // The snake is s's, so it is only barred from s.
    const snakeWord = word({ id: 'sap', picture: getGrapheme('s').mnemonicEmoji });
    expect(answerWords(getGrapheme('s'), [snakeWord])).toEqual([]);
    expect(answerWords(getGrapheme('m'), [word({ id: 'map', picture: getGrapheme('s').mnemonicEmoji })]).map((w) => w.id)).toEqual(['map']);
  });
});

describe('pictureStartAnswers, from the Level 1 curriculum', () => {
  const ids = (g: string) => pictureStartAnswers(g, 1).map((w) => w.id).sort();

  it('finds the words for the five consonants', () => {
    expect(ids('s')).toEqual(['sip', 'sit']);
    expect(ids('p')).toEqual(['pat', 'pip', 'pit']);
    expect(ids('m')).toEqual(['map', 'mat']);
    expect(ids('t')).toEqual(['tap']);
    expect(ids('f')).toEqual(['fit']);
  });

  it('finds none for the vowels: at, am, if and it cannot be drawn', () => {
    expect(ids('a')).toEqual([]);
    expect(ids('i')).toEqual([]);
  });

  it('never returns a word showing its grapheme own mnemonic, for any grapheme', () => {
    for (const g of Object.keys(GRAPHEMES)) {
      for (const w of pictureStartAnswers(g, 1)) expect(w.picture, `${g}: ${w.id}`).not.toBe(GRAPHEMES[g].mnemonicEmoji);
    }
  });

  it('throws on a grapheme that does not exist, naming it', () => {
    expect(() => pictureStartAnswers('zz', 1)).toThrow(/zz/);
  });
});

describe('hasInitialPicture', () => {
  it('is true where some picturable word starts with the grapheme, and false for the vowels', () => {
    for (const g of ['s', 'p', 'm', 't', 'f']) expect(hasInitialPicture(g, 1), g).toBe(true);
    expect(hasInitialPicture('a', 1)).toBe(false);
    expect(hasInitialPicture('i', 1)).toBe(false);
  });
});

describe('picture-start as a task type', () => {
  const type = taskTypeById('picture-start');

  it('is a LETTER_SOUND game at the same difficulty as Sound Singer, with the Sound Singer bounds', () => {
    expect(type.skill).toBe('LETTER_SOUND');
    expect(type.difficulty).toBe(taskTypeById('sound-singer').difficulty);
    expect([type.minChoices, type.maxChoices]).toEqual([2, 3]);
    expect(type.secondaryTargets).toBe('none');
  });

  it('can serve the five consonants and neither vowel', () => {
    for (const g of ['s', 'p', 'm', 't', 'f']) expect(type.canServeTarget?.(g), g).toBe(true);
    expect(type.canServeTarget?.('a')).toBe(false);
    expect(type.canServeTarget?.('i')).toBe(false);
  });

  it('does not throw for a target it has never heard of', () => {
    expect(type.canServeTarget?.('zz')).toBe(false);
    expect(type.canServeTarget?.('mat')).toBe(false);
  });

  it('makes the proving count two where Picture Start can serve it and one where it cannot', () => {
    for (const g of ['s', 'p', 'm', 't', 'f']) expect(provingTaskTypeCount('LETTER_SOUND', g), g).toBe(2);
    expect(provingTaskTypeCount('LETTER_SOUND', 'a')).toBe(1);
    expect(provingTaskTypeCount('LETTER_SOUND', 'i')).toBe(1);
  });
});
