import { localDateString, isPrimaryAttempt, recordAttempts, starsFor, tallyAttempts } from '@soundlings/engine';
import { LEVELS, getGrapheme, getWord } from '@soundlings/curriculum';
import type { Attempt, ConfusionMap, EngineConfig, MasteryMap } from '@soundlings/engine';

/**
 * Everything a device can derive from the attempt log, and the reason the log is
 * the only thing that needs to sync.
 *
 * PURE. Attempts in, state out: no storage, no network, no clock. If this file
 * ever imports one of those, the replay test below it is no longer testing the
 * game.
 */

/** One finished quest's score, as the quest runner would have saved it. */
export interface RebuiltScore {
  level: number;
  stars: 1 | 2 | 3;
  /** No errors and nothing shown. */
  cleanRun: boolean;
  /** When the quest's last answer was given. */
  at: number;
}

export interface Rebuilt {
  mastery: MasteryMap;
  /**
   * Counted from the wrong picks recorded on primary attempts. A lower bound on
   * the live map, not an exact copy: the quest runner also counts the second and
   * third wrong pick on a task, and those leave no attempt behind, because the
   * log records the task's outcome, not every tap. Applied as a floor, never as
   * a replacement.
   */
  confusions: ConfusionMap;
  /** Local YYYY-MM-DD dates on which anything was answered, ascending, each once. */
  playedDates: string[];
  /**
   * One entry per finished quest, oldest first. Not reduced to a best per level
   * here: the repository's own merge does that, and a second copy of "which
   * score is better" would be a second thing to keep in step.
   */
  highScores: RebuiltScore[];
}

/**
 * The fewest tasks a finished quest can contain. The log records answers, not
 * the quest they belonged to, so "finished" has to be inferred. The shortest
 * quest the engine ever builds is the bad-day length; a session with fewer
 * completed tasks than that cannot have run to its end.
 */
function minimumQuestTasks(config: EngineConfig): number {
  return Math.min(config.sessionLength, config.badDaySessionLength);
}

/**
 * The attempts in the order the child made them, with repeats removed.
 *
 * Time first, because two devices deliver their halves of a log in any order and
 * the mastery fold depends on order (the decay clock and the session counter
 * both move forward). The id breaks ties so the result never depends on where
 * in the array an attempt arrived; `Array.prototype.sort` is stable, so
 * id-less attempts at the same instant keep the order they came in.
 *
 * An attempt that carries an id and is seen again is the same attempt, and
 * counts once. An attempt with no id cannot be shown to repeat, so it stands.
 */
function ordered(attempts: readonly Attempt[]): Attempt[] {
  const seen = new Set<string>();
  const unique: Attempt[] = [];
  for (const attempt of attempts) {
    if (attempt.id !== undefined) {
      if (seen.has(attempt.id)) continue;
      seen.add(attempt.id);
    }
    unique.push(attempt);
  }
  return unique.sort((a, b) => a.at - b.at || (a.id ?? '').localeCompare(b.id ?? ''));
}

/** The level a target belongs to: the one that first teaches it. */
function levelOfTarget(targetId: string): number | null {
  try {
    const grapheme = getGrapheme(targetId);
    return LEVELS.find((l) => l.graphemeIds.includes(grapheme.id))?.number ?? grapheme.introducedInLevel;
  } catch {
    // Not a grapheme; maybe a word.
  }
  try {
    return getWord(targetId).decodableFromLevel;
  } catch {
    return null;
  }
}

export function rebuildFrom(attempts: readonly Attempt[], config: EngineConfig): Rebuilt {
  const log = ordered(attempts);

  const mastery = recordAttempts({}, log, config);

  const confusions: ConfusionMap = {};
  for (const attempt of log) {
    if (attempt.correct || attempt.chosen === undefined || !isPrimaryAttempt(attempt)) continue;
    const key = `${attempt.targetId}>${attempt.chosen}`;
    confusions[key] = (confusions[key] ?? 0) + 1;
  }

  const playedDates = [...new Set(log.map((a) => localDateString(a.at)))].sort();

  const sessions = new Map<string, Attempt[]>();
  for (const attempt of log) {
    const list = sessions.get(attempt.sessionId);
    if (list) list.push(attempt);
    else sessions.set(attempt.sessionId, [attempt]);
  }

  const highScores: RebuiltScore[] = [];
  for (const session of sessions.values()) {
    const own = session.filter(isPrimaryAttempt);
    if (own.filter((a) => a.correct).length < minimumQuestTasks(config)) continue;
    const levels = own.map((a) => levelOfTarget(a.targetId)).filter((l): l is number => l !== null);
    if (levels.length === 0) continue;
    const tally = tallyAttempts(session);
    highScores.push({
      level: Math.max(...levels),
      stars: starsFor(tally),
      cleanRun: tally.errors === 0 && tally.scaffolds === 0,
      at: Math.max(...session.map((a) => a.at)),
    });
  }
  highScores.sort((a, b) => a.at - b.at);

  return { mastery, confusions, playedDates, highScores };
}
