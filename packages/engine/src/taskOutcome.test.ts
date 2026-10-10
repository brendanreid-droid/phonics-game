import { describe, expect, it } from 'vitest';
import { withDefaults } from './config';
import { getRecord } from './mastery';
import { attemptsForTask, recordTaskResult } from './taskOutcome';
import type { TaskOutcome } from './taskOutcome';
import type { MasteryMap, TaskInstance } from './types';

/**
 * These tests pin the decay and reinforcement arithmetic on fixed numbers, so they
 * do not use the shipped DEFAULT_CONFIG: retuning that for pacing must not silently
 * change what a formula test proves.
 */
const DEFAULT_CONFIG = withDefaults({ initialHalfLifeHours: 6, growthFactor: 1.9, slowLatencyMs: 4000, focusTargetCount: 2 });

const HOUR = 3_600_000;

function task(overrides: Partial<TaskInstance> = {}): TaskInstance {
  return {
    id: 't1',
    taskTypeId: 'word-builder',
    skill: 'SEGMENT_SPELL',
    primaryTarget: 'sat',
    secondaryTargets: ['s', 'a', 't'],
    choices: ['s', 'a', 't', 'm'],
    correctChoice: 't',
    band: 'focus',
    anchor: false,
    difficulty: 1,
    seed: 1,
    ...overrides,
  };
}

function outcome(overrides: Partial<TaskOutcome> = {}): TaskOutcome {
  return {
    sessionId: 'session-1',
    correct: true,
    scaffolded: false,
    latencyMs: 1500,
    at: 5 * HOUR,
    ...overrides,
  };
}

describe('attemptsForTask', () => {
  it('emits the primary attempt first, at full weight, under the task skill', () => {
    const [primary] = attemptsForTask(task(), outcome(), DEFAULT_CONFIG);
    expect(primary).toEqual({
      sessionId: 'session-1',
      targetId: 'sat',
      skill: 'SEGMENT_SPELL',
      taskTypeId: 'word-builder',
      correct: true,
      scaffolded: false,
      latencyMs: 1500,
      weight: 1,
      at: 5 * HOUR,
    });
  });

  it('emits one SOUND_ID attempt per secondary target, weighted from the config', () => {
    const config = withDefaults({ secondaryWeight: 0.3 });
    const attempts = attemptsForTask(task(), outcome(), config);
    expect(attempts).toHaveLength(4);
    expect(attempts.slice(1).map((a) => [a.targetId, a.skill, a.weight])).toEqual([
      ['s', 'SOUND_ID', 0.3],
      ['a', 'SOUND_ID', 0.3],
      ['t', 'SOUND_ID', 0.3],
    ]);
  });

  it('carries the outcome and task type onto every secondary attempt', () => {
    const attempts = attemptsForTask(task(), outcome({ correct: false, scaffolded: true, latencyMs: 8000 }), DEFAULT_CONFIG);
    for (const a of attempts) {
      expect(a.sessionId).toBe('session-1');
      expect(a.taskTypeId).toBe('word-builder');
      expect(a.correct).toBe(false);
      expect(a.scaffolded).toBe(true);
      expect(a.latencyMs).toBe(8000);
      expect(a.at).toBe(5 * HOUR);
    }
  });

  it('emits only the primary attempt when the task has no secondary targets', () => {
    const attempts = attemptsForTask(task({ secondaryTargets: [] }), outcome(), DEFAULT_CONFIG);
    expect(attempts).toHaveLength(1);
  });

  it('records what the child chose on a wrong answer, on the primary attempt only', () => {
    const attempts = attemptsForTask(task(), outcome({ correct: false, chosen: 'm' }), DEFAULT_CONFIG);
    expect(attempts[0].chosen).toBe('m');
    for (const a of attempts.slice(1)) expect('chosen' in a).toBe(false);
  });

  it('omits chosen on a correct answer', () => {
    const [primary] = attemptsForTask(task(), outcome({ correct: true, chosen: 't' }), DEFAULT_CONFIG);
    expect('chosen' in primary).toBe(false);
  });

  it('credits a repeated secondary target once, not once per occurrence', () => {
    // "mum" contains /m/ twice; that is not twice the evidence.
    const attempts = attemptsForTask(task({ secondaryTargets: ['m', 'u', 'm'] }), outcome(), DEFAULT_CONFIG);
    expect(attempts.map((a) => a.targetId)).toEqual(['sat', 'm', 'u']);
  });

  it('never double-credits a sound that is both the primary target and a secondary', () => {
    const attempts = attemptsForTask(
      task({ skill: 'SOUND_ID', primaryTarget: 's', secondaryTargets: ['s', 'a'] }),
      outcome(),
      DEFAULT_CONFIG,
    );
    expect(attempts.map((a) => [a.targetId, a.skill, a.weight])).toEqual([
      ['s', 'SOUND_ID', 1],
      ['a', 'SOUND_ID', DEFAULT_CONFIG.secondaryWeight],
    ]);
  });
});

describe('recordTaskResult', () => {
  const config = DEFAULT_CONFIG;

  it('reinforces the primary fully and each secondary sound at half weight', () => {
    const map = recordTaskResult({}, task(), outcome(), config);
    const primary = getRecord(map, 'sat', 'SEGMENT_SPELL', config);
    const sound = getRecord(map, 's', 'SOUND_ID', config);
    expect(primary.correctCount).toBe(1);
    expect(primary.primaryCorrectCount).toBe(1);
    expect(primary.halfLifeHours).toBeCloseTo(6 * 1.9, 9);
    expect(sound.correctCount).toBe(0.5);
    expect(sound.primaryCorrectCount).toBe(0);
    expect(sound.halfLifeHours).toBeCloseTo(6 * (1 + 0.9 * 0.5), 9);
  });

  it('penalises a missed word less on each sound than on the word itself', () => {
    const map = recordTaskResult({}, task(), outcome({ correct: false, chosen: 'm' }), config);
    expect(getRecord(map, 'sat', 'SEGMENT_SPELL', config).halfLifeHours).toBeCloseTo(6 * 0.4, 9);
    expect(getRecord(map, 's', 'SOUND_ID', config).halfLifeHours).toBeCloseTo(6 * 0.7, 9);
  });

  it('grants no credit anywhere for a scaffolded answer', () => {
    const map = recordTaskResult({}, task(), outcome({ scaffolded: true }), config);
    for (const [target, skill] of [['sat', 'SEGMENT_SPELL'], ['s', 'SOUND_ID']] as const) {
      const r = getRecord(map, target, skill, config);
      expect(r.correctCount).toBe(0);
      expect(r.halfLifeHours).toBe(config.initialHalfLifeHours);
      expect(r.scaffoldedCount).toBe(1);
    }
  });

  it('does not mutate the map it is given', () => {
    const before: MasteryMap = {};
    recordTaskResult(before, task(), outcome(), config);
    expect(before).toEqual({});
  });
});
