import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from './config';
import { applyAttempt, emptyRecord, getRecord, isMastered, recordAttempt } from './mastery';
import { masteryKey } from './types';
import type { Attempt, MasteryMap } from './types';

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

/** Three fast correct answers across two sessions and two task types. */
function provenRecord() {
  let record = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
  record = applyAttempt(record, attempt({ sessionId: 'one', taskTypeId: 'sound-hunt', at: HOUR }), DEFAULT_CONFIG);
  record = applyAttempt(record, attempt({ sessionId: 'one', taskTypeId: 'word-builder', at: 2 * HOUR }), DEFAULT_CONFIG);
  record = applyAttempt(record, attempt({ sessionId: 'two', taskTypeId: 'sound-hunt', at: 3 * HOUR }), DEFAULT_CONFIG);
  return record;
}

describe('isMastered', () => {
  it('accepts a target proven across two sessions and two task types', () => {
    expect(isMastered(provenRecord(), 3 * HOUR, DEFAULT_CONFIG)).toBe(true);
  });

  it('rejects a target proven on only one task type, however many times', () => {
    let record = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
    record = applyAttempt(record, attempt({ sessionId: 'one', at: HOUR }), DEFAULT_CONFIG);
    record = applyAttempt(record, attempt({ sessionId: 'two', at: 2 * HOUR }), DEFAULT_CONFIG);
    record = applyAttempt(record, attempt({ sessionId: 'three', at: 3 * HOUR }), DEFAULT_CONFIG);
    record = applyAttempt(record, attempt({ sessionId: 'four', at: 4 * HOUR }), DEFAULT_CONFIG);
    expect(record.taskTypesSeen).toEqual(['sound-hunt']);
    expect(isMastered(record, 4 * HOUR, DEFAULT_CONFIG)).toBe(false);
  });

  it('rejects a target proven only within a single session', () => {
    let record = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
    record = applyAttempt(record, attempt({ sessionId: 'one', taskTypeId: 'sound-hunt', at: HOUR }), DEFAULT_CONFIG);
    record = applyAttempt(record, attempt({ sessionId: 'one', taskTypeId: 'word-builder', at: 2 * HOUR }), DEFAULT_CONFIG);
    record = applyAttempt(record, attempt({ sessionId: 'one', taskTypeId: 'picture-match', at: 3 * HOUR }), DEFAULT_CONFIG);
    expect(record.sessionsProven).toBe(1);
    expect(isMastered(record, 3 * HOUR, DEFAULT_CONFIG)).toBe(false);
  });

  it('rejects a target whose strength has decayed below threshold', () => {
    const record = provenRecord();
    const muchLater = 3 * HOUR + 1000 * HOUR;
    expect(isMastered(record, muchLater, DEFAULT_CONFIG)).toBe(false);
  });

  it('does not count scaffolded wins toward the correct requirement', () => {
    let record = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
    record = applyAttempt(record, attempt({ sessionId: 'one', taskTypeId: 'sound-hunt', scaffolded: true }), DEFAULT_CONFIG);
    record = applyAttempt(record, attempt({ sessionId: 'two', taskTypeId: 'word-builder', scaffolded: true }), DEFAULT_CONFIG);
    record = applyAttempt(record, attempt({ sessionId: 'three', taskTypeId: 'picture-match', scaffolded: true }), DEFAULT_CONFIG);
    expect(isMastered(record, 3 * HOUR, DEFAULT_CONFIG)).toBe(false);
  });

  it('needs two half-weight credits to equal one full one', () => {
    const half = DEFAULT_CONFIG.secondaryWeight;
    let record = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
    record = applyAttempt(record, attempt({ sessionId: 'one', taskTypeId: 'word-builder', weight: half }), DEFAULT_CONFIG);
    record = applyAttempt(record, attempt({ sessionId: 'two', taskTypeId: 'picture-match', weight: half }), DEFAULT_CONFIG);
    expect(record.correctCount).toBe(1);
    expect(isMastered(record, 2 * HOUR, DEFAULT_CONFIG)).toBe(false);
  });
});

describe('getRecord and recordAttempt', () => {
  it('returns a fresh empty record for an unseen target', () => {
    const record = getRecord({}, 'a', 'LETTER_SOUND', DEFAULT_CONFIG);
    expect(record.targetId).toBe('a');
    expect(record.skill).toBe('LETTER_SOUND');
    expect(record.attemptCount).toBe(0);
  });

  it('writes an attempt into a new map without mutating the original', () => {
    const before: MasteryMap = {};
    const after = recordAttempt(before, attempt(), DEFAULT_CONFIG);
    expect(before).toEqual({});
    expect(after[masteryKey('s', 'SOUND_ID')].attemptCount).toBe(1);
  });
});
