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
  /**
   * How many choices were on the screen: `task.choices.length`. Recorded on the
   * task's own (primary) attempt only, since the credit a word task gives its
   * letters is not a question with choices. It is what the chance of a lucky
   * answer is made from, so the parent area's near-chance signal reads it rather
   * than rebuilding it. Optional because logs written before it existed do not
   * have it, and a child's history must not break on an update: consumers fall
   * back to reconstructing it (see apps/game/src/parent/needsAHand.ts).
   *
   * For Word Builder this counts tiles, not options to pick between.
   */
  choiceCount?: number;
  at: number;
}

/**
 * `${target}>${chosen}` → how many times the child made that specific mix-up,
 * over their whole life.
 *
 * That lifetime count is exactly right for the distractor picker: a sound a
 * child has ever confused is worth contrasting again. It is NOT what a parent
 * should be told, because it has no dates and never goes down, so a mix-up from
 * the first month would read as current for ever. The parent area derives its
 * view from the recent attempt log instead (apps/game/src/parent/confusionReport.ts).
 * They answer different questions; do not unify them.
 */
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
