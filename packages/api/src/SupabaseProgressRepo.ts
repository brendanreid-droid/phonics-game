import type { SupabaseClient } from '@supabase/supabase-js';
import type { IdentifiedAttempt } from './ids';
import { RemoteError } from './remote';
import type { RemoteStore } from './remote';
import {
  attemptToRow,
  completionToRow,
  profileToRow,
  rowToAttempt,
  rowToCompletion,
  rowToProfile,
} from './rows';
import type { AttemptRow, CompletionDbRow, ProfileRow } from './rows';
import type { CompletionRow, RemoteState, SyncedProfile } from './syncQueue';

/** What a request resolves to: supabase-js reports failure here rather than by throwing. */
interface Outcome {
  data: unknown;
  error: { message: string; code?: string } | null;
}

/** Rows per request. PostgREST caps a response at 1000 by default. */
const PAGE = 1000;
/** Rows per insert: small enough that one bad row costs a short search, large enough to be few requests. */
const WRITE_CHUNK = 200;
/** Ids per lookup. Ids go in the query string, and a long URL is refused. */
const ID_CHUNK = 100;

/**
 * Turns a Supabase error into the one distinction the caller acts on.
 *
 * supabase-js does not throw on a failed request, it returns `{ error }`, and a
 * dropped connection arrives as an error with no Postgres code. PostgREST and
 * Postgres errors carry a code, and those mean the server answered and refused.
 */
function raise(error: { message: string; code?: string }): never {
  const code = error.code;
  // 5xx and gateway errors from the platform have no SQLSTATE; treat as transient.
  const answered = typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) && !/^(08|57|53|58)/.test(code);
  throw new RemoteError(answered ? 'rejected' : 'network', error.message, code);
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * The server side of sync, over Supabase.
 *
 * Only ever INSERTs, with duplicates ignored (ON CONFLICT DO NOTHING). The
 * attempt log has no update policy, and that is why: a merge-style upsert would
 * need one, and would also let a stale device overwrite a row. Ignoring
 * duplicates is what makes a replayed push harmless.
 *
 * Row-level security does the scoping. Every select here is "everything I can
 * see", and what a parent can see is their own children and nothing else.
 */
export class SupabaseProgressRepo implements RemoteStore {
  constructor(private readonly client: SupabaseClient) {}

  async fetchState(): Promise<RemoteState> {
    const [profiles, attempts, completions] = await Promise.all([
      this.pages<ProfileRow>('child_profiles', '*', ['created_at', 'id']),
      this.pages<Pick<AttemptRow, 'id' | 'profile_id'>>('task_attempts', 'id, profile_id', ['id']),
      this.pages<CompletionDbRow>('level_completions', '*', ['profile_id', 'level']),
    ]);

    const attemptIds: Record<string, string[]> = {};
    for (const row of attempts) (attemptIds[row.profile_id] ??= []).push(row.id);

    const byProfile: Record<string, Record<number, number>> = {};
    for (const row of completions.map(rowToCompletion)) {
      (byProfile[row.profileId] ??= {})[row.level] = row.completedAt;
    }

    return { profiles: profiles.map(rowToProfile), attemptIds, completions: byProfile };
  }

  async fetchAttempts(profileId: string, ids: readonly string[]): Promise<IdentifiedAttempt[]> {
    const found: IdentifiedAttempt[] = [];
    for (const batch of chunks(ids, ID_CHUNK)) {
      const { data, error } = await this.safely(() =>
        this.client.from('task_attempts').select('*').eq('profile_id', profileId).in('id', batch),
      );
      if (error) raise(error);
      found.push(...((data ?? []) as AttemptRow[]).map(rowToAttempt));
    }
    return found;
  }

  async insertProfiles(parentId: string, profiles: readonly SyncedProfile[]): Promise<void> {
    if (profiles.length === 0) return;
    const { error } = await this.safely(() =>
      this.client
        .from('child_profiles')
        .upsert(profiles.map((p) => profileToRow(parentId, p)), { onConflict: 'id', ignoreDuplicates: true }),
    );
    if (error) raise(error);
  }

  async insertAttempts(profileId: string, attempts: readonly IdentifiedAttempt[]): Promise<void> {
    for (const batch of chunks(attempts, WRITE_CHUNK)) {
      const { error } = await this.safely(() =>
        this.client
          .from('task_attempts')
          .upsert(batch.map((a) => attemptToRow(profileId, a)), { onConflict: 'id', ignoreDuplicates: true }),
      );
      if (error) raise(error);
    }
  }

  async insertCompletions(rows: readonly CompletionRow[]): Promise<void> {
    if (rows.length === 0) return;
    const { error } = await this.safely(() =>
      this.client
        .from('level_completions')
        .upsert(rows.map(completionToRow), { onConflict: 'profile_id,level', ignoreDuplicates: true }),
    );
    if (error) raise(error);
  }

  async deleteProfile(id: string): Promise<void> {
    const { error } = await this.safely(() => this.client.from('child_profiles').delete().eq('id', id));
    if (error) raise(error);
  }

  /**
   * Every row of a table, a page at a time. The order must be total (it ends in
   * a unique key) or a row can be skipped or repeated across the page boundary.
   */
  private async pages<T>(table: string, columns: string, order: readonly string[]): Promise<T[]> {
    const all: T[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.safely(() => {
        let query = this.client.from(table).select(columns);
        for (const column of order) query = query.order(column, { ascending: true });
        return query.range(from, from + PAGE - 1);
      });
      if (error) raise(error);
      const rows = (data ?? []) as T[];
      all.push(...rows);
      if (rows.length < PAGE) return all;
    }
  }

  /** A fetch that throws (offline, DNS) becomes the same shape as one that returned an error. */
  private async safely(call: () => PromiseLike<Outcome>): Promise<Outcome> {
    try {
      return await call();
    } catch (error) {
      return { data: null, error: { message: error instanceof Error ? error.message : 'network error' } };
    }
  }
}
