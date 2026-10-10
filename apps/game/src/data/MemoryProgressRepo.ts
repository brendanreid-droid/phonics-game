import type { Attempt, ConfusionMap, MasteryMap } from '@soundlings/engine';
import { mergeHighScore } from './ProgressRepo';
import type { ActiveSession, HighScore, ProgressRepo } from './ProgressRepo';

interface ProfileState {
  mastery: MasteryMap;
  attempts: Attempt[];
  confusions: ConfusionMap;
  activeSession: ActiveSession | null;
  highScores: HighScore[];
}

/**
 * Copies a value through JSON, as the device repository does.
 *
 * Without this the in-memory repo would hand back the very objects it was
 * given, so a test could pass on aliasing — a mutated plan "persisting" because
 * it was never copied — or on a value (undefined, NaN, a Map) that JSON would
 * silently change on a real device. Copying on the way in and the way out makes
 * this repo as lossy as the real one.
 */
function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * In-memory ProgressRepo. Used by tests and by the quest runner in development,
 * so the game is playable before any storage layer exists.
 */
export class MemoryProgressRepo implements ProgressRepo {
  private readonly profiles = new Map<string, ProfileState>();

  async loadMastery(profileId: string): Promise<MasteryMap> {
    return copy(this.state(profileId).mastery);
  }

  async saveMastery(profileId: string, mastery: MasteryMap): Promise<void> {
    this.state(profileId).mastery = copy(mastery);
  }

  async appendAttempt(profileId: string, attempt: Attempt): Promise<void> {
    this.state(profileId).attempts.push(copy(attempt));
  }

  async loadAttempts(profileId: string): Promise<Attempt[]> {
    return copy(this.state(profileId).attempts);
  }

  async loadConfusions(profileId: string): Promise<ConfusionMap> {
    return copy(this.state(profileId).confusions);
  }

  async saveConfusions(profileId: string, confusions: ConfusionMap): Promise<void> {
    this.state(profileId).confusions = copy(confusions);
  }

  async loadActiveSession(profileId: string): Promise<ActiveSession | null> {
    const session = this.state(profileId).activeSession;
    return session === null ? null : copy(session);
  }

  async saveActiveSession(profileId: string, session: ActiveSession | null): Promise<void> {
    this.state(profileId).activeSession = session === null ? null : copy(session);
  }

  async loadHighScores(profileId: string): Promise<HighScore[]> {
    return copy(this.state(profileId).highScores);
  }

  async saveHighScore(profileId: string, score: HighScore): Promise<void> {
    const state = this.state(profileId);
    state.highScores = mergeHighScore(state.highScores, copy(score));
  }

  private state(profileId: string): ProfileState {
    const existing = this.profiles.get(profileId);
    if (existing) return existing;
    const created: ProfileState = {
      mastery: {},
      attempts: [],
      confusions: {},
      activeSession: null,
      highScores: [],
    };
    this.profiles.set(profileId, created);
    return created;
  }
}
