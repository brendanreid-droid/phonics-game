/**
 * The grown-up gate: hold a button down for two seconds.
 *
 * A hold rather than a PIN because the PIN belongs to the parent area in
 * Plan 3, and two different gates would be worse than one. Two seconds is
 * beyond an idle five-year-old's patience and trivial for an adult who means
 * it. It guards creating and deleting profiles; choosing one is never gated.
 *
 * TODO(Plan 3): a hold cannot be completed from a keyboard or a screen reader,
 * and a grown-up gate is exactly where an adult using assistive technology
 * will hit that. Not fixed here on purpose: the parent area introduces a PIN,
 * and the right fix is one accessible gate rather than two inaccessible ones.
 */
export const HOLD_MS = 2000;

export interface Hold {
  /** The finger or pointer went down. Starts the clock. */
  start(): void;
  /** It came up, or slid off. Stops the clock; nothing is confirmed. */
  cancel(): void;
  /** True while the clock is running. */
  readonly holding: boolean;
}

/**
 * A hold-to-confirm, with no UI in it so the timing can be tested.
 *
 * `onConfirm` fires at most once per hold, and only if the press lasted the
 * full duration without being released.
 */
export function createHold(onConfirm: () => void, durationMs: number = HOLD_MS): Hold {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    start() {
      if (timer !== null) return; // a second pointer-down must not restart or double up
      timer = setTimeout(() => {
        timer = null;
        onConfirm();
      }, durationMs);
    },
    cancel() {
      if (timer === null) return;
      clearTimeout(timer);
      timer = null;
    },
    get holding() {
      return timer !== null;
    },
  };
}
