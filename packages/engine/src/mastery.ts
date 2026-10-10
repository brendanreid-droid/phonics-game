import type { Skill, TargetId } from '@soundlings/curriculum';
import type { EngineConfig } from './config';
import type { MasteryRecord } from './types';

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
