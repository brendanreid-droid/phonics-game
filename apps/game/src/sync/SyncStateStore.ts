import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SyncBaseline } from '@soundlings/api';

/**
 * Where the sync remembers what both ends are known to hold (the baseline).
 *
 * Losing it is safe: with no baseline every profile reads as new, so the worst
 * outcome is some profiles being pushed or pulled again, which is harmless
 * because both are idempotent. Never the reverse, a profile being removed.
 */
export interface SyncStateStore {
  load(): Promise<SyncBaseline | null>;
  save(baseline: SyncBaseline): Promise<void>;
}

const KEY = 'soundlings/sync/baseline';

function isBaseline(value: unknown): value is SyncBaseline {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.userId !== null && typeof v.userId !== 'string') return false;
  if (typeof v.profiles !== 'object' || v.profiles === null || Array.isArray(v.profiles)) return false;
  return Object.values(v.profiles).every((ids) => Array.isArray(ids) && ids.every((id) => typeof id === 'string'));
}

export class AsyncStorageSyncStateStore implements SyncStateStore {
  async load(): Promise<SyncBaseline | null> {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (raw === null) return null;
      const parsed: unknown = JSON.parse(raw);
      return isBaseline(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  async save(baseline: SyncBaseline): Promise<void> {
    await AsyncStorage.setItem(KEY, JSON.stringify(baseline));
  }
}

export class MemorySyncStateStore implements SyncStateStore {
  private value: SyncBaseline | null = null;
  async load(): Promise<SyncBaseline | null> {
    return this.value === null ? null : (JSON.parse(JSON.stringify(this.value)) as SyncBaseline);
  }
  async save(baseline: SyncBaseline): Promise<void> {
    this.value = JSON.parse(JSON.stringify(baseline)) as SyncBaseline;
  }
}
