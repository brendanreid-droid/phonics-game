import { describe, expect, it } from 'vitest';
import { withDefaults } from './config';
import { getRecord, recordAttempt, recordAttempts } from './mastery';
import { masteryKey } from './types';
import type { Attempt, MasteryMap } from './types';

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

describe('getRecord', () => {
  it('keeps the same target separate across skills', () => {
    const map = recordAttempts(
      {},
      [attempt({ skill: 'SOUND_ID' }), attempt({ skill: 'SOUND_ID' }), attempt({ skill: 'LETTER_SOUND' })],
      DEFAULT_CONFIG,
    );
    expect(getRecord(map, 's', 'SOUND_ID', DEFAULT_CONFIG).attemptCount).toBe(2);
    expect(getRecord(map, 's', 'LETTER_SOUND', DEFAULT_CONFIG).attemptCount).toBe(1);
    expect(getRecord(map, 's', 'BLEND_READ', DEFAULT_CONFIG).attemptCount).toBe(0);
    expect(getRecord(map, 's', 'BLEND_READ', DEFAULT_CONFIG).skill).toBe('BLEND_READ');
  });

  it('keeps different targets separate under the same skill', () => {
    const map = recordAttempts({}, [attempt({ targetId: 's' }), attempt({ targetId: 'a' })], DEFAULT_CONFIG);
    expect(getRecord(map, 's', 'SOUND_ID', DEFAULT_CONFIG).targetId).toBe('s');
    expect(getRecord(map, 'a', 'SOUND_ID', DEFAULT_CONFIG).targetId).toBe('a');
    expect(getRecord(map, 't', 'SOUND_ID', DEFAULT_CONFIG).attemptCount).toBe(0);
  });
});

describe('recordAttempts', () => {
  it('folds every attempt, not just the first', () => {
    const map = recordAttempts(
      {},
      [attempt({ at: HOUR }), attempt({ at: 2 * HOUR }), attempt({ at: 3 * HOUR })],
      DEFAULT_CONFIG,
    );
    const record = getRecord(map, 's', 'SOUND_ID', DEFAULT_CONFIG);
    expect(record.attemptCount).toBe(3);
    expect(record.correctCount).toBe(3);
    expect(record.lastSeenAt).toBe(3 * HOUR);
  });

  it('folds attempts for several targets and skills into their own records', () => {
    const map = recordAttempts(
      {},
      [
        attempt({ targetId: 'sat', skill: 'SEGMENT_SPELL' }),
        attempt({ targetId: 's', skill: 'SOUND_ID', weight: 0.5 }),
        attempt({ targetId: 'a', skill: 'SOUND_ID', weight: 0.5 }),
      ],
      DEFAULT_CONFIG,
    );
    expect(Object.keys(map).sort()).toEqual(
      [masteryKey('sat', 'SEGMENT_SPELL'), masteryKey('s', 'SOUND_ID'), masteryKey('a', 'SOUND_ID')].sort(),
    );
    expect(getRecord(map, 'sat', 'SEGMENT_SPELL', DEFAULT_CONFIG).correctCount).toBe(1);
    expect(getRecord(map, 's', 'SOUND_ID', DEFAULT_CONFIG).correctCount).toBe(0.5);
  });

  it('applies attempts in the order given', () => {
    const right = attempt({ at: HOUR });
    const wrong = attempt({ correct: false, at: 2 * HOUR });
    const rightThenWrong = getRecord(recordAttempts({}, [right, wrong], DEFAULT_CONFIG), 's', 'SOUND_ID', DEFAULT_CONFIG);
    const wrongThenRight = getRecord(recordAttempts({}, [wrong, right], DEFAULT_CONFIG), 's', 'SOUND_ID', DEFAULT_CONFIG);
    expect(rightThenWrong.halfLifeHours).toBeCloseTo(6 * 1.9 * 0.4, 9);
    expect(wrongThenRight.halfLifeHours).toBeCloseTo(6 * 0.4 * 1.9, 9);
    expect(rightThenWrong.consecutiveCorrect).toBe(0);
    expect(wrongThenRight.consecutiveCorrect).toBe(1);
  });

  it('builds on records already in the map', () => {
    const first = recordAttempts({}, [attempt()], DEFAULT_CONFIG);
    const second = recordAttempts(first, [attempt({ at: 2 * HOUR })], DEFAULT_CONFIG);
    expect(getRecord(second, 's', 'SOUND_ID', DEFAULT_CONFIG).attemptCount).toBe(2);
  });

  it('returns an equal but distinct map for no attempts', () => {
    const map = recordAttempts({}, [attempt()], DEFAULT_CONFIG);
    const same = recordAttempts(map, [], DEFAULT_CONFIG);
    expect(same).toEqual(map);
    expect(same).not.toBe(map);
  });

  it('never mutates the map or the records in it', () => {
    const map = recordAttempts({}, [attempt()], DEFAULT_CONFIG);
    const snapshot = structuredClone(map);
    const keep = map[masteryKey('s', 'SOUND_ID')];
    const next = recordAttempts(map, [attempt({ at: 2 * HOUR }), attempt({ targetId: 'a' })], DEFAULT_CONFIG);
    expect(map).toEqual(snapshot);
    expect(map[masteryKey('s', 'SOUND_ID')]).toBe(keep);
    expect(next[masteryKey('s', 'SOUND_ID')]).not.toBe(keep);
  });

  it('leaves the original map untouched when a later attempt in the batch is invalid', () => {
    const map = recordAttempts({}, [attempt()], DEFAULT_CONFIG);
    const snapshot: MasteryMap = structuredClone(map);
    expect(() => recordAttempts(map, [attempt({ at: 2 * HOUR }), attempt({ weight: 0 })], DEFAULT_CONFIG)).toThrow();
    expect(map).toEqual(snapshot);
  });

  it('agrees with recordAttempt for a single attempt', () => {
    expect(recordAttempts({}, [attempt()], DEFAULT_CONFIG)).toEqual(recordAttempt({}, attempt(), DEFAULT_CONFIG));
  });
});
