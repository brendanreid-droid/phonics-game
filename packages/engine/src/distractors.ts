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

/*
 * Contract shared by all three pickers, for whoever builds a session from them.
 *
 *  - `count` is the number of DISTRACTORS. TaskTypeMeta.minChoices/maxChoices
 *    count CHOICES, correct answer included, so the caller passes `choices - 1`.
 *  - The result is in RANKED order, most useful first. The caller must shuffle
 *    the final choice set, correct answer included; otherwise both the answer's
 *    position and the most-confused-first ordering become learnable.
 *  - The result may hold FEWER than `count` items when the pool is small.
 *    Check `length` rather than assuming.
 *  - Rule 1: nothing the child has not met is ever returned. That is enforced
 *    here for letters (`allowed` is validated and capped at `level`) and for
 *    words (`metGraphemes`, `level`), but only if the caller passes the child's
 *    real restriction. Omitting it means the FULL pool for `level`, which on
 *    day one includes letters and words the child has never seen. The session
 *    builder must pass one; see graphemesMetAt / wordsDecodableFrom.
 */

export interface GraphemeDistractorArgs {
  target: GraphemeId;
  /** Number of distractors wanted, i.e. choices minus one. May come back shorter. */
  count: number;
  level: number;
  confusions: ConfusionMap;
  rng: Rng;
  /**
   * Graphemes the child has actually been introduced to. An unknown id throws;
   * one introduced after `level` is silently dropped. Omitting it means
   * everything taught by `level`, which on day one is more than the child has
   * met: the session builder must pass a restriction (see `graphemesMetAt`).
   */
  allowed?: GraphemeId[];
}

/**
 * Wrong letters for a sound question, best teaching value first:
 *   1. graphemes this child has demonstrably confused with the target
 *   2. graphemes children generally confuse with it, that this child has met
 *   3. anything else already taught
 *
 * Tiers 2 and 3 are shuffled so repeated questions do not become a memorisable
 * pattern. Nothing the child has not met is ever offered: an unknown letter as
 * a wrong answer teaches nothing and reads to a child as a trick.
 *
 * Returns up to `count` distractors in ranked order (see the contract above):
 * the caller shuffles the final choices and checks `length`.
 */
export function pickGraphemeDistractors(args: GraphemeDistractorArgs): GraphemeId[] {
  const { target, count, level, confusions, rng } = args;
  // Throws on an unknown target rather than quietly offering unranked letters.
  const confusableWith = getGrapheme(target).confusableWith;
  const pool = metPool(args.allowed, level);
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
  /** Number of distractors wanted, i.e. choices minus one. May come back shorter. */
  count: number;
  level: number;
  rng: Rng;
  /**
   * What this child has mixed up, as logged by `recordConfusion`. Word
   * confusions are keyed `${target}>${chosen}`. Required, as it is for the
   * other two pickers: leaving it optional let a caller forget it and silently
   * lose the adaptive behaviour, with nothing to say so. A child with no
   * history passes `{}` on purpose.
   */
  confusions: ConfusionMap;
  /** Restricts the pool to words the child can actually decode. */
  allowedWords?: WordId[];
  /**
   * Graphemes the child has met. A word is only offered if every one of its
   * graphemes is in this set; it applies to the default pool and to
   * `allowedWords` alike. Unknown ids throw. Omitting it means every word at
   * `level`, which on day one includes words built from letters the child has
   * never seen: the session builder must pass one (see `graphemesMetAt`).
   */
  metGraphemes?: GraphemeId[];
  /**
   * For Word Pick, which shows one picture and three WRITTEN words. Ranks words
   * that start with the same grapheme as the target ahead of every other word,
   * nearest first within them, so a child cannot succeed by matching the first
   * letter and guessing: `map` against `mat`, not `sip` against `mat`. Picture
   * Match leaves this off, because its wrong answers are pictures and a shared
   * first letter is no shortcut there.
   *
   * A mix-up the child has actually made still comes first of all.
   */
  sharedFirstGrapheme?: boolean;
}

/**
 * Wrong pictures for a reading question, best teaching value first:
 *   1. words this child has demonstrably confused with the target
 *   2. with `sharedFirstGrapheme`, words starting with the target's first
 *      grapheme (Word Pick only), nearest first
 *   3. the closest words by grapheme distance, so minimal pairs first
 *      (mat/map/pat differ by a single grapheme, so choosing between them
 *      requires actually decoding rather than recognising a word's silhouette)
 *
 * Only words with a picture are ever offered, whatever pool is passed, because
 * a picture-less word would render as a blank card. Equally-close words are
 * ordered by the seed.
 *
 * Returns up to `count` distractors in ranked order (see the contract above):
 * the caller shuffles the final choices and checks `length`.
 */
export function pickWordDistractors(args: WordDistractorArgs): WordId[] {
  const { target, count, level, confusions, rng } = args;
  const targetGraphemes = getWord(target).graphemes;
  const met = args.metGraphemes ? new Set(args.metGraphemes.map((g) => getGrapheme(g).id)) : undefined;

  const basePool = unique(args.allowedWords ?? picturableWordsForLevel(level).map((w) => w.id));
  // Whatever the caller passes, a distractor without a picture would render as
  // a blank card in Picture Match, and a word from beyond `level` or built from
  // an unmet grapheme would be a trick question, so none is ever a candidate.
  const pool = basePool.filter((id) => {
    if (id === target) return false;
    const word = getWord(id);
    return (
      word.picture !== undefined &&
      word.decodableFromLevel <= level &&
      (met === undefined || word.graphemes.every((g) => met.has(g)))
    );
  });

  const confusedWith = pool
    .filter((id) => (confusions[confusionKey(target, id)] ?? 0) > 0)
    .sort((a, b) => (confusions[confusionKey(target, b)] ?? 0) - (confusions[confusionKey(target, a)] ?? 0));

  // Shuffle first, then a stable sort: equally-close words keep their shuffled
  // order, so ties are broken by the seed rather than by authoring order.
  const byCloseness = shuffle(
    pool.filter((id) => !confusedWith.includes(id)),
    rng,
  )
    .map((id) => ({
      id,
      distance: graphemeDistance(targetGraphemes, getWord(id).graphemes),
      // 0 sorts first. Only Word Pick asks for it.
      sharesFirst: args.sharedFirstGrapheme === true && getWord(id).graphemes[0] === targetGraphemes[0] ? 0 : 1,
    }))
    .sort((a, b) => a.sharesFirst - b.sharesFirst || a.distance - b.distance)
    .map((entry) => entry.id);

  return [...confusedWith, ...byCloseness].slice(0, clampCount(count));
}

/** `slice(0, -1)` drops only the last item rather than returning nothing, so a negative count is clamped. */
function clampCount(count: number): number {
  return Math.max(0, count);
}

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

/**
 * The graphemes a child may be shown: `allowed` (or everything at `level`),
 * deduplicated, with an unknown id thrown by name and any grapheme introduced
 * after `level` silently dropped. An unknown id can only be our own bug; a
 * future-level id must simply never reach a child, whatever the caller does.
 */
function metPool(allowed: readonly GraphemeId[] | undefined, level: number): GraphemeId[] {
  if (allowed === undefined) return graphemesForLevel(level).map((g) => g.id);
  return unique(allowed.map((id) => getGrapheme(id)))
    .filter((g) => g.introducedInLevel <= level)
    .map((g) => g.id);
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

export interface TileDistractorArgs {
  target: WordId;
  /** Number of EXTRA tiles wanted. May come back shorter. */
  count: number;
  level: number;
  confusions: ConfusionMap;
  rng: Rng;
  /** Same meaning and validation as `GraphemeDistractorArgs.allowed`. */
  allowed?: GraphemeId[];
}

/**
 * Extra letter tiles for Word Builder, beyond the ones the word needs, best
 * teaching value first:
 *   1. letters this child has confused with any grapheme in the word, ordered
 *      by their count summed across the word's distinct graphemes
 *   2. letters on the generic `confusableWith` list of any of the word's
 *      graphemes. These make the child listen to the word rather than guess
 *      its shape.
 *   3. anything else already met
 * Tiers 2 and 3 are shuffled.
 *
 * Returns up to `count` extras in ranked order. The word's own tiles are NOT
 * included and are not chosen here: the caller takes them from
 * `getWord(target).graphemes` as a multiset (`pip` needs two `p` tiles), and
 * must shuffle needed and extra tiles together. The picker works from the
 * distinct set of those graphemes and never returns any of them as an extra.
 */
export function pickTileDistractors(args: TileDistractorArgs): GraphemeId[] {
  const { target, count, level, confusions, rng } = args;
  const needed = new Set(getWord(target).graphemes);
  const taught = metPool(args.allowed, level).filter((id) => !needed.has(id));

  const confusionTotal = (id: GraphemeId): number =>
    [...needed].reduce((sum, g) => sum + (confusions[confusionKey(g, id)] ?? 0), 0);

  const confusedWith = taught.filter((id) => confusionTotal(id) > 0).sort((a, b) => confusionTotal(b) - confusionTotal(a));

  const generallyConfusable = shuffle(
    taught.filter(
      (id) => !confusedWith.includes(id) && [...needed].some((g) => getGrapheme(g).confusableWith.includes(id)),
    ),
    rng,
  );

  const remainder = shuffle(
    taught.filter((id) => !confusedWith.includes(id) && !generallyConfusable.includes(id)),
    rng,
  );

  return [...confusedWith, ...generallyConfusable, ...remainder].slice(0, clampCount(count));
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
