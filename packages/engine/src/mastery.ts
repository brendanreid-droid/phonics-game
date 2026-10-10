import type { Skill, TargetId } from '@soundlings/curriculum';
import type { EngineConfig } from './config';
import { masteryKey } from './types';
import type { Attempt, MasteryMap, MasteryRecord } from './types';

const MS_PER_HOUR = 3_600_000;

export function emptyRecord(targetId: TargetId, skill: Skill, config: EngineConfig): MasteryRecord {
  return {
    targetId,
    skill,
    halfLifeHours: config.initialHalfLifeHours,
    lastReinforcedAt: 0,
    lastSeenAt: 0,
    correctCount: 0,
    primaryCorrectCount: 0,
    attemptCount: 0,
    consecutiveCorrect: 0,
    avgLatencyMs: 0,
    taskTypesSeen: [],
    sessionsProven: 0,
    lastProvenSessionId: null,
    scaffoldedCount: 0,
  };
}

function assertFinite(value: number, what: string, record: MasteryRecord): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(
      `mastery record ${record.targetId}::${record.skill} has non-finite ${what} (${value})`,
    );
  }
}

/**
 * A record can reach us from storage or a hand edit, bypassing the clamps
 * `applyAttempt` applies. Out-of-range values are pulled back into
 * [min, max]; a non-finite one is corruption and is refused loudly, because
 * NaN would otherwise fail every `>=` comparison and the child would simply
 * never master the sound, with nothing visibly wrong.
 */
function usableHalfLife(record: MasteryRecord, config: EngineConfig): number {
  assertFinite(record.halfLifeHours, 'halfLifeHours', record);
  return Math.min(config.maxHalfLifeHours, Math.max(config.minHalfLifeHours, record.halfLifeHours));
}

/**
 * Probability the child could recall this right now, as exponential decay
 * (halving every `halfLifeHours`) from `lastReinforcedAt` — the last
 * unscaffolded correct answer, NOT the last contact. If any contact reset the
 * clock, a child who had just failed a sound would look freshly remembered.
 * Strength is computed rather than stored, so a record left untouched for a
 * week correctly reports that it has gone stale.
 *
 * Returns 0 until the child has been proven on the target directly: with no
 * evidence there is nothing to decay.
 *
 * `config` supplies the half-life bounds. It is a parameter, rather than a
 * boundary-time sanitiser, because every caller (mastery check, session
 * builder) already holds the config, and a read-time clamp cannot be bypassed
 * by a record that was persisted or edited outside `applyAttempt`.
 */
export function strengthAt(record: MasteryRecord, now: number, config: EngineConfig): number {
  if (record.primaryCorrectCount === 0) return 0;
  assertFinite(now, 'now', record);
  assertFinite(record.lastReinforcedAt, 'lastReinforcedAt', record);
  const halfLifeHours = usableHalfLife(record, config);
  const elapsedHours = Math.max(0, now - record.lastReinforcedAt) / MS_PER_HOUR;
  // Base 2, not e: after exactly one half-life the strength must be 0.5.
  return Math.pow(0.5, elapsedHours / halfLifeHours);
}

/**
 * Folds one attempt into a mastery record. Pure: returns a new record.
 *
 * The rules encode three pedagogical judgements worth not "simplifying":
 *  - A scaffolded win advances the quest but changes no half-life and earns no
 *    credit. This is what lets the game be generous with hints while keeping
 *    the learning data honest.
 *  - A slow correct answer reinforces at half rate. Phonics aims at
 *    automaticity, and effortful decoding is not yet automatic.
 *  - Secondary credit is real but weaker. Spelling "sat" is evidence the child
 *    hears /s/ /a/ /t/, just weaker evidence than being asked /s/ directly.
 */
export function applyAttempt(
  record: MasteryRecord,
  attempt: Attempt,
  config: EngineConfig,
): MasteryRecord {
  const next: MasteryRecord = {
    ...record,
    taskTypesSeen: [...record.taskTypesSeen],
  };

  next.attemptCount = record.attemptCount + 1;
  next.avgLatencyMs =
    (record.avgLatencyMs * record.attemptCount + attempt.latencyMs) / next.attemptCount;
  next.lastSeenAt = Math.max(record.lastSeenAt, attempt.at);

  if (attempt.scaffolded) {
    next.scaffoldedCount = record.scaffoldedCount + 1;
    if (!attempt.correct) next.consecutiveCorrect = 0;
    return next;
  }

  if (!attempt.correct) {
    next.halfLifeHours = Math.max(config.minHalfLifeHours, record.halfLifeHours * config.errorShrink);
    next.consecutiveCorrect = 0;
    return next;
  }

  const slow = attempt.latencyMs > config.slowLatencyMs;
  const rate = attempt.weight * (slow ? config.slowReinforceFactor : 1);
  const growth = 1 + (config.growthFactor - 1) * rate;

  next.halfLifeHours = Math.min(config.maxHalfLifeHours, record.halfLifeHours * growth);
  next.correctCount = record.correctCount + attempt.weight;
  if (attempt.weight === 1) next.primaryCorrectCount = record.primaryCorrectCount + 1;
  next.consecutiveCorrect = record.consecutiveCorrect + 1;
  next.lastReinforcedAt = Math.max(record.lastReinforcedAt, attempt.at);
  if (attempt.sessionId !== record.lastProvenSessionId) {
    next.sessionsProven = record.sessionsProven + 1;
    next.lastProvenSessionId = attempt.sessionId;
  }
  if (!next.taskTypesSeen.includes(attempt.taskTypeId)) {
    next.taskTypesSeen.push(attempt.taskTypeId);
  }

  return next;
}

/**
 * Could this child do it again, cold, today?
 *
 * Evaluated at session-build time, never immediately after an answer —
 * strength is ~1 the instant an attempt lands, so asking then is meaningless.
 *
 * The two conditions people try to remove are the two that matter.
 * `masteryTaskTypes` stops a child "mastering" a sound by memorising the shape
 * of one mini-game. `masterySessions` requires retention across a gap rather
 * than same-sitting recall; only sessions containing unscaffolded correct
 * evidence count (see `MasteryRecord.sessionsProven`).
 */
export function isMastered(record: MasteryRecord, now: number, config: EngineConfig): boolean {
  return (
    strengthAt(record, now, config) >= config.masteryStrength &&
    record.correctCount >= config.masteryCorrect &&
    record.taskTypesSeen.length >= config.masteryTaskTypes &&
    record.sessionsProven >= config.masterySessions
  );
}

export function getRecord(
  map: MasteryMap,
  targetId: TargetId,
  skill: Skill,
  config: EngineConfig,
): MasteryRecord {
  return map[masteryKey(targetId, skill)] ?? emptyRecord(targetId, skill, config);
}

/** Returns a new map with this attempt folded in. Does not mutate `map`. */
export function recordAttempt(map: MasteryMap, attempt: Attempt, config: EngineConfig): MasteryMap {
  const key = masteryKey(attempt.targetId, attempt.skill);
  const current = map[key] ?? emptyRecord(attempt.targetId, attempt.skill, config);
  return { ...map, [key]: applyAttempt(current, attempt, config) };
}

/**
 * Folds a task's primary and secondary attempts into the map in one call.
 * Mastery only: the confusion map is updated separately.
 */
export function recordAttempts(
  map: MasteryMap,
  attempts: Attempt[],
  config: EngineConfig,
): MasteryMap {
  return attempts.reduce((acc, attempt) => recordAttempt(acc, attempt, config), map);
}
