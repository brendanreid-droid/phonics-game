import { describe, expect, it, vi } from 'vitest';

// With the real Level 1 words no picture is ever a letter's mnemonic, so the rule
// "the answer is never the mnemonic" would pass even if nothing enforced it. This
// file puts a moon in the curriculum (a word starting with m, drawn as m's own
// mnemonic) and checks it is never the answer, so the rule is tested where it
// can fail rather than where it cannot.
vi.mock('@soundlings/curriculum', async (importOriginal) => {
  const real = await importOriginal<typeof import('@soundlings/curriculum')>();
  const moon = {
    id: 'moo', text: 'moo', graphemes: ['m', 'o', 'o'], pattern: 'cvc' as const,
    picture: real.GRAPHEMES['m'].mnemonicEmoji, audio: 'wd.moo', decodableFromLevel: 1,
  };
  // And an apple: a word starting with a, drawn as a's own mnemonic. It is the only picture `a` has.
  const apple = {
    id: 'apl', text: 'apl', graphemes: ['a', 'p', 'l'], pattern: 'cvc' as const,
    picture: real.GRAPHEMES['a'].mnemonicEmoji, audio: 'wd.apl', decodableFromLevel: 1,
  };
  return {
    ...real,
    picturableWordsStartingWith: (graphemeId: string, level: number) => [
      ...real.picturableWordsStartingWith(graphemeId, level),
      ...(graphemeId === 'm' ? [moon] : []),
      ...(graphemeId === 'a' ? [apple] : []),
    ],
  };
});

import { makeRng } from '@soundlings/engine';
import { pictureStartOptions, supportsPictureStart } from './pictureStartLogic';

describe('Picture Start when a picturable word WOULD show the grapheme own mnemonic', () => {
  it('never makes the moon the answer for m, across many seeds', () => {
    const answers = new Set<string>();
    for (let seed = 0; seed < 200; seed += 1) {
      const { answer } = pictureStartOptions('m', 1, 3, makeRng(seed));
      answers.add(answer);
      expect(answer, `seed ${seed}`).not.toBe('moo');
    }
    // The moon was on offer and genuinely excluded, not merely unlucky: the real words still come up.
    expect([...answers].sort()).toEqual(['map', 'mat']);
  });

  it('never shows the moon among the choices for m either', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      expect(pictureStartOptions('m', 1, 3, makeRng(seed)).choices, `seed ${seed}`).not.toContain('moo');
    }
  });

  it('still supports m, because a mat and a map remain', () => {
    expect(supportsPictureStart('m', 1)).toBe(true);
  });

  it('does not count a letter whose only picture is its mnemonic as having a picture at all', () => {
    // a's only picturable word here is the apple. It cannot answer for a, and it must not be offered as
    // a picture for a either: a card showing a's own mnemonic is what this game keeps off the screen.
    expect(supportsPictureStart('a', 1)).toBe(false);
    for (let seed = 0; seed < 100; seed += 1) {
      const { choices } = pictureStartOptions('m', 1, 3, makeRng(seed), ['m', 'a', 's', 't']);
      expect(choices, `seed ${seed}`).not.toContain('apl');
    }
  });
});
