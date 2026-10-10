import type { Profile } from './Profile';

export interface CreateProfileArgs {
  name: string;
  avatarId: string;
  /** Injected, never read from the clock — the repo stays testable. */
  now: number;
}

/**
 * Who is playing, and who is playing right now.
 *
 * Separate from ProgressRepo because the two have different lifetimes and
 * different owners: progress belongs to one child, this list belongs to the
 * household. Plan 3 swaps both for Supabase behind these same interfaces.
 */
export interface ProfileRepo {
  /**
   * Oldest first, so the row of faces a child learns never reorders itself.
   * The profiles returned are copies: editing them does not edit the store.
   */
  list(): Promise<Profile[]>;
  /**
   * Rejects, rather than failing quietly, if the profile could not be saved: a
   * profile that silently fails to persist leaves a child playing into a void.
   */
  create(args: CreateProfileArgs): Promise<Profile>;
  remove(id: string): Promise<void>;
  selectedId(): Promise<string | null>;
  select(id: string | null): Promise<void>;
  /** `date` is a local YYYY-MM-DD string. See src/progress/streaks.ts. */
  markPlayed(id: string, date: string): Promise<void>;
}
