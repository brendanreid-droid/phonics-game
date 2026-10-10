import { DEFAULT_CONFIG, applyAttempt, emptyRecord, masteryKey } from '@soundlings/engine';
import type { Attempt, MasteryMap } from '@soundlings/engine';
import type { Skill } from '@soundlings/curriculum';

/** Test-only: builds mastery maps with real evidence behind them, as of `at`. Not imported by the app. */
function mastered(mastery: MasteryMap, targetId: string, skill: Skill, at: number): void {
  let record = emptyRecord(targetId, skill, DEFAULT_CONFIG);
  const base: Attempt = {
    sessionId: '', targetId, skill, taskTypeId: 'sound-hunt',
    correct: true, scaffolded: false, latencyMs: 800, weight: 1, at,
  };
  record = applyAttempt(record, { ...base, sessionId: 'one', taskTypeId: 'sound-hunt' }, DEFAULT_CONFIG);
  record = applyAttempt(record, { ...base, sessionId: 'two', taskTypeId: 'word-builder' }, DEFAULT_CONFIG);
  record = applyAttempt(record, { ...base, sessionId: 'three', taskTypeId: 'picture-match' }, DEFAULT_CONFIG);
  mastery[masteryKey(targetId, skill)] = record;
}

/** These sounds, mastered in both skills. */
export function masteredSounds(ids: readonly string[], at: number): MasteryMap {
  const mastery: MasteryMap = {};
  for (const id of ids) {
    mastered(mastery, id, 'SOUND_ID', at);
    mastered(mastery, id, 'LETTER_SOUND', at);
  }
  return mastery;
}

/** Every Level 1 requirement met at `at`. */
export function masteredLevelOne(at: number): MasteryMap {
  const mastery = masteredSounds(['s', 'a', 't', 'p', 'i', 'm', 'f'], at);
  for (const w of ['pat', 'tap', 'pit', 'sit', 'sip', 'pip']) mastered(mastery, w, 'BLEND_READ', at);
  for (const w of ['sat', 'tip', 'sap', 'mat', 'map']) mastered(mastery, w, 'SEGMENT_SPELL', at);
  return mastery;
}
