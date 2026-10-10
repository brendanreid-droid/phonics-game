import type { TargetId } from '@soundlings/curriculum';
import type { EngineConfig } from './config';
import { recordAttempts } from './mastery';
import type { Attempt, MasteryMap, TaskInstance } from './types';

/** What the quest runner knows once the child has finished a task. */
export interface TaskOutcome {
  sessionId: string;
  correct: boolean;
  /** True when the child was shown the answer. */
  scaffolded: boolean;
  latencyMs: number;
  /**
   * True when the child was right only after the choices had been narrowed or
   * the mnemonic shown (hint tier 2 or more), without being shown the answer.
   * With two choices left a correct tap is partly a coin flip, so it is real
   * evidence but weaker. The answer was not shown, so `scaffolded` stays false;
   * that is reserved for tier 3. Ignored unless the answer is correct and not
   * scaffolded: an error is an error however much help preceded it.
   */
  aided?: boolean;
  /** What the child picked when wrong. Recorded on the primary attempt only. */
  chosen?: TargetId;
  at: number;
}

/**
 * The one place a finished task becomes evidence. Every consumer (the quest
 * runner, the simulation harness) goes through here, so the weights, the
 * secondary skill and the `chosen` handling cannot drift apart.
 *
 * Emits the primary attempt at weight 1, then one SOUND_ID attempt per
 * distinct secondary target at `config.secondaryWeight`. An `aided` correct
 * answer scales every one of those by `config.secondaryWeight` again: half the
 * evidence it would otherwise have been. A repeated secondary
 * ("mum" has /m/ twice) is one piece of evidence, not two, and a secondary
 * identical to the primary's own record is not credited a second time.
 */
export function attemptsForTask(
  task: TaskInstance,
  outcome: TaskOutcome,
  config: EngineConfig,
): Attempt[] {
  const scale = outcome.aided === true && outcome.correct && !outcome.scaffolded ? config.secondaryWeight : 1;
  const shared = {
    sessionId: outcome.sessionId,
    taskTypeId: task.taskTypeId,
    correct: outcome.correct,
    scaffolded: outcome.scaffolded,
    latencyMs: outcome.latencyMs,
    at: outcome.at,
  };

  const primary: Attempt = {
    ...shared,
    targetId: task.primaryTarget,
    skill: task.skill,
    weight: scale,
  };
  if (!outcome.correct && outcome.chosen !== undefined) primary.chosen = outcome.chosen;

  const secondaries: Attempt[] = [];
  const seen = new Set<TargetId>();
  for (const targetId of task.secondaryTargets) {
    if (seen.has(targetId)) continue;
    seen.add(targetId);
    if (task.skill === 'SOUND_ID' && targetId === task.primaryTarget) continue;
    secondaries.push({ ...shared, targetId, skill: 'SOUND_ID', weight: config.secondaryWeight * scale });
  }

  return [primary, ...secondaries];
}

/** Folds a finished task into the mastery map. Pure: returns a new map. */
export function recordTaskResult(
  map: MasteryMap,
  task: TaskInstance,
  outcome: TaskOutcome,
  config: EngineConfig,
): MasteryMap {
  return recordAttempts(map, attemptsForTask(task, outcome, config), config);
}
