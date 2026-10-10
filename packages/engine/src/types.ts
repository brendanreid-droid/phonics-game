import type { Skill, TargetId } from '@soundlings/curriculum';

/** `${targetId}::${skill}` — the identity of one mastery record. */
export type MasteryKey = string;

export function masteryKey(targetId: TargetId, skill: Skill): MasteryKey {
  return `${targetId}::${skill}`;
}

export interface MasteryRecord {
  targetId: TargetId;
  skill: Skill;
  /** Hours until recall probability halves. Grows with success, shrinks on error. */
  halfLifeHours: number;
  /** Epoch ms of the most recent attempt. 0 if never attempted. */
  lastSeenAt: number;
  /** Unscaffolded correct answers. Secondary credit adds 0.5, so this is fractional. */
  correctCount: number;
  attemptCount: number;
  consecutiveCorrect: number;
  avgLatencyMs: number;
  /** Task types the child has answered correctly without scaffolding. */
  taskTypesSeen: string[];
  /** Distinct sessions in which this target was attempted. */
  sessionsSeen: number;
  lastSessionId: string | null;
  scaffoldedCount: number;
}

export type MasteryMap = Record<MasteryKey, MasteryRecord>;

/**
 * One answered question. Append-only: these are never mutated, and every
 * mastery number is derivable from the full attempt log.
 */
export interface Attempt {
  sessionId: string;
  targetId: TargetId;
  skill: Skill;
  taskTypeId: string;
  correct: boolean;
  /** True when the child was shown the answer. Advances the quest, proves nothing. */
  scaffolded: boolean;
  latencyMs: number;
  /** 1 for the task's primary target, 0.5 for targets exercised incidentally. */
  weight: number;
  /** What the child picked when wrong. Feeds the confusion map. */
  chosen?: TargetId;
  at: number;
}

/** `${target}>${chosen}` → how many times the child made that specific mix-up. */
export type ConfusionMap = Record<string, number>;

export function confusionKey(targetId: TargetId, chosen: TargetId): string {
  return `${targetId}>${chosen}`;
}

export type SessionBand = 'focus' | 'review' | 'winback';

export interface TaskInstance {
  id: string;
  taskTypeId: string;
  skill: Skill;
  primaryTarget: TargetId;
  /** Targets this task also provides evidence for, credited at half weight. */
  secondaryTargets: TargetId[];
  /** Everything shown to the child, correct answer included, already shuffled. */
  choices: TargetId[];
  correctChoice: TargetId;
  band: SessionBand;
  /**
   * True for the three confidence positions: first task, middle third, last
   * task. Normally filled from the win-back pool. For a brand-new child with
   * nothing mastered yet, filled with the easiest available task instead — a
   * five-year-old's first ever screen must not be their hardest.
   */
  anchor: boolean;
  difficulty: number;
  seed: number;
}
