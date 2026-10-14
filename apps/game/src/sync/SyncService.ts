import { DEFAULT_CONFIG } from '@soundlings/engine';
import type { EngineConfig } from '@soundlings/engine';
import type { AuthUser, RemoteStore } from '@soundlings/api';
import type { SyncingProgressRepo } from '../data/SyncingProgressRepo';
import type { ProfileRepo } from '../profiles/ProfileRepo';
import type { SyncStateStore } from './SyncStateStore';
import { runSync } from './runSync';
import type { SyncReport } from './runSync';

/** Why a sync is being asked for. Only some of these may run while a quest is on screen. */
export type SyncReason = 'sign-in' | 'foreground' | 'quest-finished' | 'manual' | 'retry';

export type SyncStatus =
  /** No project is configured. The game is entirely local, which is a supported state. */
  | { kind: 'unavailable' }
  | { kind: 'signed-out' }
  | {
      kind: 'signed-in';
      email: string | null;
      syncing: boolean;
      lastSyncedAt: number | null;
      /** The last pass could not finish. Shown to a grown-up, in the parent area, and nowhere else. */
      lastPassIncomplete: boolean;
    };

export interface SyncServiceDeps {
  profiles: ProfileRepo;
  progress: SyncingProgressRepo;
  store: SyncStateStore;
  /** Null when no project is configured. */
  remoteFor: ((userId: string) => RemoteStore) | null;
  now: () => number;
  config?: EngineConfig;
  /** Runs `fn` after `ms` and returns a way to cancel it. Injected so tests control time. */
  schedule?: (fn: () => void, ms: number) => () => void;
}

const defaultSchedule = (fn: () => void, ms: number): (() => void) => {
  const handle = setTimeout(fn, ms);
  return () => clearTimeout(handle);
};

/** After a quest, give the results screen a moment to appear before any work starts. */
const AFTER_QUEST_MS = 1500;
/** Retry delays after a failed pass: a dropped connection usually comes back, but not instantly. */
const RETRY_MS = [30_000, 120_000, 600_000];

/**
 * Decides WHEN to sync. runSync decides what.
 *
 * Syncs happen at three moments: signing in, the app coming to the foreground,
 * and a quest finishing. Never mid-quest: a child tapping through tasks makes no
 * network traffic at all, and a request that arrives while a quest is on screen
 * is held until it ends.
 *
 * Nothing here can throw into the game. `request` returns immediately and does
 * its work later; every failure is caught and becomes a status for the parent
 * area to show.
 */
export class SyncService {
  private user: AuthUser | null = null;
  private status: SyncStatus;
  private readonly listeners = new Set<() => void>();
  private readonly schedule: (fn: () => void, ms: number) => () => void;
  private readonly config: EngineConfig;

  private running = false;
  private again = false;
  private cancelPending: (() => void) | null = null;
  private cancelRetry: (() => void) | null = null;
  private failures = 0;
  /** Something asked to sync mid-quest. */
  private heldForQuest = false;
  private deferredDerived: string[] = [];
  private lastSyncedAt: number | null = null;
  private lastPassIncomplete = false;

  /** Called when a sync changed what is on this device, so the app can refresh what it shows. */
  onLocalChange: (() => void) | null = null;

  constructor(private readonly deps: SyncServiceDeps) {
    this.schedule = deps.schedule ?? defaultSchedule;
    this.config = deps.config ?? DEFAULT_CONFIG;
    this.status = deps.remoteFor === null ? { kind: 'unavailable' } : { kind: 'signed-out' };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getStatus = (): SyncStatus => this.status;

  /** Called when the signed-in parent changes, including once at launch if a session was remembered. */
  setUser(user: AuthUser | null): void {
    if (this.deps.remoteFor === null) return;
    const changed = this.user?.id !== user?.id;
    this.user = user;
    if (changed) {
      this.failures = 0;
      this.deferredDerived = [];
      this.lastSyncedAt = null;
      this.lastPassIncomplete = false;
      this.cancelRetry?.();
      this.cancelRetry = null;
    }
    this.publish();
    if (user !== null && changed) this.request('sign-in');
  }

  /** The SyncingProgressRepo calls this when a quest finishes. */
  questFinished = (): void => {
    this.request('quest-finished');
  };

  /** Fire and forget. Safe to call from anywhere, at any time. */
  request(reason: SyncReason): void {
    try {
      if (this.user === null || this.deps.remoteFor === null) return;
      const urgent = reason === 'sign-in' || reason === 'manual';
      if (!urgent && this.deps.progress.isQuestInProgress()) {
        this.heldForQuest = true;
        return;
      }
      if (this.running) {
        this.again = true;
        return;
      }
      if (this.cancelPending !== null) return;
      const delay = reason === 'quest-finished' ? AFTER_QUEST_MS : 0;
      this.cancelPending = this.schedule(() => {
        this.cancelPending = null;
        void this.run();
      }, delay);
    } catch {
      // Asking for a sync must never disturb whoever asked.
    }
  }

  /** Resolves when the current pass, if any, is over. For tests and for "Sync now". */
  async syncNow(): Promise<SyncReport | null> {
    if (this.user === null || this.deps.remoteFor === null) return null;
    this.cancelPending?.();
    this.cancelPending = null;
    return this.run();
  }

  private async run(): Promise<SyncReport | null> {
    const user = this.user;
    const remoteFor = this.deps.remoteFor;
    if (user === null || remoteFor === null) return null;
    if (this.running) {
      this.again = true;
      return null;
    }
    this.running = true;
    this.heldForQuest = false;
    this.publish();

    let report: SyncReport | null = null;
    try {
      report = await runSync(
        {
          userId: user.id,
          remote: remoteFor(user.id),
          profiles: this.deps.profiles,
          progress: this.deps.progress.local,
          store: this.deps.store,
          config: this.config,
          questInProgress: () => this.deps.progress.isQuestInProgress(),
        },
        { deferredDerived: this.deferredDerived },
      );
      this.deferredDerived = report.deferredDerived;
      this.lastPassIncomplete = !report.ok;
      if (report.ok) this.lastSyncedAt = this.deps.now();
      if (report.profilesChanged) this.notifyChange();
    } catch {
      // runSync is built not to throw. If it does, treat it as an incomplete pass.
      this.lastPassIncomplete = true;
    } finally {
      this.running = false;
    }

    this.afterPass(report);
    this.publish();
    return report;
  }

  private afterPass(report: SyncReport | null): void {
    const incomplete = report === null || !report.ok;
    if (incomplete) {
      this.failures += 1;
      this.scheduleRetry();
    } else {
      this.failures = 0;
      this.cancelRetry?.();
      this.cancelRetry = null;
    }
    // Derived state was held back for a quest that has since ended. Only when the
    // pass was otherwise fine: a rebuild that FAILED is retried on the backoff,
    // not straight away, or a rebuild that always fails would spin.
    if (report?.ok && this.deferredDerived.length > 0 && !this.deps.progress.isQuestInProgress()) this.again = true;
    if (this.again) {
      this.again = false;
      this.request('retry');
    }
  }

  private scheduleRetry(): void {
    this.cancelRetry?.();
    const delay = RETRY_MS[Math.min(this.failures - 1, RETRY_MS.length - 1)];
    this.cancelRetry = this.schedule(() => {
      this.cancelRetry = null;
      this.request('retry');
    }, delay);
  }

  private notifyChange(): void {
    try {
      this.onLocalChange?.();
    } catch {
      // A refresh that fails is not a sync that failed.
    }
  }

  private publish(): void {
    if (this.deps.remoteFor === null) return;
    this.status =
      this.user === null
        ? { kind: 'signed-out' }
        : {
            kind: 'signed-in',
            email: this.user.email,
            syncing: this.running,
            lastSyncedAt: this.lastSyncedAt,
            lastPassIncomplete: this.lastPassIncomplete,
          };
    for (const listener of [...this.listeners]) listener();
  }
}
