import type { TargetId, TaskInstance } from '@soundlings/engine';
import type { AudioService } from '@soundlings/audio';
import type { HintTier } from './useHintLadder';

/** The contract every mini-game implements. */
export interface TaskProps {
  task: TaskInstance;
  audio: AudioService;
  /** Tier imposed by the frustration guard. The frame merges it with idling. */
  externalTier: HintTier;
  /**
   * Choices to dim at hint tier 2+, leaving the child a two-way choice. Chosen
   * by the runner, not the component, so the engine stays in charge of what
   * gets removed.
   */
  dimmed: TargetId[];
  /** Fires once per answer. The runner judges correctness and timing. */
  onAnswer: (answer: string) => void;
  /** Position in the quest, for the progress pips. */
  position: { index: number; total: number };
}
