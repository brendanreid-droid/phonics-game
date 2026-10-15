/**
 * Sound It Out, as plain functions.
 *
 * This is the only game in the product where blending is the mechanic rather
 * than a strategy the child might happen to use. Picture Match and Word Pick
 * are matching games that a child can win on vocabulary or on a first letter;
 * sounding out existed only as a tier-2 hint, so a child who never struggled
 * was never once shown the skill the whole method rests on.
 *
 * Here the child taps each letter in turn, left to right, and hears its sound.
 * Out of order does nothing — gently, with no error and no penalty, because the
 * order IS the lesson. Only once every letter has been sounded can they push
 * them together and choose what the word says.
 *
 * Kept free of React so the rules that matter are tested directly.
 */

/** Reuses Sound Singer's guard: a double-tap is a child listening, not choosing. */
export const CONFIRM_GUARD_MS = 400;

export interface SoundItOutState {
  /** What this state belongs to (task id and hint tier). A different key starts clean. */
  key: string;
  /** How many letters have been sounded, left to right. */
  sounded: number;
  /** True once the child has pushed the letters together. */
  blended: boolean;
  /** The candidate word currently selected, or null. */
  selected: string | null;
  selectedAt: number;
}

export function freshSoundItOut(key: string): SoundItOutState {
  return { key, sounded: 0, blended: false, selected: null, selectedAt: 0 };
}

export interface LetterTap {
  state: SoundItOutState;
  /** The grapheme whose sound to play now, or null. */
  play: string | null;
}

/**
 * Taps the letter at `index`.
 *
 * The next letter in sequence advances and sounds. A letter already sounded
 * sounds again without advancing, because a child comparing /s/ and /a/ is
 * doing exactly what they are meant to. Anything further ahead does nothing:
 * no sound, no advance, no complaint.
 */
export function tapLetter(
  state: SoundItOutState,
  index: number,
  graphemes: readonly string[],
): LetterTap {
  if (index < 0 || index >= graphemes.length) return { state, play: null };
  if (index < state.sounded) return { state, play: graphemes[index] };
  if (index > state.sounded) return { state, play: null };
  return { state: { ...state, sounded: state.sounded + 1 }, play: graphemes[index] };
}

/** Whether the push-together control is available yet. */
export function canPushTogether(state: SoundItOutState, graphemes: readonly string[]): boolean {
  return !state.blended && state.sounded >= graphemes.length;
}

/**
 * Pushes the letters together.
 *
 * Plays nothing. The whole word is not spoken here, and that is the difference
 * between this game and a listening game: saying "sat" at the moment the
 * letters join would do the blending for the child and leave them matching a
 * sound they were handed.
 */
export function pushTogether(state: SoundItOutState, graphemes: readonly string[]): SoundItOutState {
  if (!canPushTogether(state, graphemes)) return state;
  return { ...state, blended: true };
}

export interface CandidateTap {
  state: SoundItOutState;
  /** The candidate word to speak now, or null. */
  play: string | null;
  /** Set exactly when this tap is the child committing to an answer. */
  answer: string | null;
}

/**
 * Taps a candidate word.
 *
 * Hear then confirm, as Sound Singer does: the candidates are told apart only
 * by sound, so a tap that both played and answered would force a child who
 * wants to compare them to guess instead.
 *
 * Candidates do nothing until the letters have been pushed together. Offering
 * them earlier would let a child skip straight to listening, which is the one
 * route around the thing being taught.
 */
export function tapCandidate(
  state: SoundItOutState,
  choice: string,
  at: number,
  available: readonly string[],
): CandidateTap {
  const unchanged: CandidateTap = { state, play: null, answer: null };
  if (!state.blended) return unchanged;
  if (!available.includes(choice)) return unchanged;

  if (state.selected === choice) {
    if (at - state.selectedAt < CONFIRM_GUARD_MS) return unchanged;
    return { state: { ...state, selected: null, selectedAt: 0 }, play: null, answer: choice };
  }
  return { state: { ...state, selected: choice, selectedAt: at }, play: choice, answer: null };
}

/** The selection to show: a candidate that has since been dimmed is not selected. */
export function visibleSelection(state: SoundItOutState, available: readonly string[]): string | null {
  return state.selected !== null && available.includes(state.selected) ? state.selected : null;
}
