import { describe, expect, it } from 'vitest';
import { WORDS } from '@soundlings/curriculum';
import { DEFAULT_CONFIG } from './config';
import {
  graphemeDistance,
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

  it('does not offer a letter twice if `allowed` repeats it', () => {
    for (const seed of SEEDS) {
      const picks = pickGraphemeDistractors({
        target: 's', count: 5, level: 1, confusions: {}, rng: makeRng(seed), allowed: ['s', 'a', 'a', 't', 'a', 't'],
      });
      expect(picks.slice().sort(), `seed ${seed}`).toEqual(['a', 't']);
    }
  });

  it('returns nothing for a zero or negative count, rather than slicing from the end', () => {
    for (const count of [0, -1, -5]) {
      expect(
        pickGraphemeDistractors({ target: 's', count, level: 1, confusions: {}, rng: makeRng(1) }),
        `count ${count}`,
      ).toEqual([]);
    }
  });

  it('throws, naming the grapheme, when `allowed` contains an unknown id', () => {
    expect(() =>
      pickGraphemeDistractors({
        target: 's', count: 3, level: 1, confusions: {}, rng: makeRng(1), allowed: ['s', 'a', 'zz'],
      }),
    ).toThrow(/unknown grapheme: zz/i);
  });

  it('silently drops an allowed grapheme introduced after the requested level', () => {
    // Every real grapheme is Level 1, so level 0 puts all of them "in the future".
    // The two-level case is covered in metGraphemes.earlier.test.ts.
    expect(
      pickGraphemeDistractors({
        target: 's', count: 3, level: 0, confusions: {}, rng: makeRng(1), allowed: ['s', 'a', 't'],
      }),
    ).toEqual([]);
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

  it('excludes a picture-less word even when allowedWords offers it', () => {
    // 'sat' and 'it' have no picture; offered as a wrong answer they would be a blank card.
    for (const seed of SEEDS) {
      const picks = pickWordDistractors({
        target: 'mat', count: 5, level: 1, rng: makeRng(seed), allowedWords: ['sat', 'it', 'map', 'sip'],
      });
      expect(picks.slice().sort(), `seed ${seed}`).toEqual(['map', 'sip']);
    }
  });

  it('can still be asked about a picture-less target, offering only picturable words', () => {
    const picks = pickWordDistractors({ target: 'sat', count: 99, level: 1, rng: makeRng(1) });
    expect(picks).not.toContain('sat');
    expect(picks.length).toBeGreaterThan(0);
    for (const id of picks) expect(WORDS[id].picture, id).toBeDefined();
  });

  it('does not offer the same word twice if allowedWords repeats it', () => {
    const picks = pickWordDistractors({
      target: 'mat', count: 5, level: 1, rng: makeRng(1), allowedWords: ['map', 'map', 'pat', 'map'],
    });
    expect(picks.slice().sort()).toEqual(['map', 'pat']);
  });

  it('puts words the child has actually confused with the target first, ahead of minimal pairs', () => {
    // pit is two graphemes from mat, so only the child's own history can rank it first.
    const confusions = { [confusionKey('mat', 'pit')]: 2 };
    for (const seed of SEEDS) {
      const picks = pickWordDistractors({ target: 'mat', count: 1, level: 1, rng: makeRng(seed), confusions });
      expect(picks, `seed ${seed}`).toEqual(['pit']);
    }
  });

  it('orders the child\'s own word confusions by count, then falls back to minimal pairs', () => {
    const confusions = { [confusionKey('mat', 'pit')]: 2, [confusionKey('mat', 'tap')]: 5 };
    for (const seed of SEEDS) {
      const picks = pickWordDistractors({ target: 'mat', count: 4, level: 1, rng: makeRng(seed), confusions });
      expect(picks.slice(0, 2), `seed ${seed}`).toEqual(['tap', 'pit']);
      expect(picks.slice(2).sort(), `seed ${seed}`).toEqual(['map', 'pat']);
    }
  });

  it('shows a pair the child reliably mixes up even when it is not a closer match than the rest', () => {
    const confusions = { [confusionKey('mat', 'map')]: 4 };
    for (const seed of SEEDS) {
      expect(
        pickWordDistractors({ target: 'mat', count: 1, level: 1, rng: makeRng(seed), confusions }),
      ).toEqual(['map']);
    }
  });

  it('only counts a word confusion in the direction it happened, and only when the count is positive', () => {
    const confusions = { [confusionKey('pit', 'mat')]: 9, [confusionKey('mat', 'sip')]: 0 };
    for (const seed of SEEDS) {
      const picks = pickWordDistractors({ target: 'mat', count: 2, level: 1, rng: makeRng(seed), confusions });
      expect(picks.slice().sort(), `seed ${seed}`).toEqual(['map', 'pat']);
    }
  });

  it('ignores a logged confusion with a word that is not eligible to be shown', () => {
    // sat has no picture; fit contains an f the child has not met.
    const confusions = { [confusionKey('mat', 'sat')]: 9, [confusionKey('mat', 'fit')]: 9 };
    for (const seed of SEEDS) {
      const picks = pickWordDistractors({
        target: 'mat', count: 99, level: 1, rng: makeRng(seed), confusions,
        metGraphemes: ['m', 'a', 't', 'p', 'i', 's'],
      });
      expect(picks).not.toContain('sat');
      expect(picks).not.toContain('fit');
    }
  });

  it('never offers a word built from a grapheme the child has not met', () => {
    // sit with i, s, t, p met: mat and map need an unmet a and m; fit needs f.
    for (const seed of SEEDS) {
      const picks = pickWordDistractors({
        target: 'sit', count: 99, level: 1, rng: makeRng(seed), metGraphemes: ['s', 'i', 't', 'p'],
      });
      expect(picks.slice().sort(), `seed ${seed}`).toEqual(['pip', 'pit', 'sip']);
    }
  });

  it('offers those words when no restriction is given, which is why the session builder must pass one', () => {
    const seen = new Set<string>();
    for (const seed of SEEDS) {
      for (const id of pickWordDistractors({ target: 'sit', count: 99, level: 1, rng: makeRng(seed) })) seen.add(id);
    }
    expect(seen.has('mat')).toBe(true);
  });

  it('applies the met-grapheme restriction to allowedWords too', () => {
    const picks = pickWordDistractors({
      target: 'sit', count: 5, level: 1, rng: makeRng(1),
      allowedWords: ['sip', 'mat', 'pit'], metGraphemes: ['s', 'i', 't', 'p'],
    });
    expect(picks.slice().sort()).toEqual(['pit', 'sip']);
  });

  it('throws, naming the grapheme, when metGraphemes contains an unknown id', () => {
    expect(() =>
      pickWordDistractors({ target: 'sit', count: 1, level: 1, rng: makeRng(1), metGraphemes: ['s', 'zz'] }),
    ).toThrow(/unknown grapheme: zz/i);
  });

  it('never offers a word from beyond the requested level, even if allowedWords lists it', () => {
    // Every real word is Level 1, so level 0 puts all of them in the future.
    expect(
      pickWordDistractors({ target: 'mat', count: 3, level: 0, rng: makeRng(1), allowedWords: ['map', 'pat'] }),
    ).toEqual([]);
  });

  it('draws only from allowedWords when given', () => {
    for (const seed of SEEDS) {
      const picks = pickWordDistractors({
        target: 'mat', count: 5, level: 1, rng: makeRng(seed), allowedWords: ['sip', 'tap', 'map'],
      });
      expect(picks.slice().sort()).toEqual(['map', 'sip', 'tap']);
    }
  });

  it('returns nothing for a zero or negative count, rather than slicing from the end', () => {
    for (const count of [0, -1, -5]) {
      expect(pickWordDistractors({ target: 'mat', count, level: 1, rng: makeRng(1) }), `count ${count}`).toEqual([]);
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

describe('graphemeDistance', () => {
  it('is 0 for identical graphemes', () => {
    expect(graphemeDistance(['m', 'a', 't'], ['m', 'a', 't'])).toBe(0);
  });

  it('counts each differing position for equal-length words', () => {
    expect(graphemeDistance(['m', 'a', 't'], ['m', 'a', 'p'])).toBe(1);
    expect(graphemeDistance(['m', 'a', 't'], ['p', 'a', 't'])).toBe(1);
    expect(graphemeDistance(['m', 'a', 't'], ['m', 'i', 'p'])).toBe(2);
    expect(graphemeDistance(['m', 'a', 't'], ['s', 'i', 'p'])).toBe(3);
  });

  it('is symmetric for equal-length words', () => {
    expect(graphemeDistance(['s', 'i', 't'], ['f', 'i', 'p'])).toBe(
      graphemeDistance(['f', 'i', 'p'], ['s', 'i', 't']),
    );
  });

  it('treats words of different length as maximally distant, in either argument order', () => {
    // Even when the shorter word is a prefix of the longer one.
    expect(graphemeDistance(['a', 't'], ['m', 'a', 't'])).toBe(3);
    expect(graphemeDistance(['m', 'a', 't'], ['a', 't'])).toBe(3);
    expect(graphemeDistance(['s', 'a', 't'], ['s', 'a', 't', 's'])).toBe(4);
    expect(graphemeDistance(['s', 'a', 't', 's'], ['s', 'a', 't'])).toBe(4);
  });

  it('ranks a different-length word no closer than a same-length word differing everywhere', () => {
    expect(graphemeDistance(['m', 'a', 't'], ['a', 't'])).toBeGreaterThanOrEqual(
      graphemeDistance(['m', 'a', 't'], ['s', 'i', 'p']),
    );
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

  it('does not offer a tile twice if `allowed` repeats it', () => {
    const picks = pickTileDistractors({
      target: 'sit', count: 9, level: 1, confusions: {}, rng: makeRng(1), allowed: ['s', 'i', 'm', 'm', 'a', 'm'],
    });
    expect(picks.slice().sort()).toEqual(['a', 'm']);
  });

  it('returns nothing for a zero or negative count, rather than slicing from the end', () => {
    for (const count of [0, -1, -5]) {
      expect(
        pickTileDistractors({ target: 'sit', count, level: 1, confusions: {}, rng: makeRng(1) }),
        `count ${count}`,
      ).toEqual([]);
    }
  });

  it('excludes every grapheme of a word with a repeated letter, not just its distinct tiles', () => {
    // pip needs two p tiles and an i; none of those may come back as an "extra".
    for (const seed of SEEDS) {
      const picks = pickTileDistractors({
        target: 'pip', count: 99, level: 1, confusions: {}, rng: makeRng(seed),
      });
      expect(picks).not.toContain('p');
      expect(picks).not.toContain('i');
      expect(picks.slice().sort(), `seed ${seed}`).toEqual(['a', 'f', 'm', 's', 't']);
    }
  });

  it('puts letters this child has confused with the word ahead of every generally-confusable one', () => {
    // sat: f, i and p are generally confusable; m is not. Only the child's history can put m first.
    const confusions = { [confusionKey('a', 'm')]: 1 };
    for (const seed of SEEDS) {
      const picks = pickTileDistractors({ target: 'sat', count: 1, level: 1, confusions, rng: makeRng(seed) });
      expect(picks, `seed ${seed}`).toEqual(['m']);
    }
  });

  it('orders the child\'s own tile confusions by their summed count across the word\'s graphemes', () => {
    // m totals 4 (2 + 2) and p totals 3; a per-grapheme maximum would rank p first.
    const confusions = {
      [confusionKey('s', 'm')]: 2,
      [confusionKey('a', 'm')]: 2,
      [confusionKey('t', 'p')]: 3,
    };
    for (const seed of SEEDS) {
      const picks = pickTileDistractors({ target: 'sat', count: 3, level: 1, confusions, rng: makeRng(seed) });
      expect(picks.slice(0, 2), `seed ${seed}`).toEqual(['m', 'p']);
    }
  });

  it('only counts a tile confusion in the direction it happened', () => {
    // The child answered s when asked for m. That says nothing about m as a wrong tile for sip.
    const confusions = { [confusionKey('m', 's')]: 9 };
    const firsts = new Set(
      SEEDS.map((seed) =>
        pickTileDistractors({ target: 'sip', count: 1, level: 1, confusions, rng: makeRng(seed) })[0],
      ),
    );
    expect(firsts.size).toBeGreaterThan(1);
  });

  it('varies which of several generally-confusable tiles is chosen', () => {
    // sat: f, i and p are all on its letters\' confusable lists.
    const firsts = new Set(
      SEEDS.map((seed) =>
        pickTileDistractors({ target: 'sat', count: 1, level: 1, confusions: {}, rng: makeRng(seed) })[0],
      ),
    );
    expect([...firsts].sort()).toEqual(['f', 'i', 'p']);
  });

  it('puts generally-confusable tiles ahead of unrelated ones on every seed', () => {
    for (const seed of SEEDS) {
      const picks = pickTileDistractors({ target: 'sat', count: 3, level: 1, confusions: {}, rng: makeRng(seed) });
      expect(picks.slice().sort(), `seed ${seed}`).toEqual(['f', 'i', 'p']);
    }
  });

  it('shuffles the unrelated remainder so the same extras do not always appear', () => {
    // am: only i is a taught confusion of a or m, so the second tile comes from s, t, p, f.
    const seconds = new Set<string>();
    for (const seed of SEEDS) {
      const picks = pickTileDistractors({ target: 'am', count: 2, level: 1, confusions: {}, rng: makeRng(seed) });
      expect(picks[0]).toBe('i');
      seconds.add(picks[1]);
    }
    expect(seconds.size).toBeGreaterThan(2);
  });

  it('throws, naming the grapheme, when `allowed` contains an unknown id', () => {
    expect(() =>
      pickTileDistractors({
        target: 'sit', count: 3, level: 1, confusions: {}, rng: makeRng(1), allowed: ['s', 'i', 'zz'],
      }),
    ).toThrow(/unknown grapheme: zz/i);
  });

  it('silently drops an allowed grapheme introduced after the requested level', () => {
    expect(
      pickTileDistractors({
        target: 'sit', count: 3, level: 0, confusions: {}, rng: makeRng(1), allowed: ['a', 'm'],
      }),
    ).toEqual([]);
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
