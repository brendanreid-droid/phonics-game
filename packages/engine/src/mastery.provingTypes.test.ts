import { describe, expect, it } from 'vitest';
import type { Skill } from '@soundlings/curriculum';
import { DEFAULT_CONFIG, withDefaults } from './config';
import { applyAttempt, emptyRecord, isMastered } from './mastery';
import type { EngineConfig } from './config';
import type { Attempt, MasteryRecord } from './types';

const HOUR = 3_600_000;

/** Four fast unscaffolded correct answers across three sessions, on the given task types in turn. */
function proven(skill: Skill, taskTypeIds: string[], config: EngineConfig = DEFAULT_CONFIG): MasteryRecord {
  let record = emptyRecord('x', skill, config);
  for (let i = 0; i < 4; i += 1) {
    const base: Attempt = {
      sessionId: `session-${i % 3}`, targetId: 'x', skill,
      taskTypeId: taskTypeIds[i % taskTypeIds.length],
      correct: true, scaffolded: false, latencyMs: 900, weight: 1, at: (i + 1) * HOUR,
    };
    record = applyAttempt(record, base, config);
  }
  return record;
}

const NOW = 5 * HOUR;

describe('isMastered: the task-type condition is capped by what can prove the skill', () => {
  it('lets LETTER_SOUND be mastered on its only task type', () => {
    const record = proven('LETTER_SOUND', ['sound-singer']);
    expect(record.taskTypesSeen).toEqual(['sound-singer']);
    expect(isMastered(record, NOW, DEFAULT_CONFIG)).toBe(true);
  });

  it('no longer lets BLEND_READ be mastered on one task type, now that Word Pick is a second', () => {
    // Plan 3 Task 3. This used to assert the opposite: with Picture Match the only
    // reading game the condition was capped at one. It now bites.
    const one = proven('BLEND_READ', ['picture-match']);
    expect(one.taskTypesSeen).toEqual(['picture-match']);
    expect(isMastered(one, NOW, DEFAULT_CONFIG)).toBe(false);
    expect(isMastered(proven('BLEND_READ', ['picture-match', 'word-pick']), NOW, DEFAULT_CONFIG)).toBe(true);
  });

  it('lets SEGMENT_SPELL be mastered on its only task type', () => {
    expect(isMastered(proven('SEGMENT_SPELL', ['word-builder']), NOW, DEFAULT_CONFIG)).toBe(true);
  });

  it('still refuses SOUND_ID proven on one task type, because several can prove it', () => {
    // The guarantee this cap must not erode: where more than one mini-game can
    // prove a skill, memorising one is not mastery.
    const record = proven('SOUND_ID', ['sound-hunt']);
    expect(record.taskTypesSeen).toHaveLength(1);
    expect(isMastered(record, NOW, DEFAULT_CONFIG)).toBe(false);
  });

  it('accepts SOUND_ID proven on two task types', () => {
    expect(isMastered(proven('SOUND_ID', ['sound-hunt', 'picture-match']), NOW, DEFAULT_CONFIG)).toBe(true);
  });

  it('never asks for more than masteryTaskTypes, even where more could prove it', () => {
    const record = proven('SOUND_ID', ['sound-hunt', 'picture-match', 'word-pick']);
    expect(isMastered(record, NOW, DEFAULT_CONFIG)).toBe(true);
    expect(isMastered(proven('SOUND_ID', ['sound-hunt', 'picture-match']), NOW, DEFAULT_CONFIG)).toBe(true);
  });

  it('honours a stricter masteryTaskTypes up to the number that can prove the skill', () => {
    const three = withDefaults({ masteryTaskTypes: 3 });
    expect(isMastered(proven('SOUND_ID', ['sound-hunt', 'picture-match'], three), NOW, three)).toBe(false);
    expect(isMastered(proven('SOUND_ID', ['sound-hunt', 'picture-match', 'word-pick'], three), NOW, three)).toBe(true);
  });

  it('does not demand the impossible when masteryTaskTypes exceeds what can prove the skill', () => {
    const five = withDefaults({ masteryTaskTypes: 5 });
    // Four task types can prove SOUND_ID (the hunt, and three word games through secondary credit).
    const all = ['sound-hunt', 'picture-match', 'word-pick', 'word-builder'];
    expect(isMastered(proven('SOUND_ID', all.slice(0, 3), five), NOW, five)).toBe(false);
    expect(isMastered(proven('SOUND_ID', all, five), NOW, five)).toBe(true);
    expect(isMastered(proven('LETTER_SOUND', ['sound-singer'], five), NOW, five)).toBe(true);
  });

  it('keeps every other condition in force for a single-type skill', () => {
    const ok = proven('LETTER_SOUND', ['sound-singer']);
    expect(isMastered({ ...ok, correctCount: 2 }, NOW, DEFAULT_CONFIG)).toBe(false);
    expect(isMastered({ ...ok, sessionsProven: 1 }, NOW, DEFAULT_CONFIG)).toBe(false);
    expect(isMastered({ ...ok, consecutiveCorrect: 0 }, NOW, DEFAULT_CONFIG)).toBe(false);
    expect(isMastered({ ...ok, primaryCorrectCount: 0 }, NOW, DEFAULT_CONFIG)).toBe(false);
    expect(isMastered(ok, NOW + 2000 * HOUR, DEFAULT_CONFIG)).toBe(false);
  });
});
