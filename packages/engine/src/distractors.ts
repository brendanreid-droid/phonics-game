import {
  getGrapheme,
  getWord,
  graphemesForLevel,
  picturableWordsForLevel,
} from '@soundlings/curriculum';
import type { GraphemeId, TargetId, WordId } from '@soundlings/curriculum';
import { shuffle } from './rng';
import type { Rng } from './rng';
import { confusionKey } from './types';
import type { ConfusionMap } from './types';

export interface GraphemeDistractorArgs {
  target: GraphemeId;
  count: number;
  level: number;
  confusions: ConfusionMap;
  rng: Rng;
  /**
   * Graphemes the child has actually been introduced to. Defaults to
   * everything taught by `level`. The session builder passes a narrower set,
   * because on day one a child has met two letters, not seven.
   */
  allowed?: GraphemeId[];
}

/**
 * Wrong letters for a sound question, best teaching value first:
 *   1. graphemes this child has demonstrably confused with the target
 *   2. graphemes children generally confuse with it, that this child has met
 *   3. anything else already taught
 *
 * Tier 3 is shuffled so repeated questions do not become a memorisable pattern.
 * Nothing from a future level is ever offered — an unknown letter as a wrong
 * answer teaches nothing and reads to a child as a trick.
 */
export function pickGraphemeDistractors(args: GraphemeDistractorArgs): GraphemeId[] {
  const { target, count, level, confusions, rng } = args;
  // Throws on an unknown target rather than quietly offering unranked letters.
  const confusableWith = getGrapheme(target).confusableWith;
  const pool = unique(args.allowed ?? graphemesForLevel(level).map((g) => g.id));
  const taught = pool.filter((id) => id !== target);

  const confusedWith = taught
    .filter((id) => (confusions[confusionKey(target, id)] ?? 0) > 0)
    .sort((a, b) => (confusions[confusionKey(target, b)] ?? 0) - (confusions[confusionKey(target, a)] ?? 0));

  const generallyConfusable = shuffle(
    confusableWith.filter((id) => taught.includes(id) && !confusedWith.includes(id)),
    rng,
  );

  const remainder = shuffle(
    taught.filter((id) => !confusedWith.includes(id) && !generallyConfusable.includes(id)),
    rng,
  );

  return [...confusedWith, ...generallyConfusable, ...remainder].slice(0, clampCount(count));
}

export interface WordDistractorArgs {
  target: WordId;
  count: number;
  level: number;
  rng: Rng;
  /** Restricts the pool to words the child can actually decode. */
  allowedWords?: WordId[];
}

/**
 * Wrong pictures for a reading question. Minimal pairs first — mat/map/pat
 * differ by a single grapheme, so choosing between them requires actually
 * decoding rather than recognising a word's silhouette.
 */
export function pickWordDistractors(args: WordDistractorArgs): WordId[] {
  const { target, count, level, rng } = args;
  const targetGraphemes = getWord(target).graphemes;

  const basePool = unique(args.allowedWords ?? picturableWordsForLevel(level).map((w) => w.id));
  // Whatever the caller passes, a distractor without a picture would render as
  // a blank card in Picture Match, so it is never a candidate.
  const pool = basePool.filter((id) => id !== target && getWord(id).picture !== undefined);

  // Shuffle first, then a stable sort: equally-close words keep their shuffled
  // order, so ties are broken by the seed rather than by authoring order.
  const scored = shuffle(pool, rng).map((id) => ({
    id,
    distance: graphemeDistance(targetGraphemes, getWord(id).graphemes),
  }));

  scored.sort((a, b) => a.distance - b.distance);
  return scored.slice(0, clampCount(count)).map((entry) => entry.id);
}

/** `slice(0, -1)` drops only the last item rather than returning nothing, so a negative count is clamped. */
function clampCount(count: number): number {
  return Math.max(0, count);
}

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

/**
 * How many positions differ. Different lengths count as maximally distant.
 *
 * The different-length branch is unreachable via Level 1 data, because every
 * picturable word there is CVC. It exists for the Level 2 blends (stop, slip,
 * hand) and is covered by direct unit tests. Do not delete it as dead code.
 */
export function graphemeDistance(a: readonly GraphemeId[], b: readonly GraphemeId[]): number {
  if (a.length !== b.length) return Math.max(a.length, b.length);
  let distance = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) distance += 1;
  }
  return distance;
}

/** Extra letter tiles for Word Builder, beyond the ones the word needs. */
export function pickTileDistractors(args: {
  target: WordId;
  count: number;
  level: number;
  confusions: ConfusionMap;
  rng: Rng;
  allowed?: GraphemeId[];
}): GraphemeId[] {
  const { target, count, level, confusions, rng } = args;
  const needed = new Set(getWord(target).graphemes);
  const pool = unique(args.allowed ?? graphemesForLevel(level).map((g) => g.id));
  const taught = pool.filter((id) => !needed.has(id));

  // Prefer letters confusable with any grapheme in the word — those are the
  // tiles that make the child listen to the word rather than guess its shape.
  const confusable = taught.filter((id) =>
    [...needed].some(
      (g) =>
        getGrapheme(g).confusableWith.includes(id) ||
        (confusions[confusionKey(g, id)] ?? 0) > 0,
    ),
  );

  const rest = taught.filter((id) => !confusable.includes(id));
  return [...shuffle(confusable, rng), ...shuffle(rest, rng)].slice(0, clampCount(count));
}

/** Folds one wrong answer into the confusion map. Does not mutate. */
export function recordConfusion(
  confusions: ConfusionMap,
  target: TargetId,
  chosen: TargetId,
): ConfusionMap {
  const key = confusionKey(target, chosen);
  return { ...confusions, [key]: (confusions[key] ?? 0) + 1 };
}
