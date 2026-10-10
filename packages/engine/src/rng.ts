/** Returns a float in [0, 1). */
export type Rng = () => number;

/**
 * mulberry32. Chosen over Math.random because every task instance must be
 * reproducible from a seed: that makes a parent's bug report replayable and
 * lets the simulation harness run deterministically in CI.
 *
 * The seed is coerced with `>>> 0`, so any number is accepted and silently
 * reduced to an unsigned 32-bit integer: floats are truncated (1.9 -> 1) and
 * negatives wrap (-1 -> 4294967295). Two seeds that coerce alike give the same
 * stream.
 */
export function makeRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates on a copy. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const a = result[i];
    const b = result[j];
    result[i] = b;
    result[j] = a;
  }
  return result;
}

/** A seed derived from a string, so session ids can seed task generation. */
export function seedFromString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * A child seed for the `index`th item drawn from `seed`. Use this rather than
 * `seed + index`: with addition, (seed 5, item 1) and (seed 6, item 0) collide,
 * so neighbouring sessions would replay each other's tasks. This mixes both
 * inputs through a 32-bit avalanche (the murmur3 finalizer), and is a bijection
 * in `seed` for a fixed `index`.
 */
export function deriveSeed(seed: number, index: number): number {
  let h = (seed >>> 0) ^ Math.imul((index >>> 0) + 1, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
