import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { SupabaseProgressRepo, createSupabase } from '@soundlings/api';
import type { SupabaseClient } from '@soundlings/api';
import { AsyncStorageProgressRepo } from '../data/AsyncStorageProgressRepo';
import { SyncingProgressRepo } from '../data/SyncingProgressRepo';
import { AsyncStorageProfileRepo } from '../profiles/AsyncStorageProfileRepo';
import type { ProfileRepo } from '../profiles/ProfileRepo';
import { AsyncStorageSyncStateStore } from './SyncStateStore';
import { SyncService } from './SyncService';

export interface SyncRuntime {
  /** The one ProgressRepo for the whole app: local storage, plus an id on each new attempt. */
  progress: SyncingProgressRepo;
  profiles: ProfileRepo;
  service: SyncService;
  /** Null when no project is configured, which is a fully supported state. */
  client: SupabaseClient | null;
}

/**
 * Builds the local stores and the sync around them.
 *
 * The two environment variables are read with their full names, because Expo
 * replaces `process.env.EXPO_PUBLIC_*` at build time by matching that exact
 * text; a computed lookup would find nothing in a bundle. Without them there is
 * no client, the service reports itself unavailable, and the game runs as it
 * always has.
 */
export function createSyncRuntime(): SyncRuntime {
  const client = createSupabase(
    {
      url: process.env.EXPO_PUBLIC_SUPABASE_URL,
      anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    },
    {
      storage: AsyncStorage,
      // On the web the emailed link lands back on this page; on a device the
      // app is opened by a deep link and hands it over itself.
      detectSessionInUrl: Platform.OS === 'web',
    },
  );

  const profiles = new AsyncStorageProfileRepo();
  const local = new AsyncStorageProgressRepo();

  let service: SyncService | null = null;
  const progress = new SyncingProgressRepo(local, { questFinished: () => service?.questFinished() });
  service = new SyncService({
    profiles,
    progress,
    store: new AsyncStorageSyncStateStore(),
    remoteFor: client === null ? null : () => new SupabaseProgressRepo(client),
    now: () => Date.now(),
  });

  return { progress, profiles, service, client };
}
