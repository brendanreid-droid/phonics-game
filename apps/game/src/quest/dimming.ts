import type { TargetId, TaskInstance } from '@soundlings/engine';

/**
 * Which choices to dim at hint tier 2+, narrowing to a two-way decision.
 *
 * Called by each mini-game with the tier it has merged from idling, errors and
 * the owl button, because only the mini-game knows all three. The runner only
 * ever sees the error-driven tier, so computing this there would leave a
 * nine-second pause showing the mnemonic and narrowing nothing.
 *
 * Word Builder is excluded: its "choices" are letter tiles the child needs to
 * assemble, so dimming them would remove letters the word requires.
 */
export function dimmedFor(task: TaskInstance, tier: number): TargetId[] {
  if (tier < 2) return [];
  if (task.skill === 'SEGMENT_SPELL') return [];

  const wrong = task.choices.filter((choice) => choice !== task.correctChoice);
  // Keep one wrong answer, dim the rest.
  return wrong.slice(1);
}
