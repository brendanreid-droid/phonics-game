import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOLD_MS, createHold } from './holdGate';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('the grown-up hold', () => {
  it('is two seconds: beyond an idle five-year-old, trivial for an adult', () => {
    expect(HOLD_MS).toBe(2000);
  });

  it('does not confirm on a tap, however short', () => {
    const onConfirm = vi.fn();
    const hold = createHold(onConfirm);
    hold.start();
    vi.advanceTimersByTime(100);
    hold.cancel();
    vi.advanceTimersByTime(10_000);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('does not confirm when released a moment before the end', () => {
    const onConfirm = vi.fn();
    const hold = createHold(onConfirm);
    hold.start();
    vi.advanceTimersByTime(HOLD_MS - 1);
    expect(onConfirm).not.toHaveBeenCalled();
    hold.cancel();
    vi.advanceTimersByTime(10_000);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('confirms once the full two seconds have passed', () => {
    const onConfirm = vi.fn();
    const hold = createHold(onConfirm);
    hold.start();
    vi.advanceTimersByTime(HOLD_MS - 1);
    expect(onConfirm).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('confirms only once per hold, even if held on', () => {
    const onConfirm = vi.fn();
    const hold = createHold(onConfirm);
    hold.start();
    vi.advanceTimersByTime(HOLD_MS * 5);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('is not extended or doubled by a second press-down while already holding', () => {
    const onConfirm = vi.fn();
    const hold = createHold(onConfirm);
    hold.start();
    vi.advanceTimersByTime(1500);
    hold.start();
    vi.advanceTimersByTime(500);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('starts the clock afresh after a release: earlier holding does not count', () => {
    const onConfirm = vi.fn();
    const hold = createHold(onConfirm);
    hold.start();
    vi.advanceTimersByTime(1500);
    hold.cancel();
    hold.start();
    vi.advanceTimersByTime(1500);
    expect(onConfirm).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('can be held again after confirming', () => {
    const onConfirm = vi.fn();
    const hold = createHold(onConfirm);
    hold.start();
    vi.advanceTimersByTime(HOLD_MS);
    hold.start();
    vi.advanceTimersByTime(HOLD_MS);
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });

  it('reports whether it is currently holding', () => {
    const hold = createHold(() => {});
    expect(hold.holding).toBe(false);
    hold.start();
    expect(hold.holding).toBe(true);
    hold.cancel();
    expect(hold.holding).toBe(false);
    hold.start();
    vi.advanceTimersByTime(HOLD_MS);
    expect(hold.holding).toBe(false);
  });

  it('ignores cancel when nothing is held', () => {
    const hold = createHold(vi.fn());
    expect(() => hold.cancel()).not.toThrow();
  });
});
