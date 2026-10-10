import type { TargetId } from '@soundlings/curriculum';
import type { EngineConfig } from './config';

export interface GuardDirective {
  /** 0 none, 1 idle nudge, 2 mnemonic plus narrowing, 3 show the answer. */
  hintTier: 0 | 1 | 2 | 3;
  /** Show the answer and accept a tap on it. Counts for progress, not mastery. */
  scaffold: boolean;
  /** Stop asking this question; the runner inserts a win-back instead. */
  abandon: boolean;
  /** Cap the difficulty of remaining tasks. */
  capDifficulty: number | null;
  /** Shorten the session to this many tasks. */
  truncateTo: number | null;
}

/**
 * Tracks within-session errors and decides when to help.
 *
 * Stateful and per-session by design: frustration is a property of the
 * sitting, not of the child. Yesterday's bad afternoon must not make today's
 * session easier, and that is why this state is deliberately never persisted.
 *
 * Directives are not sticky. `capDifficulty` and `truncateTo` are reported on
 * the answer that triggers them, and a later correct answer reports nothing,
 * so the runner must latch them for the rest of the quest.
 *
 * "Bad day" means the child was abandoned on `badDayDistinctTargets`
 * different targets, not that they made that many errors: one wrong answer on
 * each of three sounds is an ordinary quest, and cutting it short would
 * punish the average child.
 */
export class FrustrationGuard {
  private readonly errorsByTarget = new Map<TargetId, number>();

  private readonly abandonedTargets = new Set<TargetId>();

  constructor(private readonly config: EngineConfig) {}

  record(targetId: TargetId, correct: boolean): GuardDirective {
    if (correct) {
      this.errorsByTarget.set(targetId, 0);
      return none();
    }

    const errors = (this.errorsByTarget.get(targetId) ?? 0) + 1;
    this.errorsByTarget.set(targetId, errors);

    if (errors >= this.config.abandonAfterErrors) {
      this.abandonedTargets.add(targetId);
      const badDay = this.abandonedTargets.size >= this.config.badDayDistinctTargets;
      return {
        hintTier: 3,
        scaffold: true,
        abandon: true,
        // Drop to easy task types for whatever remains, but NOT to difficulty
        // 1. Only one Level 1 task type is that easy, so capping there would
        // leave the session builder a single usable mini-game and collapse its
        // no-adjacent rule into fourteen identical tasks in a row. That would
        // hand the most monotonous possible quest to the child already having
        // the worst time. See `EngineConfig.cappedDifficulty`.
        capDifficulty: this.config.cappedDifficulty,
        // A tired or unwell child gets a short, kind session rather than a
        // full quest of failure. Attempts still record normally, so the
        // mastery data stays honest; we simply stop asking.
        truncateTo: badDay ? this.config.badDaySessionLength : null,
      };
    }

    if (errors >= this.config.scaffoldAfterErrors) {
      return { hintTier: 3, scaffold: true, abandon: false, capDifficulty: null, truncateTo: null };
    }

    return { hintTier: 2, scaffold: false, abandon: false, capDifficulty: null, truncateTo: null };
  }

  errorsFor(targetId: TargetId): number {
    return this.errorsByTarget.get(targetId) ?? 0;
  }

  /** Targets the child was abandoned on this sitting, in the order it happened. */
  strugglingTargets(): TargetId[] {
    return [...this.abandonedTargets];
  }
}

function none(): GuardDirective {
  return { hintTier: 0, scaffold: false, abandon: false, capDifficulty: null, truncateTo: null };
}
