import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from './config';
import { applyAttempt, emptyRecord, isMastered, strengthAt } from './mastery';
import type { Attempt, MasteryRecord } from './types';

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
