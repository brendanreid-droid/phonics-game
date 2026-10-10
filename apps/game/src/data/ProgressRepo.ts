import type { Attempt, ConfusionMap, MasteryMap, TaskInstance } from '@soundlings/engine';

/** A quest in progress, persisted so an interruption costs nothing. */
export interface ActiveSession {
  sessionId: string;
  level: number;
  /**
   * The whole plan, stored rather than regenerated. Rebuilding it on resume
   * would re-roll the quest and could re-ask questions the child has already
   * answered — including ones they got wrong, which is the worst case.
   */
  plan: TaskInstance[];
  /** Index of the next unanswered task. */
  index: number;
  stars: number;
  startedAt: number;
}

export interface HighScore {
  level: number;
  stars: number;
  /** True when the quest was completed with no errors and no scaffolding. */
  cleanRun: boolean;
  at: number;
}

/**
 * All persistence for one child, behind one interface.
 *
 * Plan 2 adds a Supabase-backed implementation and an offline sync queue. The
 * attempt log is append-only so that every later metric — dashboards,
 * confusion analysis, pacing experiments — is derivable without a migration,
 * and so mastery can be rebuilt from scratch if the algorithm changes. It will.
 */
export interface ProgressRepo {
  loadMastery(profileId: string): Promise<MasteryMap>;
  saveMastery(profileId: string, mastery: MasteryMap): Promise<void>;

  appendAttempt(profileId: string, attempt: Attempt): Promise<void>;
  loadAttempts(profileId: string): Promise<Attempt[]>;

  loadConfusions(profileId: string): Promise<ConfusionMap>;
  saveConfusions(profileId: string, confusions: ConfusionMap): Promise<void>;

  loadActiveSession(profileId: string): Promise<ActiveSession | null>;
  saveActiveSession(profileId: string, session: ActiveSession | null): Promise<void>;

  loadHighScores(profileId: string): Promise<HighScore[]>;
  saveHighScore(profileId: string, score: HighScore): Promise<void>;
}

/** Merges a score in, keeping the best per level. Shared by all implementations. */
export function mergeHighScore(scores: HighScore[], incoming: HighScore): HighScore[] {
  const others = scores.filter((s) => s.level !== incoming.level);
  const existing = scores.find((s) => s.level === incoming.level);
  if (!existing) return [...others, incoming];
  const better =
    incoming.stars > existing.stars ||
    (incoming.stars === existing.stars && incoming.cleanRun && !existing.cleanRun);
  return [...others, better ? incoming : existing];
}

/**
 * Structural check on a stored quest, for a value read back from storage.
 *
 * Storage outlives the app version that wrote it, and it can be truncated by a
 * flat battery. A session that fails this is treated as no session: the child
 * starts a fresh quest, which is a small loss, where handing the quest runner
 * a plan with `index` past its end would crash it on launch.
 *
 * Deliberately shallow: it checks the shape the runner indexes into, not the
 * contents of each task.
 */
export function isActiveSession(value: unknown): value is ActiveSession {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.sessionId === 'string' &&
    typeof v.level === 'number' &&
    Array.isArray(v.plan) &&
    v.plan.every((t) => typeof t === 'object' && t !== null) &&
    typeof v.index === 'number' &&
    Number.isInteger(v.index) &&
    v.index >= 0 &&
    v.index <= v.plan.length &&
    typeof v.stars === 'number' &&
    Number.isFinite(v.stars) &&
    typeof v.startedAt === 'number'
  );
}
