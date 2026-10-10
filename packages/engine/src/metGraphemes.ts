import {
  getGrapheme,
  getLevel,
  graphemesForLevel,
  introductionGroupIndex,
  wordsForLevel,
} from '@soundlings/curriculum';
import type { GraphemeId, WordId } from '@soundlings/curriculum';

/**
 * Every grapheme a child can be assumed to have met, given the graphemes a
 * quest is currently focused on: all graphemes taught at an earlier level, plus
 * every introduction group of `level` up to and including the furthest group a
 * focus grapheme sits in. Returned in teaching order.
 *
 * On day one a child has met two letters, not seven, so this is what the
 * session builder should pass as `allowed` / `metGraphemes` to the distractor
 * pickers.
 *
 * A focus grapheme taught at an earlier level has group index -1 and says
 * nothing about how far through this level the child is. If every focus
 * grapheme is like that, the whole level is treated as open.
 *
 * Throws on an empty focus (silently opening the whole level would defeat the
 * purpose), on an unknown grapheme, and on one not yet taught by `level`.
 */
export function graphemesMetAt(level: number, focusGraphemes: readonly GraphemeId[]): GraphemeId[] {
  if (focusGraphemes.length === 0) {
    throw new Error('graphemesMetAt needs at least one focus grapheme');
  }
  const furthest = Math.max(...focusGraphemes.map((g) => introductionGroupIndex(level, g)));
  const available = graphemesForLevel(level);
  if (furthest === -1) return available.map((g) => g.id);

  const openedThisLevel = new Set(getLevel(level).introductionGroups.slice(0, furthest + 1).flat());
  return available
    .filter((g) => g.introducedInLevel < level || openedThisLevel.has(g.id))
    .map((g) => g.id);
}

/**
 * Every word available at `level` that is built entirely from `metGraphemes`,
 * picture or not (spelling and blending use picture-less words too).
 * Throws on an unknown grapheme.
 */
export function wordsDecodableFrom(level: number, metGraphemes: readonly GraphemeId[]): WordId[] {
  const met = new Set(metGraphemes.map((g) => getGrapheme(g).id));
  return wordsForLevel(level)
    .filter((w) => w.graphemes.every((g) => met.has(g)))
    .map((w) => w.id);
}
