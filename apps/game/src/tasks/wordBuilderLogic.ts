/**
 * The assembly rules for Word Builder, as plain functions.
 *
 * This file decides whether a child's spelling is passed to the runner as the
 * word they built, so it is the code that can tell a child they are wrong when
 * they are right. It is kept free of React for that reason: every rule here is
 * tested directly, against the real tasks the engine produces.
 *
 * Tiles are identified by their position in the task's `choices`, never by
 * their letter. `pip` needs two `p` tiles, and two tiles that look the same are
 * still two tiles: placing one must leave the other available.
 */

export interface BuilderTile {
  /** Index in the task's choices. Unique even when two tiles show the same letter. */
  id: number;
  letter: string;
}

export interface BuilderState {
  /**
   * What this state belongs to (task id and hint tier). When the key changes the
   * state is discarded, which both starts a new task clean and clears a wrong
   * attempt so the child can try again.
   */
  key: string;
  /** For each slot, the id of the tile in it, or null. */
  slots: (number | null)[];
  /** True once the last slot has been filled and the answer sent. Input is then ignored. */
  submitted: boolean;
}

export function tilesFrom(choices: readonly string[]): BuilderTile[] {
  return choices.map((letter, id) => ({ id, letter }));
}

export function freshBuilder(key: string, slotCount: number): BuilderState {
  return { key, slots: Array<number | null>(slotCount).fill(null), submitted: false };
}

/** The word as currently assembled, one letter per filled slot. */
export function assemble(slots: readonly (number | null)[], tiles: readonly BuilderTile[]): string {
  return slots.map((id) => (id === null ? '' : (tiles[id]?.letter ?? ''))).join('');
}

export interface PlaceResult {
  state: BuilderState;
  /** The finished word, set exactly once: on the tap that fills the last slot. */
  answer: string | null;
}

/**
 * Puts a tile in the first empty slot. Does nothing if input is locked, the
 * tile is unknown or already placed, or there is no room.
 */
export function placeTile(state: BuilderState, tileId: number, tiles: readonly BuilderTile[]): PlaceResult {
  const unchanged = { state, answer: null };
  if (state.submitted) return unchanged;
  if (!tiles.some((tile) => tile.id === tileId)) return unchanged;
  if (state.slots.includes(tileId)) return unchanged;

  const target = state.slots.indexOf(null);
  if (target === -1) return unchanged;

  const slots = [...state.slots];
  slots[target] = tileId;

  if (slots.includes(null)) return { state: { ...state, slots }, answer: null };
  return { state: { ...state, slots, submitted: true }, answer: assemble(slots, tiles) };
}

/** Sends a tile back to the tray. Does nothing once the answer has been sent. */
export function takeBack(state: BuilderState, slotIndex: number): BuilderState {
  if (state.submitted) return state;
  if (state.slots[slotIndex] === null || state.slots[slotIndex] === undefined) return state;
  const slots = [...state.slots];
  slots[slotIndex] = null;
  return { ...state, slots };
}

/**
 * Whether a tile should be shown dimmed (and so be untappable).
 *
 * A placed tile is dimmed: it is in a slot, not in the tray. The runner's
 * `dimmed` list is honoured only for letters the word does not need. Dimming a
 * letter the word requires would make it impossible to finish.
 */
export function isTileDimmed(args: {
  tile: BuilderTile;
  state: BuilderState;
  dimmedLetters: readonly string[];
  wordGraphemes: readonly string[];
}): boolean {
  const { tile, state, dimmedLetters, wordGraphemes } = args;
  if (state.slots.includes(tile.id)) return true;
  return dimmedLetters.includes(tile.letter) && !wordGraphemes.includes(tile.letter);
}
