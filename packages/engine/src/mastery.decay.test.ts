import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from './config';
import { emptyRecord, strengthAt } from './mastery';

const HOUR = 3_600_000;

describe('strengthAt', () => {
  it('is zero for a target never attempted', () => {
    const record = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
    expect(strengthAt(record, 1_000_000)).toBe(0);
  });

  it('is 1 at the instant of the attempt', () => {
    const record = { ...emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG), attemptCount: 1, lastSeenAt: 1_000_000 };
    expect(strengthAt(record, 1_000_000)).toBeCloseTo(1, 10);
  });

  it('is 0.5 after exactly one half-life', () => {
    const record = {
      ...emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG),
      attemptCount: 1,
      lastSeenAt: 0,
      halfLifeHours: 6,
    };
    expect(strengthAt(record, 6 * HOUR)).toBeCloseTo(0.5, 6);
  });

  it('is 0.25 after two half-lives', () => {
    const record = {
      ...emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG),
      attemptCount: 1,
      lastSeenAt: 0,
      halfLifeHours: 6,
    };
    expect(strengthAt(record, 12 * HOUR)).toBeCloseTo(0.25, 6);
  });

  it('decays more slowly for a longer half-life', () => {
    const base = { ...emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG), attemptCount: 1, lastSeenAt: 0 };
    const weak = { ...base, halfLifeHours: 2 };
    const strong = { ...base, halfLifeHours: 200 };
    expect(strengthAt(strong, 24 * HOUR)).toBeGreaterThan(strengthAt(weak, 24 * HOUR));
  });

  it('never returns a negative strength even if the clock goes backwards', () => {
    const record = { ...emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG), attemptCount: 1, lastSeenAt: 10 * HOUR };
    expect(strengthAt(record, 0)).toBeLessThanOrEqual(1);
    expect(strengthAt(record, 0)).toBeGreaterThanOrEqual(0);
  });
});

describe('emptyRecord', () => {
  it('starts at the configured initial half-life with nothing proven', () => {
    const record = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
    expect(record.halfLifeHours).toBe(DEFAULT_CONFIG.initialHalfLifeHours);
    expect(record.correctCount).toBe(0);
    expect(record.attemptCount).toBe(0);
    expect(record.taskTypesSeen).toEqual([]);
    expect(record.sessionsSeen).toBe(0);
    expect(record.lastSessionId).toBeNull();
  });
});
