import { CREATURE_LIST, GRAPHEME_LIST } from '@soundlings/curriculum';
import type { Creature } from '@soundlings/curriculum';

export interface CollectionEntry {
  creature: Creature;
  hatched: boolean;
}

/**
 * The island's creature collection: every creature in teaching order, each
 * either hatched or still an egg.
 *
 * Shows unhatched creatures rather than hiding them, because the gaps are the
 * progress map — a child can see there are seven friends and which ones they
 * have yet to meet. An unknown stored id is ignored rather than thrown on:
 * saved data outlives code, and a creature renamed in a later version must not
 * stop a child seeing their island.
 */
export function collectionFor(earnedIds: readonly string[]): CollectionEntry[] {
  const earned = new Set(earnedIds);
  const order = new Map(GRAPHEME_LIST.map((g, index) => [g.id, index]));

  return CREATURE_LIST.slice()
    .sort((a, b) => (order.get(a.graphemeId) ?? 0) - (order.get(b.graphemeId) ?? 0))
    .map((creature) => ({ creature, hatched: earned.has(creature.id) }));
}
