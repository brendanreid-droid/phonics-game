import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HINT_TIMING, IDLE_SCHEDULE, mergeTiers, nextIdleTier, startIdleLadder } from './useHintLadder';
import type { HintTier } from './useHintLadder';

describe('hint ladder timing', () => {
  it('shows nothing before the first threshold', () => {
    expect(nextIdleTier(0)).toBe(0);
    expect(nextIdleTier(HINT_TIMING.tier1Ms - 1)).toBe(0);
  });

  it('nudges at four seconds of silence', () => {
    expect(nextIdleTier(HINT_TIMING.tier1Ms)).toBe(1);
  });

  it('plays the mnemonic and narrows the choices at nine seconds', () => {
    expect(nextIdleTier(HINT_TIMING.tier2Ms)).toBe(2);
  });

  it('never reaches tier 3 from idling alone — only from errors', () => {
    // Showing the answer because a child paused would rob them of a win they
    // were about to earn. Tier 3 is reserved for demonstrated difficulty.
    expect(nextIdleTier(60_000)).toBe(2);
    expect(nextIdleTier(Number.MAX_SAFE_INTEGER)).toBe(2);
  });

  it('uses thresholds a five-year-old can actually sit through', () => {
    expect(HINT_TIMING.tier1Ms).toBeGreaterThanOrEqual(3000);
    expect(HINT_TIMING.tier1Ms).toBeLessThanOrEqual(6000);
    expect(HINT_TIMING.tier2Ms).toBeGreaterThan(HINT_TIMING.tier1Ms);
  });
});

describe('idle ladder, as the timers actually fire', () => {
  // nextIdleTier above is only a description of the schedule. These tests drive
  // the real timers the hook uses, so a stray third timer cannot hide behind a
  // pure function that still says 2.
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('emits tier 1 then tier 2 at the configured moments, and nothing else', () => {
    const seen: HintTier[] = [];
    startIdleLadder((tier) => seen.push(tier));

    vi.advanceTimersByTime(HINT_TIMING.tier1Ms - 1);
    expect(seen).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual([1]);
    vi.advanceTimersByTime(HINT_TIMING.tier2Ms - HINT_TIMING.tier1Ms);
    expect(seen).toEqual([1, 2]);
  });

  it('is still at tier 2 after a child has been idle for ten minutes', () => {
    // The regression this exists to catch: somebody adds a third timer so a
    // long pause "helpfully" reveals the answer.
    const seen: HintTier[] = [];
    startIdleLadder((tier) => seen.push(tier));

    vi.advanceTimersByTime(10 * 60 * 1000);

    expect(Math.max(...seen)).toBe(2);
    expect(seen).not.toContain(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('can only ever schedule tiers 1 and 2', () => {
    expect(IDLE_SCHEDULE.map((step) => step.tier)).toEqual([1, 2]);
    expect(Math.max(...IDLE_SCHEDULE.map((step) => step.tier))).toBeLessThan(3);
  });

  it('stops cleanly when cancelled, so a finished task cannot raise a hint on the next one', () => {
    const seen: HintTier[] = [];
    const cancel = startIdleLadder((tier) => seen.push(tier));
    vi.advanceTimersByTime(HINT_TIMING.tier1Ms);
    cancel();
    vi.advanceTimersByTime(60_000);
    expect(seen).toEqual([1]);
  });
});

describe('merging hint tiers', () => {
  it('takes the highest of idle, error-driven and owl-requested tiers', () => {
    expect(mergeTiers(1, 0, 0)).toBe(1);
    expect(mergeTiers(0, 3, 0)).toBe(3);
    expect(mergeTiers(2, 0, 2)).toBe(2);
    expect(mergeTiers(0, 0, 0)).toBe(0);
    // The owl button jumps straight to tier 2 whatever idling and errors say.
    expect(mergeTiers(0, 0, 2)).toBe(2);
    expect(mergeTiers(1, 0, 2)).toBe(2);
  });

  it('lets errors reach tier 3 even though idling cannot', () => {
    expect(mergeTiers(2, 3, 0)).toBe(3);
  });
});
