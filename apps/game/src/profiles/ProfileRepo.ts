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
  /**
   * Adds a profile made on another device, under the id it already has. For sync
   * only. Idempotent: a profile with that id is left exactly as it is.
   *
   * Skips the name rule that `create` enforces. Two devices that both made an
   * "Ada" while offline each hold a real child's history, and refusing one would
   * mean losing it; two Adas in the picker is the lesser harm and a grown-up can
   * fix it. Rejects, rather than failing quietly, if it could not be saved.
   */
  adopt(profile: Profile): Promise<void>;
  remove(id: string): Promise<void>;
  selectedId(): Promise<string | null>;
  select(id: string | null): Promise<void>;
  /** `date` is a local YYYY-MM-DD string. See src/progress/streaks.ts. */
  markPlayed(id: string, date: string): Promise<void>;
}
