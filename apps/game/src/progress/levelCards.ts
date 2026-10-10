import { LEVELS, creatureForGrapheme } from '@soundlings/curriculum';
import type { Level } from '@soundlings/curriculum';
import { levelProgress } from '@soundlings/engine';
import type { MasteryMap } from '@soundlings/engine';
import type { CollectionEntry } from './collection';

export type LevelState = 'complete' | 'in-progress' | 'locked';

export interface LevelCard {
  number: number;
  name: string;
  creatures: CollectionEntry[];
  state: LevelState;
  /** 0..1, the live calculation. Meaningful only while in progress. */
  fraction: number;
  /** Started or completed: tapping it plays. Locked levels do nothing. */
  playable: boolean;
}

/**
 * One card per level, for the level select.
 *
 * COMPLETE comes from the latch (`completions`), never from the live
 * calculation: `levelProgress` is judged at `now`, so a level finished last
 * month reads as unfinished once its evidence decays, and a child must never
 * lose a level they have finished. The live fraction is used only to show how
 * far along a level in progress is. The island, by contrast, deliberately reads
 * the live calculation ("what can they do now?"), so the two can disagree after
 * a long gap: that is intended, and neither should be changed to match the
 * other (see island.ts).
 *
 * A level is open once the one before it is latched complete. Locked cards
 * carry nothing but their state: no date, no detail.
 */
export function levelCards(args: {
  levels: readonly Level[];
  mastery: MasteryMap;
  completions: Readonly<Record<number, number>>;
  now: number;
}): LevelCard[] {
  const { levels, mastery, completions, now } = args;

  return levels.map((level, index) => {
    const complete = completions[level.number] !== undefined;
    const previous = index === 0 ? null : levels[index - 1];
    const open = previous === null || completions[previous.number] !== undefined;
    const state: LevelState = complete ? 'complete' : open ? 'in-progress' : 'locked';

    const live = levelProgress(level.number, mastery, now);
    const earned = new Set(live.creaturesEarned);
    const creatures = level.graphemeIds.map((graphemeId) => {
      const creature = creatureForGrapheme(graphemeId);
      return { creature, hatched: complete || earned.has(creature.id) };
    });

    return {
      number: level.number,
      name: level.name,
      creatures,
      state,
      fraction: complete ? 1 : state === 'locked' ? 0 : live.fraction,
      playable: state !== 'locked',
    };
  });
}

/** The first level not yet completed, or the last if all are: there is always somewhere to play. */
export function currentLevel(levels: readonly Level[], completions: Readonly<Record<number, number>>): number {
  const next = levels.find((l) => completions[l.number] === undefined);
  return (next ?? levels[levels.length - 1]).number;
}

/** A level number from a route parameter, or the first level if it is not one we have. */
export function levelFromParam(raw: string | undefined, levels: readonly Level[] = LEVELS): number {
  const n = Number(raw);
  return raw !== undefined && Number.isInteger(n) && levels.some((l) => l.number === n) ? n : levels[0].number;
}
