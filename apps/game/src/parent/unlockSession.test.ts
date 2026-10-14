import { afterEach, describe, expect, it } from 'vitest';
import { isRecentlyUnlocked, lockAgain, markUnlocked } from './unlockSession';

afterEach(lockAgain);

describe('unlockSession', () => {
  it('starts locked', () => {
    expect(isRecentlyUnlocked(1000)).toBe(false);
  });

  it('is unlocked just after the PIN, and locked again after five minutes', () => {
    markUnlocked(1000);
    expect(isRecentlyUnlocked(1000 + 4 * 60 * 1000)).toBe(true);
    expect(isRecentlyUnlocked(1000 + 5 * 60 * 1000)).toBe(false);
  });

  it('can be locked at once', () => {
    markUnlocked(1000);
    lockAgain();
    expect(isRecentlyUnlocked(1001)).toBe(false);
  });

  it('does not trust a clock that has gone backwards', () => {
    markUnlocked(10_000);
    expect(isRecentlyUnlocked(5_000)).toBe(false);
  });
});
