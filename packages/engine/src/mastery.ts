import type { Skill, TargetId } from '@soundlings/curriculum';
import type { EngineConfig } from './config';
import { masteryKey } from './types';
import type { Attempt, MasteryMap, MasteryRecord } from './types';

const MS_PER_HOUR = 3_600_000;

/**
 * Slack for comparing a sum of fractional credits against a whole-number
 * threshold. Ten credits of 0.3 sum to 2.9999999999999996, not 3.
 */
const COUNT_EPSILON = 1e-9;

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

/**
 * Throws for a bad value that can only be our own bug (a non-finite clock
 * reading handed to us by calling code). Those should fail loudly in dev and
 * test. Contrast `finiteOr`, for values that can legitimately arrive corrupt.
 */
function assertFinite(value: number, what: string, record: MasteryRecord): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(
      `mastery record ${record.targetId}::${record.skill}: ${what} must be finite, got ${value}`,
    );
  }
}

/**
 * Corrupt stored data is clamped, never thrown on: a crash mid-quest costs a
 * child far more than a slightly wrong number. Anything reaching us from
 * storage or a device clock can be non-finite; we replace it with a deliberate
 * fallback and carry on.
 *
 * TODO(Plan 2, persistence layer): validate and quarantine corrupt records on
 * load, so these fallbacks are a last line of defence rather than the only
 * one. Only halfLifeHours, lastReinforcedAt, lastSeenAt and latency are
 * guarded here; the counters (correctCount, attemptCount, ...) are not.
 */
function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Half-life bounds, enforced on read because a record can reach us from
 * storage or a hand edit without ever passing through `applyAttempt`.
 * Out-of-range values are pulled into [min, max]. A non-finite one falls back
 * to the FLOOR: the pessimistic choice. The sound then looks stale and is
 * re-practised, which costs the child a little repetition; the optimistic
 * alternative would let a corrupt record claim a sound is known.
 */
function usableHalfLife(record: MasteryRecord, config: EngineConfig): number {
  const halfLife = finiteOr(record.halfLifeHours, config.minHalfLifeHours);
  return Math.min(config.maxHalfLifeHours, Math.max(config.minHalfLifeHours, halfLife));
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
 *
 * A non-finite `lastReinforcedAt` leaves nothing to anchor the decay to, so the
 * record reports 0: the child loses that sound's history, not their session.
 * A non-finite `now` is a bug in the caller, not stored data, and throws.
 */
export function strengthAt(record: MasteryRecord, now: number, config: EngineConfig): number {
  if (record.primaryCorrectCount === 0) return 0;
  assertFinite(now, 'now', record);
  if (!Number.isFinite(record.lastReinforcedAt)) return 0;
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
  if (!(attempt.weight > 0 && attempt.weight <= 1)) {
    throw new RangeError(`attempt weight must be in (0, 1], got ${attempt.weight}`);
  }
  if (!Number.isFinite(attempt.at)) {
    throw new RangeError(`attempt.at must be a finite timestamp, got ${attempt.at}`);
  }
  const halfLifeHours = usableHalfLife(record, config);
  // Latency is a difference of two device clock readings, so clock skew can make
  // it negative or non-finite. Treat both as 0: that keeps the running mean
  // finite, and reads as "fast", so a clock fault never costs the child
  // reinforcement they earned.
  const latencyMs = Number.isFinite(attempt.latencyMs) ? Math.max(0, attempt.latencyMs) : 0;
  // Stored timestamps that are non-finite are reset to 0 (never seen / never
  // reinforced), so Math.max below cannot propagate NaN.
  const lastSeenAt = finiteOr(record.lastSeenAt, 0);
  const lastReinforcedAt = finiteOr(record.lastReinforcedAt, 0);

  const next: MasteryRecord = {
    ...record,
    lastSeenAt,
    lastReinforcedAt,
    taskTypesSeen: [...record.taskTypesSeen],
  };

  next.attemptCount = record.attemptCount + 1;
  next.avgLatencyMs =
    (record.avgLatencyMs * record.attemptCount + latencyMs) / next.attemptCount;
  next.lastSeenAt = Math.max(lastSeenAt, attempt.at);

  if (attempt.scaffolded) {
    next.scaffoldedCount = record.scaffoldedCount + 1;
    if (!attempt.correct) next.consecutiveCorrect = 0;
    return next;
  }

  if (!attempt.correct) {
    // A weaker piece of evidence is a weaker accusation: missing a word is not
    // as strong a signal against each of its sounds as missing the sound itself.
    const shrink = 1 - (1 - config.errorShrink) * attempt.weight;
    next.halfLifeHours = Math.max(config.minHalfLifeHours, halfLifeHours * shrink);
    next.consecutiveCorrect = 0;
    return next;
  }

  const slow = latencyMs > config.slowLatencyMs;
  const rate = attempt.weight * (slow ? config.slowReinforceFactor : 1);
  const growth = 1 + (config.growthFactor - 1) * rate;

  next.halfLifeHours = Math.min(config.maxHalfLifeHours, halfLifeHours * growth);
  next.correctCount = record.correctCount + attempt.weight;
  if (attempt.weight === 1) next.primaryCorrectCount = record.primaryCorrectCount + 1;
  next.consecutiveCorrect = record.consecutiveCorrect + 1;
  next.lastReinforcedAt = Math.max(lastReinforcedAt, attempt.at);
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
 *
 * `primaryCorrectCount >= 1` means the child has been asked this target
 * directly: secondary credit is meant to accelerate mastery, never replace
 * being asked. (Today `strengthAt` already returns 0 without it; the explicit
 * check keeps the rule true even if the strength threshold is ever 0.)
 *
 * `consecutiveCorrect >= 1` means the most recent unaided evidence is a
 * success. The decay clock cannot see a failure a moment ago (an error leaves
 * it where it was, and a minute later strength is still ~0.998), so recency is
 * a condition of its own. A previously mastered sound is therefore unmastered
 * the instant the child gets it wrong, and must be re-proven. Mastery is a
 * claim about the present.
 */
export function isMastered(record: MasteryRecord, now: number, config: EngineConfig): boolean {
  return (
    strengthAt(record, now, config) >= config.masteryStrength &&
    record.correctCount + COUNT_EPSILON >= config.masteryCorrect &&
    record.primaryCorrectCount >= 1 &&
    record.consecutiveCorrect >= 1 &&
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
  return recordAttempts(map, [attempt], config);
}

/**
 * Folds a task's primary and secondary attempts into the map in one call.
 * Mastery only: the confusion map is updated separately.
 *
 * Pure from the caller's side: `map` is never mutated. Internally it takes a
 * single shallow copy and folds into that, because this is the hot call and
 * copying the whole map once per attempt is wasted work.
 */
export function recordAttempts(
  map: MasteryMap,
  attempts: readonly Attempt[],
  config: EngineConfig,
): MasteryMap {
  const result: MasteryMap = { ...map };
  for (const attempt of attempts) {
    const key = masteryKey(attempt.targetId, attempt.skill);
    const current = result[key] ?? emptyRecord(attempt.targetId, attempt.skill, config);
    result[key] = applyAttempt(current, attempt, config);
  }
  return result;
}
