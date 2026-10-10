import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from './config';
import { emptyRecord, strengthAt } from './mastery';
import type { MasteryRecord } from './types';

const HOUR = 3_600_000;

/** A record with one proven, unaided, direct answer at `lastReinforcedAt`. */
function proven(overrides: Partial<MasteryRecord> = {}): MasteryRecord {
  return {
    ...emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG),
    attemptCount: 1,
    primaryCorrectCount: 1,
    correctCount: 1,
    lastReinforcedAt: 0,
    lastSeenAt: 0,
    ...overrides,
  };
}

describe('strengthAt', () => {
  it('is zero for a target never attempted', () => {
    const record = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
    expect(strengthAt(record, 1_000_000, DEFAULT_CONFIG)).toBe(0);
  });

  it('is zero for a target attempted but never proven — there is nothing to decay', () => {
    const record = proven({ primaryCorrectCount: 0, correctCount: 0, lastSeenAt: 1_000_000 });
    expect(strengthAt(record, 1_000_000, DEFAULT_CONFIG)).toBe(0);
  });

  it('is 1 at the instant of the last reinforcement', () => {
    const record = proven({ lastReinforcedAt: 1_000_000 });
    expect(strengthAt(record, 1_000_000, DEFAULT_CONFIG)).toBeCloseTo(1, 10);
  });

  it('is 0.5 after exactly one half-life', () => {
    const record = proven({ halfLifeHours: 6 });
    expect(strengthAt(record, 6 * HOUR, DEFAULT_CONFIG)).toBeCloseTo(0.5, 6);
  });

  it('is 0.25 after two half-lives', () => {
    const record = proven({ halfLifeHours: 6 });
    expect(strengthAt(record, 12 * HOUR, DEFAULT_CONFIG)).toBeCloseTo(0.25, 6);
  });

  it('decays from the last reinforcement, not from the last contact', () => {
    // Touched again at 6h (say, an error), but last proven at 0.
    const record = proven({ halfLifeHours: 6, lastReinforcedAt: 0, lastSeenAt: 6 * HOUR });
    expect(strengthAt(record, 6 * HOUR, DEFAULT_CONFIG)).toBeCloseTo(0.5, 6);
  });

  it('decays more slowly for a longer half-life', () => {
    const weak = proven({ halfLifeHours: 2 });
    const strong = proven({ halfLifeHours: 200 });
    expect(strengthAt(strong, 24 * HOUR, DEFAULT_CONFIG)).toBeGreaterThan(
      strengthAt(weak, 24 * HOUR, DEFAULT_CONFIG),
    );
  });

  it('never returns a negative strength or more than 1 even if the clock goes backwards', () => {
    const record = proven({ lastReinforcedAt: 10 * HOUR });
    expect(strengthAt(record, 0, DEFAULT_CONFIG)).toBeLessThanOrEqual(1);
    expect(strengthAt(record, 0, DEFAULT_CONFIG)).toBeGreaterThanOrEqual(0);
  });
});

describe('strengthAt on records that bypassed the half-life clamps', () => {
  const min = DEFAULT_CONFIG.minHalfLifeHours;
  const max = DEFAULT_CONFIG.maxHalfLifeHours;

  it('treats a zero half-life as the configured floor, not NaN', () => {
    expect(strengthAt(proven({ halfLifeHours: 0 }), 0, DEFAULT_CONFIG)).toBe(1);
    expect(strengthAt(proven({ halfLifeHours: 0 }), min * HOUR, DEFAULT_CONFIG)).toBeCloseTo(0.5, 10);
  });

  it('treats a negative half-life as the floor, never a strength above 1', () => {
    const strength = strengthAt(proven({ halfLifeHours: -1 }), min * HOUR, DEFAULT_CONFIG);
    expect(strength).toBeCloseTo(0.5, 10);
  });

  it('treats an over-long half-life as the ceiling', () => {
    const strength = strengthAt(proven({ halfLifeHours: max * 1000 }), max * HOUR, DEFAULT_CONFIG);
    expect(strength).toBeCloseTo(0.5, 10);
  });

  it('refuses a non-finite half-life rather than failing every comparison silently', () => {
    expect(() => strengthAt(proven({ halfLifeHours: Number.NaN }), HOUR, DEFAULT_CONFIG)).toThrow(/halfLifeHours/);
    expect(() => strengthAt(proven({ halfLifeHours: Infinity }), HOUR, DEFAULT_CONFIG)).toThrow(/halfLifeHours/);
  });

  it('refuses a non-finite clock reading', () => {
    expect(() => strengthAt(proven(), Number.NaN, DEFAULT_CONFIG)).toThrow(/now/);
    expect(() => strengthAt(proven({ lastReinforcedAt: Number.NaN }), HOUR, DEFAULT_CONFIG)).toThrow(/lastReinforcedAt/);
  });
});

describe('emptyRecord', () => {
  it('starts at the configured initial half-life with nothing proven', () => {
    const record = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
    expect(record.halfLifeHours).toBe(DEFAULT_CONFIG.initialHalfLifeHours);
    expect(record.correctCount).toBe(0);
    expect(record.primaryCorrectCount).toBe(0);
    expect(record.attemptCount).toBe(0);
    expect(record.lastReinforcedAt).toBe(0);
    expect(record.lastSeenAt).toBe(0);
    expect(record.taskTypesSeen).toEqual([]);
    expect(record.sessionsProven).toBe(0);
    expect(record.lastProvenSessionId).toBeNull();
  });
});
