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
  /**
   * The creatures already earned when this quest began. Stored so that a quest
   * resumed after an interruption still announces a creature earned before the
   * interruption: recomputed on resume, the mastery saved so far would already
   * include it and the hatching would never be shown. Optional because sessions
   * stored by an earlier build do not have it.
   */
  creaturesAtStart?: string[];
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

  /** Level number → epoch ms of the FIRST time it was completed. */
  loadCompletions(profileId: string): Promise<Record<number, number>>;
  /**
   * Latches a level as complete. Idempotent, and keeps the earliest time.
   *
   * Required by spec §5.7: `levelProgress` is evaluated at `now`, so a level
   * finished yesterday reads as unfinished today once strength decays, and a
   * single wrong answer un-masters a target. The live calculation is correct
   * and stays as it is — it answers "what can they do right now?", which the
   * island home and the session builder both need. This is the badge, and a
   * child must never lose a level they have finished.
   */
  markLevelComplete(profileId: string, level: number, at: number): Promise<void>;
  /**
   * Latches a level as complete at the EARLIER of the time already stored and
   * the one given. For sync only.
   *
   * `markLevelComplete` keeps the first time latched, so that a clock that moves
   * backwards cannot rewrite when a child did something. Sync is different: it
   * brings in a time from another device, and when that device finished the level
   * first, the earlier time is the true one. Never moves a time later.
   */
  mergeCompletion(profileId: string, level: number, at: number): Promise<void>;

  /** Local YYYY-MM-DD dates on which a quest was finished, ascending, each once. */
  loadPlayedDates(profileId: string): Promise<string[]>;
  markPlayedOn(profileId: string, date: string): Promise<void>;

  /**
   * Deletes every trace of ONE profile's progress and nothing belonging to any
   * other. Used when a grown-up deletes a child's profile.
   *
   * Unlike every other write here it must REJECT when it cannot finish: the
   * caller removes the profile only after this succeeds, and a clear that
   * failed quietly would leave the learning record orphaned with no id left to
   * find it by. Idempotent, so a failed delete can simply be retried.
   */
  clear(profileId: string): Promise<void>;
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
