import { newUuid } from '@soundlings/api';
import type { Attempt, ConfusionMap, MasteryMap } from '@soundlings/engine';
import type { ActiveSession, HighScore, ProgressRepo } from './ProgressRepo';

/** How long a quest counts as under way after its last saved step. */
const QUEST_IDLE_MS = 10 * 60 * 1000;

export interface QuestEvents {
  /** A quest has just been finished and its evidence saved. */
  questFinished(): void;
}

/**
 * Wraps the local ProgressRepo. Every read and every write goes to local storage
 * exactly as it did before, and only then, afterwards, does anything else happen.
 *
 * THE RULE THIS FILE EXISTS TO HOLD: the network is never on the path between a
 * child's tap and the game responding. Nothing in here awaits a network call, and
 * the one thing it does on top of delegating is stamp an id on a new attempt, a
 * local, synchronous, in-memory operation. When a quest finishes it tells a
 * listener, which schedules a sync for later and returns at once; whether that
 * sync works, fails or never runs changes nothing the caller sees.
 *
 * The active mid-quest session is deliberately NOT synced. Two devices resuming
 * the same half-finished quest is a conflict with no good resolution, and the
 * feature nobody asked for. An interrupted quest resumes on the device it
 * started on. This will look like an oversight otherwise.
 */
export class SyncingProgressRepo implements ProgressRepo {
  private lastQuestStepAt: number | null = null;

  constructor(
    /** The device's own store. The sync reads and writes this directly, never through the wrapper. */
    readonly local: ProgressRepo,
    private readonly events: Partial<QuestEvents> = {},
    private readonly now: () => number = () => Date.now(),
    private readonly newId: () => string = newUuid,
  ) {}

  /**
   * Whether a quest is being played right now. The sync keeps off the device's
   * mastery while it is true: the quest holds its own copy in memory and would
   * write over anything changed underneath it.
   */
  isQuestInProgress(): boolean {
    return this.lastQuestStepAt !== null && this.now() - this.lastQuestStepAt < QUEST_IDLE_MS;
  }

  loadMastery(profileId: string): Promise<MasteryMap> {
    return this.local.loadMastery(profileId);
  }

  saveMastery(profileId: string, mastery: MasteryMap): Promise<void> {
    return this.local.saveMastery(profileId, mastery);
  }

  appendAttempt(profileId: string, attempt: Attempt): Promise<void> {
    // The id is what lets another device recognise this attempt as one it already
    // holds. Stamped on every attempt, signed in or not, so signing in later has
    // nothing to backfill for anything played from now on.
    return this.local.appendAttempt(profileId, attempt.id === undefined ? { ...attempt, id: this.newId() } : attempt);
  }

  loadAttempts(profileId: string): Promise<Attempt[]> {
    return this.local.loadAttempts(profileId);
  }

  loadConfusions(profileId: string): Promise<ConfusionMap> {
    return this.local.loadConfusions(profileId);
  }

  saveConfusions(profileId: string, confusions: ConfusionMap): Promise<void> {
    return this.local.saveConfusions(profileId, confusions);
  }

  loadActiveSession(profileId: string): Promise<ActiveSession | null> {
    return this.local.loadActiveSession(profileId);
  }

  async saveActiveSession(profileId: string, session: ActiveSession | null): Promise<void> {
    if (session !== null) this.lastQuestStepAt = this.now();
    await this.local.saveActiveSession(profileId, session);
    if (session === null) {
      // The last thing a finished quest does. Tell the listener and move on; it
      // schedules its work for later and nothing it does is awaited here.
      this.lastQuestStepAt = null;
      this.notify(() => this.events.questFinished?.());
    }
  }

  loadHighScores(profileId: string): Promise<HighScore[]> {
    return this.local.loadHighScores(profileId);
  }

  saveHighScore(profileId: string, score: HighScore): Promise<void> {
    return this.local.saveHighScore(profileId, score);
  }

  loadCompletions(profileId: string): Promise<Record<number, number>> {
    return this.local.loadCompletions(profileId);
  }

  markLevelComplete(profileId: string, level: number, at: number): Promise<void> {
    return this.local.markLevelComplete(profileId, level, at);
  }

  mergeCompletion(profileId: string, level: number, at: number): Promise<void> {
    return this.local.mergeCompletion(profileId, level, at);
  }

  loadPlayedDates(profileId: string): Promise<string[]> {
    return this.local.loadPlayedDates(profileId);
  }

  markPlayedOn(profileId: string, date: string): Promise<void> {
    return this.local.markPlayedOn(profileId, date);
  }

  clear(profileId: string): Promise<void> {
    return this.local.clear(profileId);
  }

  /** A listener that throws must not turn a saved quest into a failed one. */
  private notify(call: () => void): void {
    try {
      call();
    } catch {
      // Nothing about sync is allowed to reach play.
    }
  }
}
