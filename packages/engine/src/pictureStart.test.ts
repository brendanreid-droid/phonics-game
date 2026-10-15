import { describe, expect, it } from 'vitest';
import { GRAPHEME_LIST, getGrapheme } from '@soundlings/curriculum';
import type { Grapheme } from '@soundlings/curriculum';
import { answerPictures, hasInitialPicture, pictureStartAnswers, picturesCanAnswerFor } from './pictureStart';
import { provingTaskTypeCount, taskTypeById } from './taskTypes';

const withPictures = (id: string, pictures: { emoji: string; label: string }[]): Grapheme => ({
  ...getGrapheme(id), startPictures: pictures,
});

describe('answerPictures', () => {
  it('never offers the grapheme own mnemonic as an answer', () => {
    // m's mnemonic is the moon. If the data ever held a moon under m, a child could answer from the
    // letter-picture pairing they were taught alongside the sound: the memorisation Picture Start
    // exists to rule out.
    const moon = getGrapheme('m').mnemonicEmoji;
    const m = withPictures('m', [{ emoji: moon, label: 'moon' }, { emoji: '🥛', label: 'milk' }]);
    expect(answerPictures(m).map((p) => p.label)).toEqual(['milk']);
  });

  it('is empty when the only picture is the mnemonic', () => {
    const m = withPictures('m', [{ emoji: getGrapheme('m').mnemonicEmoji, label: 'moon' }]);
    expect(answerPictures(m)).toEqual([]);
  });

  it('bars the mnemonic by picture, whatever it is labelled', () => {
    const m = withPictures('m', [{ emoji: getGrapheme('m').mnemonicEmoji, label: 'month' }]);
    expect(answerPictures(m)).toEqual([]);
  });

  it('does not treat another grapheme mnemonic as barred', () => {
    // The snake is s's, so it is only barred from s.
    const m = withPictures('m', [{ emoji: getGrapheme('s').mnemonicEmoji, label: 'mamba' }]);
    expect(answerPictures(m)).toHaveLength(1);
  });

  it('keeps the rest of the pictures in order', () => {
    expect(answerPictures(getGrapheme('m')).map((p) => p.label)).toEqual(['milk', 'monkey', 'map']);
  });
});

describe('pictureStartAnswers, from the Level 1 curriculum', () => {
  it('has pictures for every Level 1 grapheme but `i`', () => {
    for (const g of GRAPHEME_LIST.filter((x) => x.id !== 'i')) expect(pictureStartAnswers(g.id).length, g.id).toBeGreaterThanOrEqual(2);
    expect(pictureStartAnswers('i')).toEqual([]);
  });

  it('never returns a picture showing its grapheme own mnemonic', () => {
    for (const g of GRAPHEME_LIST) {
      for (const p of pictureStartAnswers(g.id)) expect(p.emoji, `${g.id}: ${p.label}`).not.toBe(g.mnemonicEmoji);
    }
  });

  it('throws on a grapheme that does not exist, naming it', () => {
    expect(() => pictureStartAnswers('zz')).toThrow(/zz/);
  });
});

describe('hasInitialPicture', () => {
  it('is true for six letters, `a` included, and false for `i`, which has no unambiguous short-/i/ picture', () => {
    for (const g of ['s', 'a', 't', 'p', 'm', 'f']) expect(hasInitialPicture(g), g).toBe(true);
    expect(hasInitialPicture('i')).toBe(false);
  });
});

describe('picture-start as a task type', () => {
  const type = taskTypeById('picture-start');

  it('is a LETTER_SOUND game at the same difficulty as Sound Singer, with the Sound Singer bounds', () => {
    expect(type.skill).toBe('LETTER_SOUND');
    expect(type.baseDifficulty).toBe(taskTypeById('sound-singer').baseDifficulty);
    expect([type.minChoices, type.maxChoices]).toEqual([2, 3]);
    expect(type.secondaryTargets).toBe('none');
  });

  it('can serve six Level 1 letters, `a` included, and not `i`', () => {
    for (const g of ['s', 'a', 't', 'p', 'm', 'f']) expect(type.canServeTarget?.(g), g).toBe(true);
    expect(type.canServeTarget?.('i')).toBe(false);
  });

  it('does not throw for a target it has never heard of, and says no', () => {
    expect(type.canServeTarget?.('zz')).toBe(false);
    expect(type.canServeTarget?.('mat')).toBe(false);
    expect(picturesCanAnswerFor('mat')).toBe(false);
  });

  it('makes the proving count two for six letters and one for `i`, which keeps a single proving game', () => {
    for (const g of ['s', 'a', 't', 'p', 'm', 'f']) expect(provingTaskTypeCount('LETTER_SOUND', g), g).toBe(2);
    expect(provingTaskTypeCount('LETTER_SOUND', 'i')).toBe(1);
  });
});
