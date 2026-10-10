import { useCallback, useEffect, useRef, useState } from 'react';

export type HintTier = 0 | 1 | 2 | 3;

/**
 * The tiers idling can reach. Deliberately a narrower type than HintTier: tier 3
 * shows the answer, and it must not be expressible as a result of waiting.
 */
export type IdleTier = 0 | 1 | 2;

export const HINT_TIMING = {
  /** Replay the instruction and nudge the owl. */
  tier1Ms: 4000,
  /** Mnemonic animation, and distractors dim to leave two. */
  tier2Ms: 9000,
} as const;

/** What idling does, in order. The one place a new idle step could be added. */
export const IDLE_SCHEDULE: readonly { afterMs: number; tier: 1 | 2 }[] = [
  { afterMs: HINT_TIMING.tier1Ms, tier: 1 },
  { afterMs: HINT_TIMING.tier2Ms, tier: 2 },
];

/** The tier that idling alone should reach after `elapsedMs` of silence. */
export function nextIdleTier(elapsedMs: number): IdleTier {
  if (elapsedMs >= HINT_TIMING.tier2Ms) return 2;
  if (elapsedMs >= HINT_TIMING.tier1Ms) return 1;
  return 0;
}

/**
 * Starts the idle timers and reports each tier as it is reached. Returns a
 * function that cancels whatever has not fired yet.
 *
 * Plain timers, no React, so the real schedule can be tested with fake timers.
 */
export function startIdleLadder(onTier: (tier: 1 | 2) => void): () => void {
  const handles = IDLE_SCHEDULE.map((step) => setTimeout(() => onTier(step.tier), step.afterMs));
  return () => {
    for (const handle of handles) clearTimeout(handle);
  };
}

/** Idling, the frustration guard, and the owl button each ask for a tier; the child gets the highest. */
export function mergeTiers(idle: IdleTier, external: HintTier, manual: HintTier): HintTier {
  return Math.max(idle, external, manual) as HintTier;
}

interface LadderState {
  /** The task these values belong to. Values for any other task are ignored. */
  taskId: string;
  idle: IdleTier;
  manual: HintTier;
}

/**
 * Escalates hints while the child does nothing, and merges that with the tier
 * the quest runner imposes after errors.
 *
 * Idling never reaches tier 3. A child who pauses is thinking, and handing
 * them the answer takes away a win they were about to earn themselves.
 *
 * State is stamped with the task it belongs to and ignored for any other task,
 * rather than reset in an effect. An effect would leave one render where the
 * new task still carried the previous task's tier, and a hint-tier effect in a
 * mini-game would fire during it and play the new task's answer.
 */
export function useHintLadder(args: {
  /** Changes whenever a new task is shown, resetting the ladder. */
  taskId: string;
  /** Tier imposed by the frustration guard after errors. */
  externalTier: HintTier;
  /** Called when idling first reaches tier 1, so audio can repeat. */
  onIdleNudge?: () => void;
}): {
  tier: HintTier;
  /** The owl button: jump to at least this tier. */
  bumpToTier: (tier: HintTier) => void;
  /** The child did something. Restarts the idle clock, so a pause is measured from their last move. */
  noteActivity: () => void;
} {
  const { taskId, externalTier, onIdleNudge } = args;
  const [state, setState] = useState<LadderState>({ taskId, idle: 0, manual: 0 });
  const [activity, setActivity] = useState(0);

  // Held in a ref so a caller passing a fresh function each render cannot
  // restart the timers.
  const nudge = useRef(onIdleNudge);
  useEffect(() => {
    nudge.current = onIdleNudge;
  });

  useEffect(() => {
    return startIdleLadder((tier) => {
      setState((prev) => ({ ...(prev.taskId === taskId ? prev : { taskId, idle: 0, manual: 0 }), idle: tier }));
      if (tier === 1) nudge.current?.();
    });
  }, [taskId, activity]);

  const current = state.taskId === taskId ? state : { taskId, idle: 0 as IdleTier, manual: 0 as HintTier };

  const bumpToTier = useCallback(
    (next: HintTier) => {
      setState((prev) => {
        const base = prev.taskId === taskId ? prev : { taskId, idle: 0 as IdleTier, manual: 0 as HintTier };
        return next > base.manual ? { ...base, manual: next } : base;
      });
    },
    [taskId],
  );

  const noteActivity = useCallback(() => {
    setState((prev) => (prev.taskId === taskId ? { ...prev, idle: 0 } : prev));
    setActivity((count) => count + 1);
  }, [taskId]);

  return { tier: mergeTiers(current.idle, externalTier, current.manual), bumpToTier, noteActivity };
}
