/**
 * Remembers, for a few minutes and in memory only, that the grown-up has just
 * entered the PIN, so a screen reached from the grown-ups' pages does not ask
 * for it again straight away. Never persisted: closing the app locks it.
 */
const WINDOW_MS = 5 * 60 * 1000;

let unlockedAt: number | null = null;

export function markUnlocked(now: number = Date.now()): void {
  unlockedAt = now;
}

export function isRecentlyUnlocked(now: number = Date.now()): boolean {
  return unlockedAt !== null && now - unlockedAt < WINDOW_MS && now >= unlockedAt;
}

export function lockAgain(): void {
  unlockedAt = null;
}
