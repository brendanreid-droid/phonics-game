import { GRAPHEME_LIST, getGrapheme } from './graphemes';
import { TRICKY_WORD_LIST } from './trickyWords';
import { LEVELS } from './levels';
import { CREATURE_LIST } from './creatures';
import { PICTURABLE_WORD_LIST, WORD_LIST } from './words';
import type { Creature, Grapheme, GraphemeId, Level, Word } from './types';

export function getLevel(levelNumber: number): Level {
  const level = LEVELS.find((l) => l.number === levelNumber);
  if (!level) throw new Error(`Unknown level: ${levelNumber}`);
  return level;
}

/** Every grapheme taught at or before `levelNumber`, in teaching order. */
export function graphemesForLevel(levelNumber: number): Grapheme[] {
  return GRAPHEME_LIST.filter((g) => g.introducedInLevel <= levelNumber).sort(
    (a, b) => a.sequenceIndex - b.sequenceIndex,
  );
}

/** Every decodable word available at or before `levelNumber`. */
export function wordsForLevel(levelNumber: number): Word[] {
  return WORD_LIST.filter((w) => w.decodableFromLevel <= levelNumber);
}

/** Words at or before `levelNumber` that carry a picture. */
export function picturableWordsForLevel(levelNumber: number): Word[] {
  return PICTURABLE_WORD_LIST.filter((w) => w.decodableFromLevel <= levelNumber);
}

export function creatureForGrapheme(graphemeId: GraphemeId): Creature {
  const creature = CREATURE_LIST.find((c) => c.graphemeId === graphemeId);
  if (!creature) throw new Error(`No creature for grapheme: ${graphemeId}`);
  return creature;
}

/**
 * The introduction group a grapheme belongs to within `levelNumber`, zero-indexed.
 * Used by the session builder to decide what counts as "current" versus "review".
 *
 * - Taught in this level: its group index.
 * - Taught in an EARLIER level: -1, meaning "taught earlier, treat as oldest".
 * - Not a known grapheme, or not yet taught by this level: throws.
 */
export function introductionGroupIndex(levelNumber: number, graphemeId: GraphemeId): number {
  const grapheme = getGrapheme(graphemeId);
  const groups = getLevel(levelNumber).introductionGroups;
  const index = groups.findIndex((group) => group.includes(graphemeId));
  if (index !== -1) return index;
  if (grapheme.introducedInLevel < levelNumber) return -1;
  throw new Error(`Grapheme ${graphemeId} is not taught in level ${levelNumber}`);
}

/** Every audio key the curriculum references. Used by the audio integrity test. */
export function allAudioKeys(): string[] {
  const keys = new Set<string>();
  for (const g of GRAPHEME_LIST) {
    keys.add(g.audio.phoneme);
    keys.add(g.audio.letterName);
  }
  for (const w of WORD_LIST) keys.add(w.audio);
  for (const w of TRICKY_WORD_LIST) keys.add(w.audio);
  return [...keys].sort();
}
