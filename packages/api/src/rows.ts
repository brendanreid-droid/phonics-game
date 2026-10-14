import type { Attempt } from '@soundlings/engine';
import type { IdentifiedAttempt } from './ids';
import type { CompletionRow, SyncedProfile } from './syncQueue';

/**
 * The shape of each synced table as the server returns and accepts it, and the
 * conversions to and from the app's own types. Kept apart from the network code
 * so the conversions, where a silent mismatch would corrupt a child's record,
 * can be tested without a network.
 */

export interface ProfileRow {
  id: string;
  parent_id: string;
  name: string;
  avatar_id: string;
  created_at: string;
  last_played_on: string | null;
}

export interface AttemptRow {
  id: string;
  profile_id: string;
  session_id: string;
  target_id: string;
  skill: string;
  task_type_id: string;
  correct: boolean;
  scaffolded: boolean;
  latency_ms: number;
  weight: number;
  choice_count: number | null;
  chosen: string | null;
  at: number;
}

export interface CompletionDbRow {
  profile_id: string;
  level: number;
  completed_at: number;
}

export function profileToRow(parentId: string, profile: SyncedProfile): Omit<ProfileRow, never> {
  return {
    id: profile.id,
    parent_id: parentId,
    name: profile.name,
    avatar_id: profile.avatarId,
    created_at: new Date(profile.createdAt).toISOString(),
    last_played_on: profile.lastPlayedOn,
  };
}

export function rowToProfile(row: ProfileRow): SyncedProfile {
  return {
    id: row.id,
    name: row.name,
    avatarId: row.avatar_id,
    createdAt: Date.parse(row.created_at),
    lastPlayedOn: row.last_played_on,
  };
}

/**
 * An attempt as the server will accept it.
 *
 * The table has CHECK constraints (latency not negative, a choice count of at
 * least two) and an integer column, and one row that breaks any of them makes
 * the server refuse the whole batch it travels in. A child's log must not be
 * held up by one odd value, so values are brought into range here rather than
 * discovered at upload time. Nothing is invented: a count that is not a real
 * number of choices is sent as absent, as logs from before it existed already
 * are.
 */
export function attemptToRow(profileId: string, attempt: IdentifiedAttempt): AttemptRow {
  const choiceCount =
    attempt.choiceCount !== undefined && Number.isInteger(attempt.choiceCount) && attempt.choiceCount >= 2
      ? attempt.choiceCount
      : null;
  return {
    id: attempt.id,
    profile_id: profileId,
    session_id: attempt.sessionId,
    target_id: attempt.targetId,
    skill: attempt.skill,
    task_type_id: attempt.taskTypeId,
    correct: attempt.correct,
    scaffolded: attempt.scaffolded,
    latency_ms: Number.isFinite(attempt.latencyMs) ? Math.max(0, Math.round(attempt.latencyMs)) : 0,
    weight: attempt.weight,
    choice_count: choiceCount,
    chosen: attempt.chosen ?? null,
    at: Math.round(attempt.at),
  };
}

export function rowToAttempt(row: AttemptRow): IdentifiedAttempt {
  const attempt: IdentifiedAttempt = {
    id: row.id,
    sessionId: row.session_id,
    targetId: row.target_id,
    skill: row.skill as Attempt['skill'],
    taskTypeId: row.task_type_id,
    correct: row.correct,
    scaffolded: row.scaffolded,
    latencyMs: row.latency_ms,
    weight: row.weight,
    at: Number(row.at),
  };
  // Absent stays absent: the engine treats `undefined` and "not recorded" alike.
  if (row.choice_count !== null) attempt.choiceCount = row.choice_count;
  if (row.chosen !== null) attempt.chosen = row.chosen;
  return attempt;
}

export function completionToRow(row: CompletionRow): CompletionDbRow {
  return { profile_id: row.profileId, level: row.level, completed_at: Math.round(row.completedAt) };
}

export function rowToCompletion(row: CompletionDbRow): CompletionRow {
  return { profileId: row.profile_id, level: row.level, completedAt: Number(row.completed_at) };
}
