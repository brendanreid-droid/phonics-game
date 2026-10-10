import { describe, expect, it } from 'vitest';
import { WORDS } from '@soundlings/curriculum';
import { DEFAULT_CONFIG } from './config';
import {
  pickGraphemeDistractors,
  pickTileDistractors,
  pickWordDistractors,
  recordConfusion,
} from './distractors';
import { makeRng } from './rng';
import { confusionKey } from './types';

const SEEDS = Array.from({ length: 25 }, (_, i) => i + 1);

describe('pickGraphemeDistractors', () => {
  it('never includes the target', () => {
    const picks = pickGraphemeDistractors({
      target: 's', count: 3, level: 1, confusions: {}, rng: makeRng(1),
    });
    expect(picks).not.toContain('s');
  });

  it('never includes the target, however many are asked for or whatever the pool holds', () => {
    for (const seed of SEEDS) {
      const all = pickGraphemeDistractors({
        target: 's', count: 99, level: 1, confusions: {}, rng: makeRng(seed),
      });
      expect(all).not.toContain('s');
      const fromAllowed = pickGraphemeDistractors({
        target: 's', count: 99, level: 1, confusions: {}, rng: makeRng(seed), allowed: ['s', 'a', 't'],
      });
      expect(fromAllowed).not.toContain('s');
    }
  });

  it('never includes a grapheme the child has not met', () => {
    // 'n' is listed as confusable with 'm' but is not taught until Level 2.
    const picks = pickGraphemeDistractors({
      target: 'm', count: 4, level: 1, confusions: {}, rng: makeRng(1),
    });
    expect(picks).not.toContain('n');
    expect(picks).not.toContain('z');
  });

  it('never offers a letter outside `allowed`, even one in the level and in the confusable list', () => {
    // Day one: the child has met s and a only. t, p, f are all taught by Level 1
    // and t is confusable with p and f, but showing p or f would be a trick question.
    for (const seed of SEEDS) {
      expect(
        pickGraphemeDistractors({
          target: 't', count: 5, level: 1, confusions: {}, rng: makeRng(seed), allowed: ['t', 'a', 's'],
        }).sort(),
      ).toEqual(['a', 's']);
    }
  });

  it('does not offer an unmet grapheme even when the child has a confusion logged against it', () => {
    // 'f' is in Level 1 but outside `allowed`; 'n' is not taught at all.
    const confusions = { [confusionKey('m', 'f')]: 9, [confusionKey('m', 'n')]: 9 };
    for (const seed of SEEDS) {
      const picks = pickGraphemeDistractors({
        target: 'm', count: 5, level: 1, confusions, rng: makeRng(seed), allowed: ['m', 'a', 's'],
      });
      expect(picks.sort()).toEqual(['a', 's']);
    }
  });

  it('returns the requested number of distinct distractors', () => {
    const picks = pickGraphemeDistractors({
      target: 's', count: 3, level: 1, confusions: {}, rng: makeRng(2),
    });
    expect(picks.length).toBe(3);
    expect(new Set(picks).size).toBe(3);
  });

  it('prefers a grapheme this child has actually confused with the target', () => {
    const confusions = { [confusionKey('m', 'w')]: 0, [confusionKey('m', 'a')]: 5 };
    const picks = pickGraphemeDistractors({
      target: 'm', count: 1, level: 1, confusions, rng: makeRng(3),
    });
    expect(picks).toEqual(['a']);
  });

  it('puts the logged confusion first on every seed, not just by shuffle luck', () => {
    const confusions = { [confusionKey('m', 'a')]: 5 };
    for (const seed of SEEDS) {
      const picks = pickGraphemeDistractors({
        target: 'm', count: 1, level: 1, confusions, rng: makeRng(seed),
      });
      expect(picks, `seed ${seed}`).toEqual(['a']);
    }
  });

  it('ranks the child\'s own confusions above the generally-confusable list', () => {
    // t is generally confusable with p and f, but this child mixes it up with i.
    const confusions = { [confusionKey('t', 'i')]: 1 };
    for (const seed of SEEDS) {
      const picks = pickGraphemeDistractors({
        target: 't', count: 3, level: 1, confusions, rng: makeRng(seed),
      });
      expect(picks[0], `seed ${seed}`).toBe('i');
      expect(picks.slice(1).sort()).toEqual(['f', 'p']);
    }
  });

  it('orders the child\'s own confusions by how often they happened', () => {
    const confusions = {
      [confusionKey('t', 'i')]: 1,
      [confusionKey('t', 'm')]: 4,
      [confusionKey('t', 's')]: 2,
    };
    const picks = pickGraphemeDistractors({
      target: 't', count: 3, level: 1, confusions, rng: makeRng(1),
    });
    expect(picks).toEqual(['m', 's', 'i']);
  });

  it('only counts a confusion in the direction it happened, and only for this target', () => {
    // The child answered 'm' when asked for 'a', and 'p' when asked for 't'.
    // Neither says anything about being asked for 'm'.
    const confusions = { [confusionKey('a', 'm')]: 9, [confusionKey('t', 'p')]: 9 };
    const picks = new Set(
      SEEDS.map((seed) =>
        pickGraphemeDistractors({
          target: 'm', count: 1, level: 1, confusions, rng: makeRng(seed),
        })[0],
      ),
    );
    // With no relevant history the choice is a shuffle, so it must vary.
    expect(picks.size).toBeGreaterThan(1);
  });

  it('falls back to the taught confusable list when there is no history', () => {
    // 't' is confusable with p, d, f — of which p and f are taught at Level 1.
    const picks = pickGraphemeDistractors({
      target: 't', count: 2, level: 1, confusions: {}, rng: makeRng(4),
    });
    expect(picks.slice().sort()).toEqual(['f', 'p']);
  });

  it('puts the generally-confusable list ahead of unrelated letters on every seed', () => {
    for (const seed of SEEDS) {
      const picks = pickGraphemeDistractors({
        target: 't', count: 2, level: 1, confusions: {}, rng: makeRng(seed),
      });
      expect(picks.slice().sort(), `seed ${seed}`).toEqual(['f', 'p']);
    }
  });

  it('varies which of several equally-confusable letters is chosen', () => {
    // t is confusable with both p and f; asking for one must not always give the same one.
    const firsts = new Set(
      SEEDS.map((seed) =>
        pickGraphemeDistractors({ target: 't', count: 1, level: 1, confusions: {}, rng: makeRng(seed) })[0],
      ),
    );
    expect([...firsts].sort()).toEqual(['f', 'p']);
  });

  it('shuffles the unrelated remainder so repeated questions do not form a pattern', () => {
    // s is confusable only with f (z is not taught), so the second pick is the remainder.
    const seconds = new Set<string>();
    for (const seed of SEEDS) {
      const picks = pickGraphemeDistractors({
        target: 's', count: 2, level: 1, confusions: {}, rng: makeRng(seed),
      });
      expect(picks[0]).toBe('f');
      seconds.add(picks[1]);
    }
    expect(seconds.size).toBeGreaterThan(2);
  });

  it('is deterministic for a given seed', () => {
    const args = { target: 'a', count: 3, level: 1, confusions: {} };
    const first = pickGraphemeDistractors({ ...args, rng: makeRng(77) });
    const second = pickGraphemeDistractors({ ...args, rng: makeRng(77) });
    expect(first).toEqual(second);
  });

  it('returns as many as it can rather than throwing when the pool is small', () => {
    const picks = pickGraphemeDistractors({
      target: 's', count: 99, level: 1, confusions: {}, rng: makeRng(5),
    });
    // Level 1 teaches 7 graphemes, so 6 are available as distractors.
    expect(picks.length).toBe(6);
  });

  it('returns nothing when the child has met only the target', () => {
    expect(
      pickGraphemeDistractors({
        target: 's', count: 3, level: 1, confusions: {}, rng: makeRng(1), allowed: ['s'],
      }),
    ).toEqual([]);
  });

  it('throws, naming the grapheme, when the target is not a real grapheme', () => {
    expect(() =>
      pickGraphemeDistractors({ target: 'zz', count: 1, level: 1, confusions: {}, rng: makeRng(1) }),
    ).toThrow(/unknown grapheme: zz/i);
  });

  it('does not mutate its inputs', () => {
    const allowed = ['s', 'a', 't', 'p'];
    const confusions = { [confusionKey('s', 'a')]: 2 };
    pickGraphemeDistractors({
      target: 's', count: 3, level: 1, confusions, rng: makeRng(1), allowed,
    });
    expect(allowed).toEqual(['s', 'a', 't', 'p']);
    expect(confusions).toEqual({ [confusionKey('s', 'a')]: 2 });
  });
});

describe('pickWordDistractors', () => {
  it('never includes the target and only uses picturable words', () => {
    const picks = pickWordDistractors({
      target: 'mat', count: 2, level: 1, rng: makeRng(1),
    });
    expect(picks).not.toContain('mat');
    // 'sat' has no picture, so it can never appear in Picture Match.
    expect(picks).not.toContain('sat');
  });

  it('never includes the target, or a picture-less word, whatever is asked for', () => {
    for (const seed of SEEDS) {
      const picks = pickWordDistractors({ target: 'mat', count: 99, level: 1, rng: makeRng(seed) });
      expect(picks).not.toContain('mat');
      expect(new Set(picks).size).toBe(picks.length);
      for (const id of picks) expect(WORDS[id].picture, id).toBeDefined();
    }
  });

  it('never includes the target even when allowedWords contains it', () => {
    const picks = pickWordDistractors({
      target: 'mat', count: 5, level: 1, rng: makeRng(1), allowedWords: ['mat', 'map', 'pat'],
    });
    expect(picks.sort()).toEqual(['map', 'pat']);
  });

  it('prefers minimal pairs — words differing from the target by one grapheme', () => {
    const picks = pickWordDistractors({
      target: 'mat', count: 2, level: 1, rng: makeRng(9),
    });
    // map differs only in the final grapheme; pat only in the first.
    expect(picks).toContain('map');
  });

  it('returns exactly the minimal pairs first, on every seed', () => {
    // Picturable one-grapheme neighbours of mat are map and pat; nothing else is that close.
    for (const seed of SEEDS) {
      const picks = pickWordDistractors({ target: 'mat', count: 2, level: 1, rng: makeRng(seed) });
      expect(picks.slice().sort(), `seed ${seed}`).toEqual(['map', 'pat']);
    }
    // sit's neighbours are sip (last), fit (first) and pit (first).
    for (const seed of SEEDS) {
      const picks = pickWordDistractors({ target: 'sit', count: 3, level: 1, rng: makeRng(seed) });
      expect(picks.slice().sort(), `seed ${seed}`).toEqual(['fit', 'pit', 'sip']);
    }
  });

  it('fills the rest from the next-closest words once the minimal pairs run out', () => {
    for (const seed of SEEDS) {
      const picks = pickWordDistractors({ target: 'mat', count: 3, level: 1, rng: makeRng(seed) });
      expect(picks.slice(0, 2).sort()).toEqual(['map', 'pat']);
      const differing = WORDS[picks[2]].graphemes.filter((g, i) => g !== WORDS.mat.graphemes[i]).length;
      expect(differing, `seed ${seed}: ${picks[2]}`).toBe(2);
    }
  });

  it('breaks ties by seed, so equally-close words are not always the same two', () => {
    const firsts = new Set(
      SEEDS.map((seed) => pickWordDistractors({ target: 'mat', count: 1, level: 1, rng: makeRng(seed) })[0]),
    );
    expect([...firsts].sort()).toEqual(['map', 'pat']);
  });

  it('ranks a word of a different length as far from the target', () => {
    for (const seed of SEEDS) {
      const picks = pickWordDistractors({
        target: 'at', count: 1, level: 1, rng: makeRng(seed), allowedWords: ['mat', 'pat', 'it'],
      });
      expect(picks, `seed ${seed}`).toEqual(['it']);
    }
  });

  it('draws only from allowedWords when given', () => {
    for (const seed of SEEDS) {
      const picks = pickWordDistractors({
        target: 'mat', count: 5, level: 1, rng: makeRng(seed), allowedWords: ['sip', 'tap', 'map'],
      });
      expect(picks.slice().sort()).toEqual(['map', 'sip', 'tap']);
    }
  });

  it('throws, naming the word, when the target is not a real word', () => {
    expect(() =>
      pickWordDistractors({ target: 'zzz', count: 1, level: 1, rng: makeRng(1) }),
    ).toThrow(/unknown word: zzz/i);
  });

  it('is deterministic for a given seed', () => {
    const first = pickWordDistractors({ target: 'sit', count: 2, level: 1, rng: makeRng(11) });
    const second = pickWordDistractors({ target: 'sit', count: 2, level: 1, rng: makeRng(11) });
    expect(first).toEqual(second);
  });
});

describe('pickTileDistractors', () => {
  it('never offers a tile the word already needs', () => {
    for (const seed of SEEDS) {
      const picks = pickTileDistractors({
        target: 'sit', count: 99, level: 1, confusions: {}, rng: makeRng(seed),
      });
      expect(picks.sort()).toEqual(['a', 'f', 'm', 'p']);
    }
  });

  it('only offers letters the child has met', () => {
    for (const seed of SEEDS) {
      const picks = pickTileDistractors({
        target: 'sit', count: 99, level: 1, confusions: {}, rng: makeRng(seed), allowed: ['s', 'i', 't', 'm'],
      });
      expect(picks).toEqual(['m']);
    }
  });

  it('puts letters confusable with the word first, by taught list or by this child\'s history', () => {
    // sat: s~f, a~i, t~p are taught confusions; m has no link unless the child's history makes one.
    for (const seed of SEEDS) {
      const byList = pickTileDistractors({
        target: 'sat', count: 3, level: 1, confusions: {}, rng: makeRng(seed),
      });
      expect(byList.sort(), `seed ${seed}`).toEqual(['f', 'i', 'p']);
      const byHistory = pickTileDistractors({
        target: 'sat', count: 4, level: 1, confusions: { [confusionKey('a', 'm')]: 1 }, rng: makeRng(seed),
      });
      expect(byHistory.slice(0, 4).sort(), `seed ${seed}`).toEqual(['f', 'i', 'm', 'p']);
    }
  });

  it('is deterministic for a given seed', () => {
    const args = { target: 'map', count: 3, level: 1, confusions: {} };
    expect(pickTileDistractors({ ...args, rng: makeRng(5) })).toEqual(
      pickTileDistractors({ ...args, rng: makeRng(5) }),
    );
  });

  it('throws, naming the word, when the target is not a real word', () => {
    expect(() =>
      pickTileDistractors({ target: 'zzz', count: 1, level: 1, confusions: {}, rng: makeRng(1) }),
    ).toThrow(/unknown word: zzz/i);
  });
});

describe('recordConfusion', () => {
  it('starts a count at 1 and increments it', () => {
    const once = recordConfusion({}, 'm', 'n');
    expect(once).toEqual({ [confusionKey('m', 'n')]: 1 });
    expect(recordConfusion(once, 'm', 'n')).toEqual({ [confusionKey('m', 'n')]: 2 });
  });

  it('keeps each direction separate and leaves other entries alone', () => {
    const map = recordConfusion({ [confusionKey('t', 'p')]: 3 }, 'p', 't');
    expect(map).toEqual({ [confusionKey('t', 'p')]: 3, [confusionKey('p', 't')]: 1 });
  });

  it('does not mutate the map it is given', () => {
    const before = { [confusionKey('m', 'n')]: 1 };
    const after = recordConfusion(before, 'm', 'n');
    expect(before).toEqual({ [confusionKey('m', 'n')]: 1 });
    expect(after).not.toBe(before);
  });
});

describe('config sanity', () => {
  it('keeps secondary weight below full credit', () => {
    expect(DEFAULT_CONFIG.secondaryWeight).toBeLessThan(1);
  });
});
