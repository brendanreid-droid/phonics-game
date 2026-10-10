/**
 * Every tunable number in the engine. These are data, not code, because the
 * simulation harness (src/simulate.ts) calibrates them and real children will
 * force changes. When a pacing test fails, change a value here — never change
 * the test's expectation.
 */
export interface EngineConfig {
  // Session shape
  sessionLength: number;
  winbackCount: number;
  reviewCount: number;
  /** How many of the newest unmastered graphemes count as "current focus". */
  focusTargetCount: number;

  // Mastery predicate
  masteryStrength: number;
  masteryCorrect: number;
  masteryTaskTypes: number;
  masterySessions: number;

  // Win-back eligibility — stricter than mastery, since these must not fail.
  winbackStrength: number;

  // Decay and reinforcement
  initialHalfLifeHours: number;
  minHalfLifeHours: number;
  maxHalfLifeHours: number;
  growthFactor: number;
  errorShrink: number;
  secondaryWeight: number;
  slowLatencyMs: number;
  slowReinforceFactor: number;

  // Frustration guard
  scaffoldAfterErrors: number;
  abandonAfterErrors: number;
  badDayDistinctTargets: number;
  badDaySessionLength: number;

  // Level completion
  blendWordsRequired: number;
  segmentWordsRequired: number;
}

export const DEFAULT_CONFIG: EngineConfig = {
  // 14 tasks is roughly five minutes at a five-year-old's pace. Win-backs are
  // a floor of 3 rather than a percentage because the session invariants need
  // one at the open, one in the middle third and one at the close.
  sessionLength: 14,
  winbackCount: 3,
  reviewCount: 3,
  focusTargetCount: 2,

  masteryStrength: 0.8,
  masteryCorrect: 3,
  // Two task types, so a child cannot master a sound by memorising one game.
  masteryTaskTypes: 2,
  // Two sessions, so mastery means retention across a gap, not same-sitting recall.
  masterySessions: 2,

  winbackStrength: 0.9,

  initialHalfLifeHours: 6,
  minHalfLifeHours: 1,
  maxHalfLifeHours: 24 * 90,
  growthFactor: 1.9,
  errorShrink: 0.4,
  secondaryWeight: 0.5,
  // Above this, a correct answer was effortful rather than automatic, and
  // automaticity is the actual goal of phonics practice.
  slowLatencyMs: 4000,
  slowReinforceFactor: 0.5,

  scaffoldAfterErrors: 2,
  abandonAfterErrors: 3,
  badDayDistinctTargets: 3,
  badDaySessionLength: 8,

  blendWordsRequired: 8,
  segmentWordsRequired: 6,
};

export function withDefaults(partial?: Partial<EngineConfig>): EngineConfig {
  return { ...DEFAULT_CONFIG, ...(partial ?? {}) };
}
