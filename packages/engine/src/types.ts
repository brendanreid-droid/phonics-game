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
  /**
   * The decay clock: epoch ms of the last unscaffolded correct attempt. Advanced
   * by nothing else. An error or a scaffolded answer must leave it where it
   * was — if any contact moved it, a child who had just failed a sound would
   * look freshly remembered. 0 if never reinforced.
   */
  lastReinforcedAt: number;
  /**
   * Epoch ms of the most recent attempt of any kind, never moving backwards.
   * For display and the overdue calculation only — NOT the decay clock.
   * 0 if never attempted.
   */
  lastSeenAt: number;
  /** Unscaffolded correct answers, weighted. Secondary credit adds 0.5, so this is fractional. */
  correctCount: number;
  /**
   * Unscaffolded correct answers at full weight, i.e. the child was asked this
   * target directly. Mastery requires at least one: secondary credit alone
   * must never be enough.
   */
  primaryCorrectCount: number;
  attemptCount: number;
  consecutiveCorrect: number;
  avgLatencyMs: number;
  /** Task types the child has answered correctly without scaffolding. */
  taskTypesSeen: string[];
  /**
   * How many times the session id has changed across unscaffolded correct
   * answers. A session containing only errors or scaffolded answers proves
   * nothing and does not count. This is a change counter, not a set: ids
   * A, B, A count as 3, so it assumes a session never resumes once another
   * has begun.
   */
  sessionsProven: number;
  /** The session id of the most recent unscaffolded correct answer. */
  lastProvenSessionId: string | null;
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
  /**
   * Missing Letter only: the index, into the word's graphemes, of the letter
   * that is blanked out. Decided when the plan is built, so a quest that is
   * interrupted and resumed asks about the same gap. Absent for every other
   * task type.
   */
  blankIndex?: number;
}
