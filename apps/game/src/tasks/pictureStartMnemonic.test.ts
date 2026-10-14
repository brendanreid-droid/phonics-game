import { describe, expect, it, vi } from 'vitest';

// With the real curriculum no start picture is ever a letter's mnemonic (a data test says so), so the
// engine's rule "the answer is never the mnemonic" would pass even if nothing enforced it. This file
// puts a moon among m's pictures, and an apple among a's, as a mistaken edit to the data would, and
// checks the game still never shows them, so the rule is tested where it can fail.
vi.mock('@soundlings/curriculum', async (importOriginal) => {
  const real = await importOriginal<typeof import('@soundlings/curriculum')>();
  const poisoned = (id: string) => {
    const g = real.getGrapheme(id);
    if (id === 'm') return { ...g, startPictures: [{ emoji: g.mnemonicEmoji, label: 'moon' }, ...g.startPictures] };
    if (id === 'a') return { ...g, startPictures: [{ emoji: g.mnemonicEmoji, label: 'apple' }] };
    return g;
  };
  return { ...real, getGrapheme: poisoned };
});

import { makeRng } from '@soundlings/engine';
import { pictureStartOptions, supportsPictureStart } from './pictureStartLogic';

describe('Picture Start when the data WOULD hold a letter own mnemonic', () => {
  it('never makes the moon the answer for m, across many seeds', () => {
    const answers = new Set<string>();
    for (let seed = 0; seed < 200; seed += 1) {
      const { answer } = pictureStartOptions('m', 1, 3, makeRng(seed));
      answers.add(answer.label);
      expect(answer.label, `seed ${seed}`).not.toBe('moon');
    }
    // The moon was on offer and genuinely excluded, not merely unlucky: the real pictures still come up.
    expect([...answers].sort()).toEqual(['map', 'milk', 'monkey']);
  });

  it('never shows the moon among the choices for m either', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const labels = pictureStartOptions('m', 1, 3, makeRng(seed)).choices.map((c) => c.label);
      expect(labels, `seed ${seed}`).not.toContain('moon');
    }
  });

  it('still supports m, because milk, monkey and map remain', () => {
    expect(supportsPictureStart('m')).toBe(true);
  });

  it('does not count a letter whose only picture is its mnemonic as having a picture at all', () => {
    // a's only picture here is the apple. It cannot answer for a, and it must not be offered as a picture
    // for a either: a card showing a's own mnemonic is what this game keeps off the screen.
    expect(supportsPictureStart('a')).toBe(false);
    for (let seed = 0; seed < 100; seed += 1) {
      const { choices } = pictureStartOptions('m', 1, 3, makeRng(seed), ['m', 'a', 's', 't']);
      expect(choices.map((c) => c.label), `seed ${seed}`).not.toContain('apple');
      expect(choices.map((c) => c.grapheme), `seed ${seed}`).not.toContain('a');
    }
  });
});
