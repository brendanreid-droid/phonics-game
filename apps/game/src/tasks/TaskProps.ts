import type { TaskInstance } from '@soundlings/engine';
import type { AudioService } from '@soundlings/audio';
import type { HintTier } from './useHintLadder';

/** The contract every mini-game implements. */
export interface TaskProps {
  task: TaskInstance;
  audio: AudioService;
  /**
   * Tier imposed by the frustration guard. The frame merges it with idling.
   *
   * There is deliberately no `dimmed` prop. Which choices to dim follows the
   * merged tier, which only the mini-game has (the runner never learns about
   * idling), so each mini-game works it out with `dimmedFor`. Passing it in as
   * well would give two sources for one fact, and they would disagree the first
   * time a child paused.
   */
  externalTier: HintTier;
  /**
   * Fires once per answer. The runner judges correctness and timing. `tier` is
   * the merged hint tier the child was looking at: idling and the owl button
   * raise it too, and only the mini-game knows, so a right answer after the
   * choices were narrowed can be weighed as the guess it partly is.
   */
  onAnswer: (answer: string, tier: HintTier) => void;
  /** Position in the quest, for the progress pips. */
  position: { index: number; total: number };
}
