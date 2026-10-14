import { graphemesForLevel } from '@soundlings/curriculum';
import type { Grapheme } from '@soundlings/curriculum';
import { DEFAULT_CONFIG, getRecord, isMastered, strengthAt } from '@soundlings/engine';
import type { EngineConfig, MasteryMap, MasteryRecord } from '@soundlings/engine';

/**
 * Where a child is with one sound, in one direction.
 *
 *  - `not-started`: never asked.
 *  - `learning`: asked, and not there yet. Includes a sound that was solid a
 *    moment ago and has just been missed: mastery is a claim about the present.
 *  - `needs-refresh`: the last unaided answer was right, but it was a while ago
 *    and the memory has faded. This is not "forgotten", and the name is chosen
 *    so a parent does not say so. It tells them to revisit rather than re-teach.
 *  - `secure`: the engine's own definition of mastered, judged now.
 */
export type SoundState = 'not-started' | 'learning' | 'needs-refresh' | 'secure';

/**
 * What the parent reads. Gentle and accurate: no "failed", no "weak", no
 * percentages. A parent will repeat what they read to a five-year-old.
 */
export const STATE_LABELS: Readonly<Record<SoundState, string>> = {
  'not-started': 'Not met yet',
  learning: 'Still learning',
  'needs-refresh': 'Worth a quick revisit',
  secure: 'Knows it',
};

export interface DirectionReport {
  state: SoundState;
  label: string;
}

export interface SoundRow {
  grapheme: Grapheme;
  /** Hears the sound, finds the letter (SOUND_ID). */
  hearing: DirectionReport;
  /** Sees the letter, knows its sound (LETTER_SOUND). */
  seeing: DirectionReport;
  /** The two combined; see `overall`. */
  state: SoundState;
  label: string;
}

function report(state: SoundState): DirectionReport {
  return { state, label: STATE_LABELS[state] };
}

function directionState(record: MasteryRecord, now: number, config: EngineConfig): SoundState {
  if (record.attemptCount === 0) return 'not-started';
  if (isMastered(record, now, config)) return 'secure';
  // Faded, not failing: it has been asked and answered, the most recent unaided
  // answer was right, and time has done the rest. A recent slip is a different
  // thing (`consecutiveCorrect` is 0) and reads as still learning.
  if (
    record.primaryCorrectCount >= 1 &&
    record.consecutiveCorrect >= 1 &&
    strengthAt(record, now, config) < config.masteryStrength
  ) {
    return 'needs-refresh';
  }
  return 'learning';
}

/**
 * Both directions in one word. A sound is only secure when both are. It reads as
 * not started only when neither has begun; a sound with one direction secure and
 * the other untouched is, honestly, still being learned. Whatever is left is a
 * mixture of secure and faded, which is a revisit.
 */
function overall(hearing: SoundState, seeing: SoundState): SoundState {
  if (hearing === 'not-started' && seeing === 'not-started') return 'not-started';
  if (hearing === 'secure' && seeing === 'secure') return 'secure';
  if (hearing === 'learning' || seeing === 'learning') return 'learning';
  if (hearing === 'not-started' || seeing === 'not-started') return 'learning';
  return 'needs-refresh';
}

/**
 * The parent's first question: which sounds does my child know?
 *
 * One row per sound in the level, in teaching order, from the LIVE calculation.
 * This answers "what can they do right now?", which is what a parent wants
 * before sitting down with them, so a sound mastered last month and not
 * practised since shows as worth a revisit. The level-complete badge in
 * levelCards.ts reads the latch instead, because it answers "did they finish
 * it?". Both are true and they can disagree after a long gap; that is intended,
 * and neither should be changed to match the other (the island makes the same
 * distinction, see island.ts).
 *
 * Hearing and seeing are reported apart because they are different abilities
 * and the practice that helps each is different.
 */
export function soundReport(
  level: number,
  mastery: MasteryMap,
  now: number,
  config: EngineConfig = DEFAULT_CONFIG,
): SoundRow[] {
  return graphemesForLevel(level).map((grapheme) => {
    const hearing = directionState(getRecord(mastery, grapheme.id, 'SOUND_ID', config), now, config);
    const seeing = directionState(getRecord(mastery, grapheme.id, 'LETTER_SOUND', config), now, config);
    const state = overall(hearing, seeing);
    return {
      grapheme,
      hearing: report(hearing),
      seeing: report(seeing),
      state,
      label: STATE_LABELS[state],
    };
  });
}
