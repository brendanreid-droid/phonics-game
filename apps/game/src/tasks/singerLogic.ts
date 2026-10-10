/**
 * Hear-then-confirm for Sound Singer, as plain functions.
 *
 * Sound Singer's buttons are identified only by the sound they make, so tapping
 * to hear one used to be tapping to answer it: a child who was unsure could not
 * compare the sounds, only guess. Now the first tap on a button plays its sound
 * and selects it; a second tap on the same selected button is the answer.
 * Listening is free and repeatable, and committing is a deliberate act.
 *
 * Kept free of React so the one rule that matters, which tap counts as the
 * answer, is tested directly.
 */

/**
 * How long after selecting a button a second tap on it is still read as an
 * accident. A five-year-old who double-taps to hear a sound again is not
 * choosing it, and committing to an answer by mistake is the thing this whole
 * design exists to avoid.
 */
export const CONFIRM_GUARD_MS = 400;

export interface SingerState {
  /** What this state belongs to (task id and hint tier). A different key starts clean. */
  key: string;
  /** The button currently selected, or null. */
  selected: string | null;
  /** When it was selected, in the same clock as `tapSpeaker`'s `at`. */
  selectedAt: number;
}

export function freshSinger(key: string): SingerState {
  return { key, selected: null, selectedAt: 0 };
}

export interface SingerTap {
  state: SingerState;
  /** The choice whose sound to play now, or null. */
  play: string | null;
  /** Set exactly when this tap is the child committing to an answer. */
  answer: string | null;
}

/**
 * Applies one tap. `available` is the set of buttons that can be tapped at all
 * (not dimmed); a tap on anything else changes nothing.
 */
export function tapSpeaker(
  state: SingerState,
  choice: string,
  at: number,
  available: readonly string[],
): SingerTap {
  const unchanged: SingerTap = { state, play: null, answer: null };
  if (!available.includes(choice)) return unchanged;

  if (state.selected === choice) {
    // The same button again: the answer, unless it is a bounce of the first tap.
    if (at - state.selectedAt < CONFIRM_GUARD_MS) return unchanged;
    return { state: { ...state, selected: null, selectedAt: 0 }, play: null, answer: choice };
  }

  return { state: { ...state, selected: choice, selectedAt: at }, play: choice, answer: null };
}

/** The selection to show: a button that has since been dimmed is not selected. */
export function visibleSelection(state: SingerState, available: readonly string[]): string | null {
  return state.selected !== null && available.includes(state.selected) ? state.selected : null;
}
