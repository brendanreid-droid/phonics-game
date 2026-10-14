import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { RemoteError } from './remote';
import { SupabaseProgressRepo } from './SupabaseProgressRepo';
import type { IdentifiedAttempt } from './ids';

type Call = { table: string; op: string; args: unknown[] };

/**
 * A stand-in for the slice of supabase-js the repo uses: it records what was
 * asked and answers from a script. It cannot say whether the real server would
 * accept a request; that was checked against the project itself.
 */
function fakeClient(respond: (call: Call) => unknown) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const builder: Record<string, unknown> = {};
      let last: Call = { table, op: '', args: [] };
      const record = (op: string) => (...args: unknown[]) => {
        last = { table, op, args };
        calls.push(last);
        return builder;
      };
      for (const op of ['select', 'order', 'range', 'eq', 'in', 'upsert', 'delete']) builder[op] = record(op);
      builder.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
        try {
          resolve(respond(last));
        } catch (error) {
          reject(error);
        }
      };
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const attempt = (n: number): IdentifiedAttempt => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  sessionId: 's',
  targetId: 's',
  skill: 'SOUND_ID',
  taskTypeId: 'sound-hunt',
  correct: true,
  scaffolded: false,
  latencyMs: 1000,
  weight: 1,
  at: n,
});

describe('SupabaseProgressRepo: reading', () => {
  it('reads past the 1000-row page limit, so a long log is not silently cut short', async () => {
    const ids = Array.from({ length: 2300 }, (_, i) => attempt(i).id);
    const { client, calls } = fakeClient((call) => {
      if (call.op !== 'range') return { data: [], error: null };
      const [from, to] = call.args as [number, number];
      if (call.table === 'task_attempts') {
        return { data: ids.slice(from, to + 1).map((id) => ({ id, profile_id: 'p' })), error: null };
      }
      return { data: [], error: null };
    });
    const state = await new SupabaseProgressRepo(client).fetchState();
    expect(state.attemptIds.p).toHaveLength(2300);
    expect(new Set(state.attemptIds.p).size).toBe(2300);
    expect(calls.filter((c) => c.table === 'task_attempts' && c.op === 'range')).toHaveLength(3);
  });

  it('pages in a total order, ending in a unique key', async () => {
    const { client, calls } = fakeClient(() => ({ data: [], error: null }));
    await new SupabaseProgressRepo(client).fetchState();
    const orderOf = (table: string) => calls.filter((c) => c.table === table && c.op === 'order').map((c) => c.args[0]);
    expect(orderOf('task_attempts')).toEqual(['id']);
    expect(orderOf('child_profiles')).toEqual(['created_at', 'id']);
    expect(orderOf('level_completions')).toEqual(['profile_id', 'level']);
  });

  it('maps profiles and completions out of their rows', async () => {
    const { client } = fakeClient((call) => {
      if (call.op !== 'range') return { data: [], error: null };
      if (call.table === 'child_profiles') {
        return {
          data: [{ id: 'p', parent_id: 'u', name: 'Ada', avatar_id: 'fox', created_at: '2026-10-14T00:00:00.000Z', last_played_on: '2026-10-14' }],
          error: null,
        };
      }
      if (call.table === 'level_completions') return { data: [{ profile_id: 'p', level: 1, completed_at: 123 }], error: null };
      return { data: [], error: null };
    });
    const state = await new SupabaseProgressRepo(client).fetchState();
    expect(state.profiles).toEqual([{ id: 'p', name: 'Ada', avatarId: 'fox', createdAt: Date.parse('2026-10-14T00:00:00.000Z'), lastPlayedOn: '2026-10-14' }]);
    expect(state.completions).toEqual({ p: { 1: 123 } });
  });
});

describe('SupabaseProgressRepo: writing', () => {
  it('only ever inserts, ignoring duplicates: the log has no update policy and a replay must change nothing', async () => {
    const { client, calls } = fakeClient(() => ({ data: null, error: null }));
    const repo = new SupabaseProgressRepo(client);
    await repo.insertProfiles('u', [{ id: 'p', name: 'Ada', avatarId: 'fox', createdAt: 1, lastPlayedOn: null }]);
    await repo.insertAttempts('p', [attempt(1)]);
    await repo.insertCompletions([{ profileId: 'p', level: 1, completedAt: 5 }]);
    const upserts = calls.filter((c) => c.op === 'upsert');
    expect(upserts).toHaveLength(3);
    for (const upsert of upserts) expect(upsert.args[1]).toMatchObject({ ignoreDuplicates: true });
  });

  it('sends attempts in chunks, under the profile they belong to', async () => {
    const { client, calls } = fakeClient(() => ({ data: null, error: null }));
    await new SupabaseProgressRepo(client).insertAttempts('p', Array.from({ length: 450 }, (_, i) => attempt(i)));
    const sent = calls.filter((c) => c.op === 'upsert').map((c) => c.args[0] as { profile_id: string }[]);
    expect(sent.map((rows) => rows.length)).toEqual([200, 200, 50]);
    expect(sent.flat().every((row) => row.profile_id === 'p')).toBe(true);
  });

  it('looks attempts up in bounded groups, scoped to the profile', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => attempt(i).id);
    const { client, calls } = fakeClient(() => ({ data: [], error: null }));
    await new SupabaseProgressRepo(client).fetchAttempts('p', ids);
    const lookups = calls.filter((c) => c.op === 'in');
    expect(lookups.map((c) => (c.args[1] as string[]).length)).toEqual([100, 100, 50]);
    expect(calls.some((c) => c.op === 'eq' && c.args[0] === 'profile_id' && c.args[1] === 'p')).toBe(true);
  });

  it('deletes a profile by id', async () => {
    const { client, calls } = fakeClient(() => ({ data: null, error: null }));
    await new SupabaseProgressRepo(client).deleteProfile('p');
    expect(calls.map((c) => c.op)).toEqual(['delete', 'eq']);
    expect(calls[1].args).toEqual(['id', 'p']);
  });
});

describe('SupabaseProgressRepo: failure', () => {
  it('reports a request that could not be made as a network failure', async () => {
    const { client } = fakeClient(() => {
      throw new TypeError('Network request failed');
    });
    const error = await new SupabaseProgressRepo(client).insertAttempts('p', [attempt(1)]).catch((e) => e);
    expect(error).toBeInstanceOf(RemoteError);
    expect(error.kind).toBe('network');
  });

  it('reports an error with no database code as a network failure', async () => {
    const { client } = fakeClient(() => ({ data: null, error: { message: 'FetchError: Failed to fetch' } }));
    const error = await new SupabaseProgressRepo(client).fetchState().catch((e) => e);
    expect(error.kind).toBe('network');
  });

  it('reports a refusal by the database as rejected, so the batch is searched rather than retried whole', async () => {
    for (const code of ['23514', '42501', '23503', '22P02']) {
      const { client } = fakeClient(() => ({ data: null, error: { message: 'no', code } }));
      const error = await new SupabaseProgressRepo(client).insertAttempts('p', [attempt(1)]).catch((e) => e);
      expect(error.kind, code).toBe('rejected');
      expect(error.code).toBe(code);
    }
  });

  it('treats a connection-class database error as transient, not as a refusal of the data', async () => {
    const { client } = fakeClient(() => ({ data: null, error: { message: 'connection failure', code: '08006' } }));
    const error = await new SupabaseProgressRepo(client).insertAttempts('p', [attempt(1)]).catch((e) => e);
    expect(error.kind).toBe('network');
  });
});
