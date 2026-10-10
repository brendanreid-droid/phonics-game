import {
  creatureForGrapheme,
  graphemesForLevel,
  picturableWordsForLevel,
  wordsForLevel,
} from '@soundlings/curriculum';
import { withDefaults } from './config';
import type { EngineConfig } from './config';
import { getRecord, isMastered } from './mastery';
import type { MasteryMap } from './types';

export interface LevelProgress {
  level: number;
  graphemesMastered: number;
  graphemesRequired: number;
  blendWordsMastered: number;
  blendWordsRequired: number;
  segmentWordsMastered: number;
  segmentWordsRequired: number;
  /** 0..1, for a progress bar. */
  fraction: number;
  creaturesEarned: string[];
  complete: boolean;
}

/**
 * A level is finished when the child can prove it, not when they have played a
 * fixed number of games. A grapheme counts only when *both* sound skills are
 * mastered: recognising `s` on sight and recalling it from the sound /s/ are
 * different abilities, and reading needs both.
 *
 * Judged at `now`, like mastery itself: this is a claim about the present, so
 * a level that was complete can read as incomplete once the evidence has
 * decayed. Callers that need "has ever completed" must latch it themselves.
 */
export function levelProgress(
  level: number,
  mastery: MasteryMap,
  now: number,
  partialConfig?: Partial<EngineConfig>,
): LevelProgress {
  const config = withDefaults(partialConfig);
  const graphemes = graphemesForLevel(level);

  const masteredGraphemes = graphemes.filter(
    (g) =>
      isMastered(getRecord(mastery, g.id, 'SOUND_ID', config), now, config) &&
      isMastered(getRecord(mastery, g.id, 'LETTER_SOUND', config), now, config),
  );

  const blendWordsMastered = picturableWordsForLevel(level).filter((w) =>
    isMastered(getRecord(mastery, w.id, 'BLEND_READ', config), now, config),
  ).length;

  const segmentWordsMastered = wordsForLevel(level).filter((w) =>
    isMastered(getRecord(mastery, w.id, 'SEGMENT_SPELL', config), now, config),
  ).length;

  const parts = [
    masteredGraphemes.length / graphemes.length,
    Math.min(1, blendWordsMastered / config.blendWordsRequired),
    Math.min(1, segmentWordsMastered / config.segmentWordsRequired),
  ];

  return {
    level,
    graphemesMastered: masteredGraphemes.length,
    graphemesRequired: graphemes.length,
    blendWordsMastered,
    blendWordsRequired: config.blendWordsRequired,
    segmentWordsMastered,
    segmentWordsRequired: config.segmentWordsRequired,
    fraction: parts.reduce((sum, part) => sum + part, 0) / parts.length,
    creaturesEarned: masteredGraphemes.map((g) => creatureForGrapheme(g.id).id),
    complete:
      masteredGraphemes.length === graphemes.length &&
      blendWordsMastered >= config.blendWordsRequired &&
      segmentWordsMastered >= config.segmentWordsRequired,
  };
}
