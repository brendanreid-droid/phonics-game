import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Attempt, ConfusionMap, MasteryMap } from '@soundlings/engine';
import { isActiveSession, mergeHighScore } from './ProgressRepo';
import type { ActiveSession, HighScore, ProgressRepo } from './ProgressRepo';

/**
 * What reading one key produced. Three outcomes rather than two, because the
 * append-only log must tell "there is nothing there" apart from "something is
 * there and I could not read it". Treating both as empty would let the next
 * append overwrite a whole history with one attempt.
 */
type ReadResult<T> =
  | { kind: 'missing' }
  | { kind: 'ok'; value: T }
  /** Storage itself failed (transient). The data may be perfectly intact. */
  | { kind: 'io' }
  /** Stored, but not parseable or not the right shape. `raw` is what was there. */
  | { kind: 'corrupt'; raw: string };

const isArray = (value: unknown): value is unknown[] => Array.isArray(value);
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isCompletions = (value: unknown): boolean =>
  isPlainObject(value) && Object.values(value).every((at) => typeof at === 'number' && Number.isFinite(at));
const isDateList = (value: unknown): boolean => isArray(value) && value.every((d) => typeof d === 'string');

/**
 * Every record kept per profile, under `soundlings/<profileId>/<name>`.
 *
 * The single source of truth for key names: `key()` only accepts one of these,
 * and `clear()` removes exactly these. Adding a record to the repo means adding
 * it here, which makes it deleted with the profile for free. The test that
 * asserts no key remains under a cleared profile is what catches a record
 * written some other way.
 */
const RECORDS = [
  'mastery',
  'attempts',
  'confusions',
  'activeSession',
  'highScores',
  'completions',
  'playedDates',
] as const;
type RecordName = (typeof RECORDS)[number];

/** Suffix of the copy set aside by `quarantine` when a stored value is unreadable. */
const CORRUPT_SUFFIX = '.corrupt';

/**
 * Device-backed ProgressRepo. JSON in AsyncStorage is more than adequate at
 * this data volume — a Level 1 child accumulates a few hundred attempts — and
 * it keeps the review gate free of any native database setup.
 *
 * Plan 2 replaces this with SQLite plus a Supabase sync queue. Because the
 * interface is the contract, that change does not reach the quest runner.
 *
 * Failure policy: a failed or unreadable read must not stop a child playing,
 * so loads fall back to empty. It must also never destroy history, so a
 * read-modify-write that could not read what is there does not write.
 */
export class AsyncStorageProgressRepo implements ProgressRepo {
  /**
   * Operations run one at a time, in call order. AsyncStorage has no
   * transactions, so two overlapping appends would each read the same log and
   * the second write would drop the first attempt. The quest runner records a
   * task's primary and secondary attempts back to back; this makes that safe.
   */
  private tail: Promise<unknown> = Promise.resolve();

  loadMastery(profileId: string): Promise<MasteryMap> {
    return this.serial(async () => {
      const result = await this.read<MasteryMap>(this.key(profileId, 'mastery'), isPlainObject);
      return result.kind === 'ok' ? result.value : {};
    });
  }

  saveMastery(profileId: string, mastery: MasteryMap): Promise<void> {
    return this.serial(() => this.write(this.key(profileId, 'mastery'), mastery));
  }

  appendAttempt(profileId: string, attempt: Attempt): Promise<void> {
    return this.serial(async () => {
      const key = this.key(profileId, 'attempts');
      const result = await this.read<Attempt[]>(key, isArray);
      let existing: Attempt[];
      if (result.kind === 'ok') {
        existing = result.value;
      } else if (result.kind === 'missing') {
        existing = [];
      } else if (result.kind === 'corrupt') {
        // Keep what was there for later forensics, then carry on with a clean log.
        await this.quarantine(key, result.raw);
        existing = [];
      } else {
        // Could not read the log. It is probably fine; writing now would replace
        // it with a single attempt. Losing this one attempt is the lesser harm.
        return;
      }
      existing.push(attempt);
      await this.write(key, existing);
    });
  }

  loadAttempts(profileId: string): Promise<Attempt[]> {
    return this.serial(async () => {
      const result = await this.read<Attempt[]>(this.key(profileId, 'attempts'), isArray);
      return result.kind === 'ok' ? result.value : [];
    });
  }

  loadConfusions(profileId: string): Promise<ConfusionMap> {
    return this.serial(async () => {
      const result = await this.read<ConfusionMap>(this.key(profileId, 'confusions'), isPlainObject);
      return result.kind === 'ok' ? result.value : {};
    });
  }

  saveConfusions(profileId: string, confusions: ConfusionMap): Promise<void> {
    return this.serial(() => this.write(this.key(profileId, 'confusions'), confusions));
  }

  loadActiveSession(profileId: string): Promise<ActiveSession | null> {
    return this.serial(async () => {
      const result = await this.read<ActiveSession>(
        this.key(profileId, 'activeSession'),
        isActiveSession,
      );
      return result.kind === 'ok' ? result.value : null;
    });
  }

  saveActiveSession(profileId: string, session: ActiveSession | null): Promise<void> {
    return this.serial(() => this.write(this.key(profileId, 'activeSession'), session));
  }

  loadHighScores(profileId: string): Promise<HighScore[]> {
    return this.serial(async () => {
      const result = await this.read<HighScore[]>(this.key(profileId, 'highScores'), isArray);
      return result.kind === 'ok' ? result.value : [];
    });
  }

  saveHighScore(profileId: string, score: HighScore): Promise<void> {
    return this.serial(async () => {
      const key = this.key(profileId, 'highScores');
      const result = await this.read<HighScore[]>(key, isArray);
      if (result.kind === 'io') return;
      if (result.kind === 'corrupt') await this.quarantine(key, result.raw);
      const existing = result.kind === 'ok' ? result.value : [];
      await this.write(key, mergeHighScore(existing, score));
    });
  }

  loadCompletions(profileId: string): Promise<Record<number, number>> {
    return this.serial(async () => {
      const result = await this.read<Record<number, number>>(this.key(profileId, 'completions'), isCompletions);
      return result.kind === 'ok' ? result.value : {};
    });
  }

  markLevelComplete(profileId: string, level: number, at: number): Promise<void> {
    // Reads and writes inside one queued step: calling loadCompletions from in
    // here would queue behind this very step and never return.
    return this.serial(async () => {
      const key = this.key(profileId, 'completions');
      const result = await this.read<Record<number, number>>(key, isCompletions);
      // Could not read what is already latched; writing now would replace every
      // badge the child has with this one.
      if (result.kind === 'io') return;
      if (result.kind === 'corrupt') await this.quarantine(key, result.raw);
      const existing = result.kind === 'ok' ? result.value : {};
      if (existing[level] !== undefined) return;
      await this.write(key, { ...existing, [level]: at });
    });
  }

  mergeCompletion(profileId: string, level: number, at: number): Promise<void> {
    return this.serial(async () => {
      const key = this.key(profileId, 'completions');
      const result = await this.read<Record<number, number>>(key, isCompletions);
      if (result.kind === 'io') return;
      if (result.kind === 'corrupt') await this.quarantine(key, result.raw);
      const existing = result.kind === 'ok' ? result.value : {};
      if (existing[level] !== undefined && existing[level] <= at) return;
      await this.write(key, { ...existing, [level]: at });
    });
  }

  loadPlayedDates(profileId: string): Promise<string[]> {
    return this.serial(async () => {
      const result = await this.read<string[]>(this.key(profileId, 'playedDates'), isDateList);
      return result.kind === 'ok' ? result.value : [];
    });
  }

  markPlayedOn(profileId: string, date: string): Promise<void> {
    return this.serial(async () => {
      const key = this.key(profileId, 'playedDates');
      const result = await this.read<string[]>(key, isDateList);
      if (result.kind === 'io') return;
      if (result.kind === 'corrupt') await this.quarantine(key, result.raw);
      const existing = result.kind === 'ok' ? result.value : [];
      if (existing.includes(date)) return;
      await this.write(key, [...existing, date].sort());
    });
  }

  clear(profileId: string): Promise<void> {
    return this.serial(async () => {
      // An explicit list of exact keys - NOT getAllKeys() filtered by prefix.
      // A prefix match for id "kid" also catches "kid2", and deleting the wrong
      // child's progress cannot be undone. Quarantined copies are included:
      // they are the same child's data, set aside.
      const keys = RECORDS.flatMap((name) => [
        this.key(profileId, name),
        this.key(profileId, name) + CORRUPT_SUFFIX,
      ]);
      // Deliberately not caught. See ProgressRepo.clear.
      await AsyncStorage.multiRemove(keys);
    });
  }

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.tail.then(operation);
    this.tail = run.catch(() => undefined);
    return run;
  }

  private key(profileId: string, name: RecordName): string {
    return `soundlings/${profileId}/${name}`;
  }

  private async read<T>(key: string, isValid: (value: unknown) => boolean): Promise<ReadResult<T>> {
    let raw: string | null;
    try {
      raw = await AsyncStorage.getItem(key);
    } catch {
      return { kind: 'io' };
    }
    if (raw === null) return { kind: 'missing' };
    try {
      const parsed: unknown = JSON.parse(raw);
      return isValid(parsed) ? { kind: 'ok', value: parsed as T } : { kind: 'corrupt', raw };
    } catch {
      return { kind: 'corrupt', raw };
    }
  }

  private async write(key: string, value: unknown): Promise<void> {
    try {
      if (value === null) {
        await AsyncStorage.removeItem(key);
        return;
      }
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch {
      // A failed write is survivable; a thrown error mid-quest is not.
      // TODO(Plan 2): this swallows the failure completely, so a full disk
      // silently leaves the saved resume point and attempt log stale. The quest
      // runner may want to surface a failed save, e.g. via a returned flag.
    }
  }

  private async quarantine(key: string, raw: string): Promise<void> {
    try {
      await AsyncStorage.setItem(`${key}${CORRUPT_SUFFIX}`, raw);
    } catch {
      // Best effort only.
    }
  }
}
