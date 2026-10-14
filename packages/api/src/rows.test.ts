import { describe, expect, it } from 'vitest';
import type { IdentifiedAttempt } from './ids';
import { attemptToRow, completionToRow, profileToRow, rowToAttempt, rowToCompletion, rowToProfile } from './rows';

const attempt = (over: Partial<IdentifiedAttempt> = {}): IdentifiedAttempt => ({
  id: '11111111-1111-4111-8111-111111111111',
  sessionId: 'kid-1',
  targetId: 's',
  skill: 'SOUND_ID',
  taskTypeId: 'sound-hunt',
  correct: false,
  scaffolded: false,
  latencyMs: 1234,
  weight: 0.5,
  choiceCount: 3,
  chosen: 'a',
  at: 1_790_000_000_123,
  ...over,
});

describe('attempt rows', () => {
  it('round-trips every field, so a pulled attempt rebuilds exactly like the one that was pushed', () => {
    const original = attempt();
    expect(rowToAttempt(attemptToRow('p', original))).toEqual(original);
  });

  it('round-trips an attempt with no choice count and no wrong pick, leaving them absent', () => {
    const original = attempt({ choiceCount: undefined, chosen: undefined, correct: true });
    delete (original as { choiceCount?: number }).choiceCount;
    delete (original as { chosen?: string }).chosen;
    const back = rowToAttempt(attemptToRow('p', original));
    expect(back).toEqual(original);
    expect('choiceCount' in back).toBe(false);
    expect('chosen' in back).toBe(false);
  });

  it('puts the attempt under the profile it is sent for', () => {
    expect(attemptToRow('profile-x', attempt()).profile_id).toBe('profile-x');
  });

  it('rounds latency to the whole number the column holds and never sends a negative', () => {
    expect(attemptToRow('p', attempt({ latencyMs: 1500.6 })).latency_ms).toBe(1501);
    expect(attemptToRow('p', attempt({ latencyMs: -40 })).latency_ms).toBe(0);
    expect(attemptToRow('p', attempt({ latencyMs: Number.NaN })).latency_ms).toBe(0);
  });

  it('sends a choice count the table would reject as absent instead, so one oddity cannot block the batch', () => {
    expect(attemptToRow('p', attempt({ choiceCount: 1 })).choice_count).toBeNull();
    expect(attemptToRow('p', attempt({ choiceCount: 0 })).choice_count).toBeNull();
    expect(attemptToRow('p', attempt({ choiceCount: 2.5 })).choice_count).toBeNull();
    expect(attemptToRow('p', attempt({ choiceCount: 2 })).choice_count).toBe(2);
  });

  it('reads a bigint timestamp that arrives as a string', () => {
    const row = { ...attemptToRow('p', attempt()), at: '1790000000123' as unknown as number };
    expect(rowToAttempt(row).at).toBe(1_790_000_000_123);
  });
});

describe('profile rows', () => {
  it('round-trips a profile', () => {
    const profile = { id: 'p', name: 'Ada', avatarId: 'fox', createdAt: 1_790_000_000_000, lastPlayedOn: '2026-10-14' };
    expect(rowToProfile(profileToRow('parent', profile))).toEqual(profile);
  });

  it('sets the owner on the row', () => {
    const profile = { id: 'p', name: 'Ada', avatarId: 'fox', createdAt: 1, lastPlayedOn: null };
    expect(profileToRow('parent-9', profile).parent_id).toBe('parent-9');
  });

  it('sends only the fields the schema holds, and nothing else about the child', () => {
    const profile = { id: 'p', name: 'Ada', avatarId: 'fox', createdAt: 1, lastPlayedOn: null };
    expect(Object.keys(profileToRow('parent', profile)).sort()).toEqual(
      ['avatar_id', 'created_at', 'id', 'last_played_on', 'name', 'parent_id'],
    );
  });
});

describe('completion rows', () => {
  it('round-trips', () => {
    const row = { profileId: 'p', level: 1, completedAt: 1_790_000_000_000 };
    expect(rowToCompletion(completionToRow(row))).toEqual(row);
  });
});
