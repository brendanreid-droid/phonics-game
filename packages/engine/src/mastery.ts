import type { Skill, TargetId } from '@soundlings/curriculum';
import type { EngineConfig } from './config';
import type { Attempt, MasteryRecord } from './types';

const MS_PER_HOUR = 3_600_000;

export function emptyRecord(targetId: TargetId, skill: Skill, config: EngineConfig): MasteryRecord {
  return {
    targetId,
    skill,
    halfLifeHours: config.initialHalfLifeHours,
    lastSeenAt: 0,
    correctCount: 0,
    attemptCount: 0,
    consecutiveCorrect: 0,
    avgLatencyMs: 0,
    taskTypesSeen: [],
    sessionsSeen: 0,
    lastSessionId: null,
    scaffoldedCount: 0,
  };
}

/**
 * Probability the child could recall this right now, as exponential decay
 * (halving every `halfLifeHours`) from the last attempt. Strength is computed
 * rather than stored, so a record left untouched for a week correctly reports
 * that it has gone stale.
 */
export function strengthAt(record: MasteryRecord, now: number): number {
  if (record.attemptCount === 0) return 0;
  const elapsedHours = Math.max(0, now - record.lastSeenAt) / MS_PER_HOUR;
  // Base 2, not e: after exactly one half-life the strength must be 0.5.
  return Math.pow(0.5, elapsedHours / record.halfLifeHours);
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
  next.lastSeenAt = attempt.at;

  if (attempt.sessionId !== record.lastSessionId) {
    next.sessionsSeen = record.sessionsSeen + 1;
    next.lastSessionId = attempt.sessionId;
  }

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
  next.consecutiveCorrect = record.consecutiveCorrect + 1;
  if (!next.taskTypesSeen.includes(attempt.taskTypeId)) {
    next.taskTypesSeen.push(attempt.taskTypeId);
  }

  return next;
}
