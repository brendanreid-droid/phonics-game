/**
 * The creature palette, as data.
 *
 * Kept apart from `creatures.tsx` because that file imports react-native-svg,
 * which cannot be loaded in a plain node test environment — and the one thing
 * most worth testing here (that every creature has a drawing, and that no two
 * share a colour) is a fact about this data, not about the drawing.
 */

/**
 * The seven creatures that exist. Narrower than the curriculum's
 * `Creature.id`, which is a plain string, so that a creature added without a
 * drawing is a compile error rather than a blank square on a child's island.
 */
export type CreatureId = 'sisi' | 'annie' | 'tito' | 'popo' | 'indi' | 'momo' | 'fifi';

/**
 * One dominant hue each, chosen so that two creatures side by side are never
 * confused. Distinguishability first, prettiness second: these are identified
 * at 40–56pt by a five-year-old.
 *
 * The family is Soft Paper — muted, warm, paper-like — with one deliberate
 * exception. **Fifi is blue.** A warm fish would have collided with Popo's pink
 * and Annie's red, and at this size a shared hue is a shared identity.
 */
export const CREATURE_COLOURS: Record<CreatureId, string> = {
  sisi: '#93c3a0',
  annie: '#d9705e',
  tito: '#b8906a',
  popo: '#e8a8b0',
  indi: '#c3cf7a',
  momo: '#ecd08a',
  fifi: '#8fb8d4',
};
