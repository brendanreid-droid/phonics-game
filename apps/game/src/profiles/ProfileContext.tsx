import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AsyncStorageProgressRepo } from '../data/AsyncStorageProgressRepo';
import type { ProgressRepo } from '../data/ProgressRepo';
import { AsyncStorageProfileRepo } from './AsyncStorageProfileRepo';
import { deleteProfile } from './deleteProfile';
import type { Profile } from './Profile';
import type { CreateProfileArgs, ProfileRepo } from './ProfileRepo';

interface ProfileState {
  ready: boolean;
  profiles: Profile[];
  selected: Profile | null;
  /**
   * The one ProgressRepo for the whole app. Shared rather than constructed per
   * screen because its write queue is per instance: a quest and an island each
   * holding their own would not be serialised against each other, and neither
   * would a quest against a profile being deleted.
   */
  progress: ProgressRepo;
  refresh: () => Promise<void>;
  create: (args: Omit<CreateProfileArgs, 'now'>) => Promise<Profile>;
  /** Deletes the profile AND that child's progress. Rejects, leaving both in place, if the progress could not be cleared. */
  remove: (id: string) => Promise<void>;
  select: (id: string | null) => Promise<void>;
  /** Records a finished quest's day on the profile, and refreshes so the island sees it. */
  markPlayed: (id: string, date: string) => Promise<void>;
}

const ProfileCtx = createContext<ProfileState | null>(null);

export function ProfileProvider({
  children,
  repo,
  progress,
}: {
  children: ReactNode;
  repo?: ProfileRepo;
  progress?: ProgressRepo;
}) {
  const store = useMemo(() => repo ?? new AsyncStorageProfileRepo(), [repo]);
  const progressStore = useMemo(() => progress ?? new AsyncStorageProgressRepo(), [progress]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    const [list, chosen] = await Promise.all([store.list(), store.selectedId()]);
    setProfiles(list);
    // A selection pointing at a deleted profile is treated as nobody, rather
    // than dropping a child into a quest belonging to a profile that is gone.
    setSelectedId(list.some((p) => p.id === chosen) ? chosen : null);
    setReady(true);
  }, [store]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<ProfileState>(
    () => ({
      ready,
      profiles,
      selected: profiles.find((p) => p.id === selectedId) ?? null,
      progress: progressStore,
      refresh,
      create: async (args) => {
        const created = await store.create({ ...args, now: Date.now() });
        await refresh();
        return created;
      },
      remove: async (id) => {
        try {
          await deleteProfile(id, store, progressStore);
        } finally {
          // Whatever happened, show what is actually stored.
          await refresh();
        }
      },
      select: async (id) => {
        await store.select(id);
        await refresh();
      },
      markPlayed: async (id, date) => {
        await store.markPlayed(id, date);
        await refresh();
      },
    }),
    [ready, profiles, selectedId, refresh, store, progressStore],
  );

  return <ProfileCtx.Provider value={value}>{children}</ProfileCtx.Provider>;
}

export function useProfile(): ProfileState {
  const ctx = useContext(ProfileCtx);
  if (ctx === null) throw new Error('useProfile must be used inside a ProfileProvider');
  return ctx;
}
