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
    expect(a.sessionsProven).toBe(1);
    expect(b.sessionsProven).toBe(1);
    expect(c.sessionsProven).toBe(2);
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

describe('applyAttempt bookkeeping that anchors the decay clock', () => {
  const fresh = () => emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);

  it('advances lastReinforcedAt on an unscaffolded correct answer', () => {
    const next = applyAttempt(fresh(), attempt({ at: 7 * HOUR }), DEFAULT_CONFIG);
    expect(next.lastReinforcedAt).toBe(7 * HOUR);
  });

  it('leaves lastReinforcedAt alone on an error', () => {
    const proven = applyAttempt(fresh(), attempt({ at: 7 * HOUR }), DEFAULT_CONFIG);
    const next = applyAttempt(proven, attempt({ correct: false, at: 30 * HOUR }), DEFAULT_CONFIG);
    expect(next.lastReinforcedAt).toBe(7 * HOUR);
  });

  it('leaves lastReinforcedAt alone on a scaffolded answer', () => {
    const proven = applyAttempt(fresh(), attempt({ at: 7 * HOUR }), DEFAULT_CONFIG);
    const next = applyAttempt(proven, attempt({ scaffolded: true, at: 30 * HOUR }), DEFAULT_CONFIG);
    expect(next.lastReinforcedAt).toBe(7 * HOUR);
  });

  it('never moves lastReinforcedAt or lastSeenAt backwards on an out-of-order attempt', () => {
    const late = applyAttempt(fresh(), attempt({ at: 20 * HOUR }), DEFAULT_CONFIG);
    const early = applyAttempt(late, attempt({ at: 5 * HOUR }), DEFAULT_CONFIG);
    expect(early.lastReinforcedAt).toBe(20 * HOUR);
    expect(early.lastSeenAt).toBe(20 * HOUR);
  });

  it('advances lastSeenAt on contact of every kind', () => {
    const a = applyAttempt(fresh(), attempt({ at: 2 * HOUR }), DEFAULT_CONFIG);
    const b = applyAttempt(a, attempt({ correct: false, at: 4 * HOUR }), DEFAULT_CONFIG);
    const c = applyAttempt(b, attempt({ scaffolded: true, at: 6 * HOUR }), DEFAULT_CONFIG);
    expect([a.lastSeenAt, b.lastSeenAt, c.lastSeenAt]).toEqual([2 * HOUR, 4 * HOUR, 6 * HOUR]);
  });

  it('counts primaryCorrectCount only for full-weight unscaffolded correct answers', () => {
    const half = DEFAULT_CONFIG.secondaryWeight;
    let record = fresh();
    record = applyAttempt(record, attempt({ weight: half }), DEFAULT_CONFIG);
    record = applyAttempt(record, attempt({ scaffolded: true }), DEFAULT_CONFIG);
    record = applyAttempt(record, attempt({ correct: false }), DEFAULT_CONFIG);
    expect(record.primaryCorrectCount).toBe(0);
    record = applyAttempt(record, attempt({ weight: 1 }), DEFAULT_CONFIG);
    expect(record.primaryCorrectCount).toBe(1);
  });
});

describe('sessionsProven', () => {
  const fresh = () => emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);

  it('is not advanced by a session in which the child only failed', () => {
    const next = applyAttempt(fresh(), attempt({ correct: false, sessionId: 'one' }), DEFAULT_CONFIG);
    expect(next.sessionsProven).toBe(0);
    expect(next.lastProvenSessionId).toBeNull();
  });

  it('is not advanced by a session in which the child was only helped', () => {
    const next = applyAttempt(fresh(), attempt({ scaffolded: true, sessionId: 'one' }), DEFAULT_CONFIG);
    expect(next.sessionsProven).toBe(0);
    expect(next.lastProvenSessionId).toBeNull();
  });

  it('counts a session once however many failures surround its proof', () => {
    let record = fresh();
    record = applyAttempt(record, attempt({ correct: false, sessionId: 'one' }), DEFAULT_CONFIG);
    record = applyAttempt(record, attempt({ sessionId: 'one' }), DEFAULT_CONFIG);
    record = applyAttempt(record, attempt({ correct: false, sessionId: 'two' }), DEFAULT_CONFIG);
    expect(record.sessionsProven).toBe(1);
    expect(record.lastProvenSessionId).toBe('one');
  });

  it('is a change counter, not a set: ids A, B, A count as three', () => {
    // Documented behaviour. It is correct only if a session never resumes
    // after another has begun; this test pins the semantics so a change to
    // that assumption is deliberate.
    let record = fresh();
    for (const id of ['A', 'B', 'A']) {
      record = applyAttempt(record, attempt({ sessionId: id }), DEFAULT_CONFIG);
    }
    expect(record.sessionsProven).toBe(3);
  });
});

describe('applyAttempt error shrink scales with evidence weight', () => {
  const fresh = () => emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);

  it('shrinks to 0.4x for a full-weight error', () => {
    const next = applyAttempt(fresh(), attempt({ correct: false, weight: 1 }), DEFAULT_CONFIG);
    expect(next.halfLifeHours).toBeCloseTo(6 * 0.4, 9);
  });

  it('shrinks only to 0.7x for a half-weight error — a missed word is weak evidence against each sound', () => {
    const next = applyAttempt(fresh(), attempt({ correct: false, weight: 0.5 }), DEFAULT_CONFIG);
    expect(next.halfLifeHours).toBeCloseTo(6 * 0.7, 9);
  });

  it('still respects the floor for a half-weight error', () => {
    const record = { ...fresh(), halfLifeHours: 1 };
    const next = applyAttempt(record, attempt({ correct: false, weight: 0.5 }), DEFAULT_CONFIG);
    expect(next.halfLifeHours).toBe(DEFAULT_CONFIG.minHalfLifeHours);
  });
});

describe('applyAttempt input validation', () => {
  const fresh = () => emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);

  it.each([0, -0.5, 1.5, Number.NaN, Infinity])('rejects weight %s, outside (0, 1]', (weight) => {
    expect(() => applyAttempt(fresh(), attempt({ weight }), DEFAULT_CONFIG)).toThrow(/weight/);
  });

  it('accepts the weight range boundaries: just above 0, and exactly 1', () => {
    expect(() => applyAttempt(fresh(), attempt({ weight: 1e-6 }), DEFAULT_CONFIG)).not.toThrow();
    expect(() => applyAttempt(fresh(), attempt({ weight: 1 }), DEFAULT_CONFIG)).not.toThrow();
  });

  it('a rejected weight leaves no trace of the attempt', () => {
    const record = fresh();
    expect(() => applyAttempt(record, attempt({ weight: 0 }), DEFAULT_CONFIG)).toThrow();
    expect(record.taskTypesSeen).toEqual([]);
    expect(record.attemptCount).toBe(0);
  });

  it.each([-1, Number.NaN, Infinity])('rejects latency %s', (latencyMs) => {
    expect(() => applyAttempt(fresh(), attempt({ latencyMs }), DEFAULT_CONFIG)).toThrow(/latencyMs/);
  });

  it('accepts a latency of exactly 0', () => {
    expect(() => applyAttempt(fresh(), attempt({ latencyMs: 0 }), DEFAULT_CONFIG)).not.toThrow();
  });

  it.each([Number.NaN, Infinity])('rejects a non-finite timestamp %s', (at) => {
    expect(() => applyAttempt(fresh(), attempt({ at }), DEFAULT_CONFIG)).toThrow(/attempt\.at/);
  });

  it('refuses a record whose half-life is NaN rather than propagating it', () => {
    const corrupt = { ...fresh(), halfLifeHours: Number.NaN };
    expect(() => applyAttempt(corrupt, attempt(), DEFAULT_CONFIG)).toThrow(/halfLifeHours/);
  });

  it('grows from the floor when a record arrives with a half-life below it', () => {
    const corrupt = { ...fresh(), halfLifeHours: 0 };
    const next = applyAttempt(corrupt, attempt(), DEFAULT_CONFIG);
    expect(next.halfLifeHours).toBeCloseTo(DEFAULT_CONFIG.minHalfLifeHours * 1.9, 9);
  });

  it('caps a record that arrives above the ceiling', () => {
    const corrupt = { ...fresh(), halfLifeHours: DEFAULT_CONFIG.maxHalfLifeHours * 10 };
    const next = applyAttempt(corrupt, attempt({ correct: false }), DEFAULT_CONFIG);
    expect(next.halfLifeHours).toBeCloseTo(DEFAULT_CONFIG.maxHalfLifeHours * 0.4, 6);
  });
});

describe('applyAttempt growth, exactly', () => {
  const fresh = () => emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);

  it('grows linearly in the rate: growth = 1 + (growthFactor - 1) * rate', () => {
    // growthFactor 1.9, initial half-life 6.
    const full = applyAttempt(fresh(), attempt({ weight: 1, latencyMs: 1000 }), DEFAULT_CONFIG);
    const half = applyAttempt(fresh(), attempt({ weight: 0.5, latencyMs: 1000 }), DEFAULT_CONFIG);
    const slow = applyAttempt(fresh(), attempt({ weight: 1, latencyMs: 9000 }), DEFAULT_CONFIG);
    const slowHalf = applyAttempt(fresh(), attempt({ weight: 0.5, latencyMs: 9000 }), DEFAULT_CONFIG);
    expect(full.halfLifeHours).toBeCloseTo(6 * 1.9, 9);
    expect(half.halfLifeHours).toBeCloseTo(6 * 1.45, 9);
    expect(slow.halfLifeHours).toBeCloseTo(6 * 1.45, 9);
    expect(slowHalf.halfLifeHours).toBeCloseTo(6 * 1.225, 9);
  });

  it('treats exactly slowLatencyMs as fast, and one millisecond over as slow', () => {
    const atLimit = applyAttempt(fresh(), attempt({ latencyMs: DEFAULT_CONFIG.slowLatencyMs }), DEFAULT_CONFIG);
    const over = applyAttempt(fresh(), attempt({ latencyMs: DEFAULT_CONFIG.slowLatencyMs + 1 }), DEFAULT_CONFIG);
    expect(atLimit.halfLifeHours).toBeCloseTo(6 * 1.9, 9);
    expect(over.halfLifeHours).toBeCloseTo(6 * 1.45, 9);
  });
});

describe('applyAttempt on scaffolded attempts', () => {
  const streaking = () => ({ ...emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG), consecutiveCorrect: 4, correctCount: 4 });

  it('a scaffolded WRONG answer changes no half-life and no credit, but resets the streak', () => {
    const record = streaking();
    const next = applyAttempt(record, attempt({ scaffolded: true, correct: false }), DEFAULT_CONFIG);
    expect(next.halfLifeHours).toBe(record.halfLifeHours);
    expect(next.correctCount).toBe(4);
    expect(next.consecutiveCorrect).toBe(0);
    expect(next.scaffoldedCount).toBe(1);
  });

  it('still counts as contact: attemptCount, avgLatencyMs and lastSeenAt advance', () => {
    const first = applyAttempt(emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG), attempt({ latencyMs: 1000, at: 2 * HOUR }), DEFAULT_CONFIG);
    const next = applyAttempt(first, attempt({ scaffolded: true, latencyMs: 3000, at: 9 * HOUR }), DEFAULT_CONFIG);
    expect(next.attemptCount).toBe(2);
    expect(next.avgLatencyMs).toBe(2000);
    expect(next.lastSeenAt).toBe(9 * HOUR);
  });

  it('earns none of the evidence a real answer would', () => {
    const record = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
    const next = applyAttempt(record, attempt({ scaffolded: true, sessionId: 'one' }), DEFAULT_CONFIG);
    expect(next.primaryCorrectCount).toBe(0);
    expect(next.sessionsProven).toBe(0);
    expect(next.lastReinforcedAt).toBe(0);
    expect(next.taskTypesSeen).toEqual([]);
    expect(next.consecutiveCorrect).toBe(0);
  });
});
