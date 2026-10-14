import type { Attempt, ConfusionMap, MasteryMap } from '@soundlings/engine';
import { confusionReport } from './confusionReport';
import type { ConfusionRow } from './confusionReport';
import { needsAHand } from './needsAHand';
import type { NeedsAHand } from './needsAHand';
import { practiceSuggestions } from './practiceSuggestions';
import type { PracticeSuggestion } from './practiceSuggestions';
import { soundReport } from './soundReport';
import type { SoundRow } from './soundReport';

export interface ParentSummaryArgs {
  level: number;
  mastery: MasteryMap;
  confusions: ConfusionMap;
  /** The child's whole log, oldest first. */
  attempts: readonly Attempt[];
  /** Local YYYY-MM-DD dates a quest was finished, each once. */
  playedDates: readonly string[];
  /** Injected. Nothing in the parent area reads the clock. */
  now: number;
}

/**
 * Plain counts. Never a percentage: a parent reads "68% correct" as a school
 * mark. "3 of 7 sounds" is a count of things, and it says no more than it is.
 */
export interface ParentCounts {
  sessionsPlayed: number;
  daysPlayed: number;
  soundsSecure: number;
  soundsTotal: number;
}

/** Exactly what the parent screen renders. The screen holds no logic. */
export interface ParentSummary {
  /** Question 1: which sounds does my child know? */
  sounds: SoundRow[];
  /** Question 2: what are they mixing up? */
  confusions: ConfusionRow[];
  /** Question 3: what should I do about it? */
  practice: PracticeSuggestion[];
  /** Whether the child needs a person rather than the app. See needsAHand.ts. */
  needsAHand: NeedsAHand;
  counts: ParentCounts;
  /** False until the child has answered anything, so day one needs no special case. */
  started: boolean;
  /** One line to open the screen with. */
  headline: string;
}

/**
 * Turns the stored data into the parent's view, in one pure function.
 *
 * It holds the answers to the parent's three questions and nothing else; if a
 * number does not serve one of them it does not belong here. `highScores`, which
 * Plan 4 originally listed as an input, serves none of them (stars are the
 * child's reward, not the grown-up's evidence) and is not taken.
 *
 * The sounds are the LIVE calculation, as on the island, because a parent asks
 * "what can they do right now?". The level-complete badge on the level select
 * reads the latch instead; the two can disagree after a long gap, and that is
 * intended (see soundReport.ts).
 */
export function parentSummary(args: ParentSummaryArgs): ParentSummary {
  const { level, mastery, confusions, attempts, playedDates, now } = args;

  const sounds = soundReport(level, mastery, now);
  // Given the sounds so a mix-up the child has since outgrown is not shown as current.
  const mixedUp = confusionReport(confusions, level, sounds);

  const soundsSecure = sounds.filter((row) => row.state === 'secure').length;
  const started = attempts.length > 0;

  return {
    sounds,
    confusions: mixedUp,
    practice: practiceSuggestions({ soundRows: sounds, confusions: mixedUp, level }),
    needsAHand: needsAHand(attempts, level),
    counts: {
      sessionsPlayed: new Set(attempts.map((a) => a.sessionId)).size,
      daysPlayed: new Set(playedDates).size,
      soundsSecure,
      soundsTotal: sounds.length,
    },
    started,
    headline: started ? `${soundsSecure} of ${sounds.length} sounds known` : 'Not started yet',
  };
}
