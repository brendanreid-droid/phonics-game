import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from './config';
import { applyAttempt, emptyRecord } from './mastery';
import type { Attempt } from './types';

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
    at: 10 * HOUR,
    ...overrides,
  };
}

describe('applyAttempt', () => {
  it('does not mutate the record it is given', () => {
    const record = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
    applyAttempt(record, attempt(), DEFAULT_CONFIG);
    expect(record.attemptCount).toBe(0);
  });

  it('lengthens the half-life on a fast, unscaffolded correct answer', () => {
    const record = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
    const next = applyAttempt(record, attempt(), DEFAULT_CONFIG);
    expect(next.halfLifeHours).toBeCloseTo(record.halfLifeHours * DEFAULT_CONFIG.growthFactor, 6);
    expect(next.correctCount).toBe(1);
    expect(next.consecutiveCorrect).toBe(1);
  });

  it('reinforces a slow correct answer at half rate — correct is not yet automatic', () => {
    const record = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
    const fast = applyAttempt(record, attempt({ latencyMs: 900 }), DEFAULT_CONFIG);
    const slow = applyAttempt(record, attempt({ latencyMs: 9000 }), DEFAULT_CONFIG);
    expect(slow.halfLifeHours).toBeLessThan(fast.halfLifeHours);
    expect(slow.halfLifeHours).toBeGreaterThan(record.halfLifeHours);
    // Still correct, so it still counts toward correctCount.
    expect(slow.correctCount).toBe(1);
  });

  it('shrinks the half-life and resets the streak on an error', () => {
    const record = { ...emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG), consecutiveCorrect: 4 };
    const next = applyAttempt(record, attempt({ correct: false, chosen: 'f' }), DEFAULT_CONFIG);
    expect(next.halfLifeHours).toBeCloseTo(record.halfLifeHours * DEFAULT_CONFIG.errorShrink, 6);
    expect(next.consecutiveCorrect).toBe(0);
    expect(next.correctCount).toBe(0);
  });

  it('never shrinks the half-life below the configured floor', () => {
    const record = { ...emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG), halfLifeHours: 1 };
    const next = applyAttempt(record, attempt({ correct: false }), DEFAULT_CONFIG);
    expect(next.halfLifeHours).toBe(DEFAULT_CONFIG.minHalfLifeHours);
  });

  it('counts a scaffolded correct answer as progress but proves nothing', () => {
    const record = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
    const next = applyAttempt(record, attempt({ scaffolded: true }), DEFAULT_CONFIG);
    expect(next.halfLifeHours).toBe(record.halfLifeHours);
    expect(next.correctCount).toBe(0);
    expect(next.scaffoldedCount).toBe(1);
    expect(next.taskTypesSeen).toEqual([]);
  });

  it('credits a secondary target at half weight', () => {
    const record = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
    const next = applyAttempt(record, attempt({ weight: DEFAULT_CONFIG.secondaryWeight }), DEFAULT_CONFIG);
    expect(next.correctCount).toBe(0.5);
    const full = applyAttempt(record, attempt({ weight: 1 }), DEFAULT_CONFIG);
    expect(next.halfLifeHours).toBeLessThan(full.halfLifeHours);
    expect(next.halfLifeHours).toBeGreaterThan(record.halfLifeHours);
  });

  it('records each proving task type once', () => {
    const record = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
    const once = applyAttempt(record, attempt({ taskTypeId: 'sound-hunt' }), DEFAULT_CONFIG);
    const twice = applyAttempt(once, attempt({ taskTypeId: 'sound-hunt' }), DEFAULT_CONFIG);
    const other = applyAttempt(twice, attempt({ taskTypeId: 'word-builder' }), DEFAULT_CONFIG);
    expect(twice.taskTypesSeen).toEqual(['sound-hunt']);
    expect(other.taskTypesSeen).toEqual(['sound-hunt', 'word-builder']);
  });

  it('counts a new session only when the session id changes', () => {
    const record = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
    const a = applyAttempt(record, attempt({ sessionId: 'one' }), DEFAULT_CONFIG);
    const b = applyAttempt(a, attempt({ sessionId: 'one' }), DEFAULT_CONFIG);
    const c = applyAttempt(b, attempt({ sessionId: 'two' }), DEFAULT_CONFIG);
    expect(a.sessionsSeen).toBe(1);
    expect(b.sessionsSeen).toBe(1);
    expect(c.sessionsSeen).toBe(2);
  });

  it('tracks a running mean latency', () => {
    const record = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
    const a = applyAttempt(record, attempt({ latencyMs: 1000 }), DEFAULT_CONFIG);
    const b = applyAttempt(a, attempt({ latencyMs: 3000 }), DEFAULT_CONFIG);
    expect(a.avgLatencyMs).toBe(1000);
    expect(b.avgLatencyMs).toBe(2000);
  });

  it('advances lastSeenAt to the attempt time', () => {
    const record = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
    const next = applyAttempt(record, attempt({ at: 99 * HOUR }), DEFAULT_CONFIG);
    expect(next.lastSeenAt).toBe(99 * HOUR);
  });

  it('never exceeds the configured half-life ceiling', () => {
    let record = { ...emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG), halfLifeHours: DEFAULT_CONFIG.maxHalfLifeHours };
    record = applyAttempt(record, attempt(), DEFAULT_CONFIG);
    expect(record.halfLifeHours).toBe(DEFAULT_CONFIG.maxHalfLifeHours);
  });
});
