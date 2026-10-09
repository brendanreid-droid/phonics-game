export * from './types';
export { GRAPHEMES, GRAPHEME_LIST } from './graphemes';
export { WORDS, WORD_LIST, PICTURABLE_WORD_LIST } from './words';
export { TRICKY_WORDS, TRICKY_WORD_LIST } from './trickyWords';
export { CREATURES, CREATURE_LIST } from './creatures';
export { LEVELS } from './levels';

import { GRAPHEME_LIST } from './graphemes';
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
 * The introduction group a grapheme belongs to, zero-indexed. Used by the
 * session builder to decide what counts as "current" versus "review".
 */
export function introductionGroupIndex(levelNumber: number, graphemeId: GraphemeId): number {
  const groups = getLevel(levelNumber).introductionGroups;
  const index = groups.findIndex((group) => group.includes(graphemeId));
  if (index === -1) throw new Error(`Grapheme ${graphemeId} is not in level ${levelNumber}`);
  return index;
}

/** Every audio key the curriculum references. Used by the audio integrity test. */
export function allAudioKeys(): string[] {
  const keys = new Set<string>();
  for (const g of GRAPHEME_LIST) {
    keys.add(g.audio.phoneme);
    keys.add(g.audio.letterName);
  }
  for (const w of WORD_LIST) keys.add(w.audio);
  return [...keys].sort();
}
