import { describe, expect, it } from 'vitest';
import { withDefaults } from './config';
import { applyAttempt, emptyRecord, isMastered, strengthAt } from './mastery';
import type { Attempt, MasteryRecord } from './types';

/**
 * These tests pin the decay and reinforcement arithmetic on fixed numbers, so they
 * do not use the shipped DEFAULT_CONFIG: retuning that for pacing must not silently
 * change what a formula test proves.
 */
const DEFAULT_CONFIG = withDefaults({ initialHalfLifeHours: 6, growthFactor: 1.9, slowLatencyMs: 4000, focusTargetCount: 2 });

const HOUR = 3_600_000;

function attempt(overrides: Partial<Attempt> = {}): Attempt {
  return {
    sessionId: 'session-1',
    targetId: 's',
    skill: 'SOUND_ID',
    taskTypeId: 'sound-hunt',
    correct: true,
    scaffolded: false,
    latencyMs: 1200,
    weight: 1,
    at: HOUR,
    ...overrides,
  };
}

/** Three clean answers over two sessions and two task types: mastered at 3h. */
function masteredAtThreeHours(): MasteryRecord {
  let record = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
  record = applyAttempt(record, attempt({ sessionId: 'one', taskTypeId: 'sound-hunt', at: HOUR }), DEFAULT_CONFIG);
  record = applyAttempt(record, attempt({ sessionId: 'one', taskTypeId: 'word-builder', at: 2 * HOUR }), DEFAULT_CONFIG);
  record = applyAttempt(record, attempt({ sessionId: 'two', taskTypeId: 'sound-hunt', at: 3 * HOUR }), DEFAULT_CONFIG);
  return record;
}

/**
 * The decay clock runs from the last successful, unaided answer — never from
 * the last contact. Each of these three failed when strength decayed from the
 * last attempt, because any contact reset recall to ~1.
 */
describe('the decay clock is anchored to evidence, not contact', () => {
  const nextDay = 3 * HOUR + 24 * HOUR;

  it('precondition: the proven record really is mastered', () => {
    expect(isMastered(masteredAtThreeHours(), 3 * HOUR, DEFAULT_CONFIG)).toBe(true);
  });

  it('a child who gets a mastered sound WRONG the next day is no longer mastered', () => {
    const wrong = applyAttempt(
      masteredAtThreeHours(),
      attempt({ sessionId: 'three', correct: false, chosen: 'f', at: nextDay }),
      DEFAULT_CONFIG,
    );
    expect(isMastered(wrong, nextDay, DEFAULT_CONFIG)).toBe(false);
  });

  it('a child who is SHOWN the answer the next day is not mastered by it', () => {
    const helped = applyAttempt(
      masteredAtThreeHours(),
      attempt({ sessionId: 'three', scaffolded: true, at: nextDay }),
      DEFAULT_CONFIG,
    );
    expect(isMastered(helped, nextDay, DEFAULT_CONFIG)).toBe(false);
  });

  it('a sound the child has just failed is not eligible for the win-back slot', () => {
    const wrong = applyAttempt(
      masteredAtThreeHours(),
      attempt({ sessionId: 'three', correct: false, chosen: 'f', at: nextDay }),
      DEFAULT_CONFIG,
    );
    expect(strengthAt(wrong, nextDay, DEFAULT_CONFIG)).toBeLessThan(DEFAULT_CONFIG.winbackStrength);
  });
});

/**
 * The same bug at a shorter timescale. The clock correctly does not advance on
 * an error and the half-life correctly shrinks, but a minute later barely any
 * time has passed, so strength is still ~0.998. Recency of failure therefore
 * has to be a condition of its own: consecutiveCorrect >= 1.
 */
describe('a failure a moment ago is not mastery, however strong the decay curve says it is', () => {
  const MINUTE = 60_000;
  const justAfter = 3 * HOUR + MINUTE;

  function failedMomentsAgo(): MasteryRecord {
    return applyAttempt(
      masteredAtThreeHours(),
      attempt({ sessionId: 'two', correct: false, chosen: 'f', at: justAfter }),
      DEFAULT_CONFIG,
    );
  }

  it('is not mastered one minute after a wrong answer', () => {
    const record = failedMomentsAgo();
    // The decay curve alone cannot see this: that is the point of the test.
    expect(strengthAt(record, justAfter, DEFAULT_CONFIG)).toBeGreaterThanOrEqual(DEFAULT_CONFIG.masteryStrength);
    expect(isMastered(record, justAfter, DEFAULT_CONFIG)).toBe(false);
  });

  it('is not mastered one minute after being shown the answer to a failure', () => {
    const record = applyAttempt(
      masteredAtThreeHours(),
      attempt({ sessionId: 'two', correct: false, scaffolded: true, at: justAfter }),
      DEFAULT_CONFIG,
    );
    expect(strengthAt(record, justAfter, DEFAULT_CONFIG)).toBeGreaterThanOrEqual(DEFAULT_CONFIG.masteryStrength);
    expect(isMastered(record, justAfter, DEFAULT_CONFIG)).toBe(false);
  });

  it('is mastered again once the child gets it right', () => {
    const failed = failedMomentsAgo();
    const recovered = applyAttempt(failed, attempt({ sessionId: 'two', at: justAfter + MINUTE }), DEFAULT_CONFIG);
    expect(isMastered(recovered, justAfter + MINUTE, DEFAULT_CONFIG)).toBe(true);
  });

  it('does not pass the win-back test: strong on the curve, but not right most recently', () => {
    const record = failedMomentsAgo();
    const strong = strengthAt(record, justAfter, DEFAULT_CONFIG) >= DEFAULT_CONFIG.winbackStrength;
    expect(strong).toBe(true);
    expect(record.consecutiveCorrect).toBe(0);
    const winbackEligible = strong && record.consecutiveCorrect >= 1;
    expect(winbackEligible).toBe(false);
  });

  it('a scaffolded CORRECT answer does not unmaster a child who was not failing', () => {
    const helped = applyAttempt(
      masteredAtThreeHours(),
      attempt({ sessionId: 'two', scaffolded: true, at: justAfter }),
      DEFAULT_CONFIG,
    );
    expect(isMastered(helped, justAfter, DEFAULT_CONFIG)).toBe(true);
  });
});
