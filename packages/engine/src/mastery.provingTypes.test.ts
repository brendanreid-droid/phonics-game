import { describe, expect, it } from 'vitest';
import type { Skill } from '@soundlings/curriculum';
import { DEFAULT_CONFIG, withDefaults } from './config';
import { applyAttempt, emptyRecord, isMastered } from './mastery';
import { provingTaskTypeCount } from './taskTypes';
import type { EngineConfig } from './config';
import type { Attempt, MasteryRecord } from './types';

const HOUR = 3_600_000;

/** At least four fast unscaffolded correct answers across three sessions, on the given task types in turn (one per type if there are more than four). */
function proven(skill: Skill, taskTypeIds: string[], config: EngineConfig = DEFAULT_CONFIG, target = 'x'): MasteryRecord {
  let record = emptyRecord(target, skill, config);
  for (let i = 0; i < Math.max(4, taskTypeIds.length); i += 1) {
    const base: Attempt = {
      sessionId: `session-${i % 3}`, targetId: target, skill,
      taskTypeId: taskTypeIds[i % taskTypeIds.length],
      correct: true, scaffolded: false, latencyMs: 900, weight: 1, at: (i + 1) * HOUR,
    };
    record = applyAttempt(record, base, config);
  }
  return record;
}

const NOW = 5 * HOUR;

describe('isMastered: the task-type condition is capped by what can prove the skill', () => {
  it('refuses LETTER_SOUND proven on one task type, for every sound but `i`', () => {
    // Picture Start has pictures of its own for six letters, `a` among them, so those are no longer
    // capped at one proving game.
    for (const target of ['s', 'a', 't', 'p', 'm', 'f']) {
      const record = proven('LETTER_SOUND', ['sound-singer'], DEFAULT_CONFIG, target);
      expect(record.taskTypesSeen, target).toEqual(['sound-singer']);
      expect(isMastered(record, NOW, DEFAULT_CONFIG), target).toBe(false);
      expect(isMastered(proven('LETTER_SOUND', ['sound-singer', 'picture-start'], DEFAULT_CONFIG, target), NOW, DEFAULT_CONFIG), target).toBe(true);
    }
  });

  it('lets `i` be mastered on Sound Singer alone: nothing else can prove it', () => {
    // No short-/i/ initial emoji is unambiguous (see graphemes.ts), so Picture Start cannot serve it.
    // Demanding two games would make `i` permanently unmasterable.
    const record = proven('LETTER_SOUND', ['sound-singer'], DEFAULT_CONFIG, 'i');
    expect(record.taskTypesSeen).toEqual(['sound-singer']);
    expect(isMastered(record, NOW, DEFAULT_CONFIG)).toBe(true);
  });

  it('lets a target nothing can prove be mastered on one task type, so it is never stuck', () => {
    expect(isMastered(proven('TRICKY_READ', ['some-future-game']), NOW, DEFAULT_CONFIG)).toBe(true);
  });

  it('no longer lets BLEND_READ be mastered on one task type, for a word with a picture', () => {
    // Plan 3 Task 3. This used to assert the opposite: with Picture Match the only
    // reading game the condition was capped at one. It now bites.
    //
    // The target has to be a real pictured word now. Picture Match and Word Pick
    // put a picture on a card, so they declare that they can only serve a word
    // that has one; `mat` does.
    const one = proven('BLEND_READ', ['picture-match'], DEFAULT_CONFIG, 'mat');
    expect(one.taskTypesSeen).toEqual(['picture-match']);
    expect(isMastered(one, NOW, DEFAULT_CONFIG)).toBe(false);
    expect(
      isMastered(proven('BLEND_READ', ['picture-match', 'word-pick'], DEFAULT_CONFIG, 'mat'), NOW, DEFAULT_CONFIG),
    ).toBe(true);
  });

  it('accepts one task type for a word only one reading game can serve', () => {
    // `sat` has no picture, so Sound It Out is the only game that can ask a
    // child to read it. The cap is what stops that word being unmasterable, and
    // it is the same rule that keeps `i` masterable without a start picture.
    //
    // The cost is real and worth stating: for a picture-less word the
    // anti-memorisation guarantee rests on one game rather than two. The fix is
    // artwork, not a weaker rule.
    expect(provingTaskTypeCount('BLEND_READ', 'sat')).toBe(1);
    expect(isMastered(proven('BLEND_READ', ['sound-it-out'], DEFAULT_CONFIG, 'sat'), NOW, DEFAULT_CONFIG)).toBe(true);
  });

  it('no longer lets SEGMENT_SPELL be mastered on one task type, now that Missing Letter is a second', () => {
    // Plan 3 Task 4. This used to assert the opposite, when Word Builder was the
    // only spelling game and the condition was capped at one.
    const one = proven('SEGMENT_SPELL', ['word-builder']);
    expect(one.taskTypesSeen).toEqual(['word-builder']);
    expect(isMastered(one, NOW, DEFAULT_CONFIG)).toBe(false);
    expect(isMastered(proven('SEGMENT_SPELL', ['word-builder', 'missing-letter']), NOW, DEFAULT_CONFIG)).toBe(true);
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
    const seven = withDefaults({ masteryTaskTypes: 7 });
    // Six task types can prove SOUND_ID: the hunt, and five word games through
    // secondary credit. Sound It Out is the sixth. Robot Talk is NOT among them
    // — it grants no grapheme credit at all, deliberately, because hearing the
    // sounds in "map" is not evidence a child knows the letter `m`.
    const all = ['sound-hunt', 'sound-it-out', 'picture-match', 'word-pick', 'word-builder', 'missing-letter'];
    expect(provingTaskTypeCount('SOUND_ID', 's')).toBe(all.length);
    expect(isMastered(proven('SOUND_ID', all.slice(0, 5), seven), NOW, seven)).toBe(false);
    expect(isMastered(proven('SOUND_ID', all, seven), NOW, seven)).toBe(true);
    expect(isMastered(proven('LETTER_SOUND', ['sound-singer', 'picture-start'], seven, 'a'), NOW, seven)).toBe(true);
  });

  it('keeps every other condition in force for a single-type skill', () => {
    const ok = proven('TRICKY_READ', ['some-future-game']);
    expect(isMastered({ ...ok, correctCount: 2 }, NOW, DEFAULT_CONFIG)).toBe(false);
    expect(isMastered({ ...ok, sessionsProven: 1 }, NOW, DEFAULT_CONFIG)).toBe(false);
    expect(isMastered({ ...ok, consecutiveCorrect: 0 }, NOW, DEFAULT_CONFIG)).toBe(false);
    expect(isMastered({ ...ok, primaryCorrectCount: 0 }, NOW, DEFAULT_CONFIG)).toBe(false);
    expect(isMastered(ok, NOW + 2000 * HOUR, DEFAULT_CONFIG)).toBe(false);
  });
});
