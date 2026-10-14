import type { IdentifiedAttempt } from './ids';
import type { CompletionRow, RemoteState, SyncedProfile } from './syncQueue';

/**
 * The server, as the sync needs to see it. The real implementation is
 * SupabaseProgressRepo; MemoryRemote stands in for it in tests and lets a test
 * switch the network off, which is the case that matters most.
 */
export interface RemoteStore {
  /** Profiles, attempt ids and completions for the signed-in parent. Ids only for attempts. */
  fetchState(): Promise<RemoteState>;
  fetchAttempts(profileId: string, ids: readonly string[]): Promise<IdentifiedAttempt[]>;
  /** Adds what is missing; anything already there is left exactly as it is. */
  insertProfiles(parentId: string, profiles: readonly SyncedProfile[]): Promise<void>;
  insertAttempts(profileId: string, attempts: readonly IdentifiedAttempt[]): Promise<void>;
  insertCompletions(rows: readonly CompletionRow[]): Promise<void>;
  deleteProfile(id: string): Promise<void>;
}

/**
 * Why a remote call failed, in the one distinction the caller acts on.
 *
 * `network`: the server could not be reached or did not answer. Nothing is
 * wrong with the data; try again later.
 * `rejected`: the server answered and refused (a constraint, a policy). Trying
 * the identical request again will be refused again, so a batch that is
 * rejected is split to find the row responsible instead of retried whole.
 */
export class RemoteError extends Error {
  constructor(
    readonly kind: 'network' | 'rejected',
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'RemoteError';
  }
}

/** In-memory server for tests. Enforces what the real one does: append-only, first completion wins. */
export class MemoryRemote implements RemoteStore {
  /** When false every call fails as a dropped connection would. */
  online = true;
  /** Optionally refuses an attempt as a constraint would. */
  rejects: (attempt: IdentifiedAttempt) => boolean = () => false;
  /** Counts calls, so a test can show a quiet device made none that wrote. */
  readonly calls: string[] = [];

  private profiles = new Map<string, SyncedProfile>();
  private attempts = new Map<string, Map<string, IdentifiedAttempt>>();
  private completions = new Map<string, Map<number, number>>();

  /** Read-only views for assertions. */
  attemptIdsOf(profileId: string): string[] {
    return [...(this.attempts.get(profileId)?.keys() ?? [])].sort();
  }
  profileIds(): string[] {
    return [...this.profiles.keys()].sort();
  }
  completionsOf(profileId: string): Record<number, number> {
    return Object.fromEntries(this.completions.get(profileId) ?? []);
  }

  private guard(call: string): void {
    this.calls.push(call);
    if (!this.online) throw new RemoteError('network', 'Failed to fetch');
  }

  async fetchState(): Promise<RemoteState> {
    this.guard('fetchState');
    return {
      profiles: [...this.profiles.values()].map((p) => ({ ...p })),
      attemptIds: Object.fromEntries([...this.attempts].map(([id, rows]) => [id, [...rows.keys()]])),
      completions: Object.fromEntries([...this.completions].map(([id, rows]) => [id, Object.fromEntries(rows)])),
    };
  }

  async fetchAttempts(profileId: string, ids: readonly string[]): Promise<IdentifiedAttempt[]> {
    this.guard('fetchAttempts');
    const rows = this.attempts.get(profileId);
    return ids.flatMap((id) => {
      const found = rows?.get(id);
      return found ? [{ ...found }] : [];
    });
  }

  async insertProfiles(_parentId: string, profiles: readonly SyncedProfile[]): Promise<void> {
    this.guard('insertProfiles');
    for (const profile of profiles) if (!this.profiles.has(profile.id)) this.profiles.set(profile.id, { ...profile });
  }

  async insertAttempts(profileId: string, attempts: readonly IdentifiedAttempt[]): Promise<void> {
    this.guard('insertAttempts');
    if (!this.profiles.has(profileId)) throw new RemoteError('rejected', 'violates foreign key', '23503');
    // All or nothing, as one INSERT statement is.
    if (attempts.some((a) => this.rejects(a))) throw new RemoteError('rejected', 'violates check constraint', '23514');
    const rows = this.attempts.get(profileId) ?? new Map<string, IdentifiedAttempt>();
    for (const attempt of attempts) if (!rows.has(attempt.id)) rows.set(attempt.id, { ...attempt });
    this.attempts.set(profileId, rows);
  }

  async insertCompletions(rows: readonly CompletionRow[]): Promise<void> {
    this.guard('insertCompletions');
    for (const row of rows) {
      const levels = this.completions.get(row.profileId) ?? new Map<number, number>();
      if (!levels.has(row.level)) levels.set(row.level, row.completedAt);
      this.completions.set(row.profileId, levels);
    }
  }

  async deleteProfile(id: string): Promise<void> {
    this.guard('deleteProfile');
    this.profiles.delete(id);
    this.attempts.delete(id);
    this.completions.delete(id);
  }
}
