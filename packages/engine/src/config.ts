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
  /**
   * Difficulty ceiling applied to the rest of a quest after the guard abandons
   * a task. Only one Level 1 task type sits on rung 1, so a cap that admits
   * just that one leaves the session builder a single mini-game, collapses its
   * no-adjacent-repeats rule, and hands a struggling child a quest of identical
   * tasks.
   *
   * On the current scale 3 admits Robot Talk, Sound Hunt, Sound Singer and
   * Picture Start — four games across three skills, and no word work at all.
   * That is the right behaviour: when a child is struggling, a teacher takes
   * them back to the sounds. `frustration.test.ts` asserts the property rather
   * than the number, because this scale has now moved twice — once when
   * difficulty became a function of the task AND the word, and once when oral
   * blending took the bottom rung — and a cap pinned to a number would have
   * been silently wrong both times.
   */
  cappedDifficulty: number;

  // Word readiness (spec §5.4 invariant 5a)
  /**
   * Unscaffolded correct answers, in total on SOUND_ID and LETTER_SOUND, that a
   * grapheme needs before any word containing it may be asked (read or spelt).
   */
  wordReadinessCorrect: number;

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
  // Three, matching the first introduction group (s, a, t). Four would span two
  // groups, which is not a small front a child can finish.
  focusTargetCount: 3,

  masteryStrength: 0.8,
  masteryCorrect: 3,
  // Two task types, so a child cannot master a sound by memorising one game.
  masteryTaskTypes: 2,
  // Two sessions, so mastery means retention across a gap, not same-sitting recall.
  masterySessions: 2,

  winbackStrength: 0.9,

  // 24h: a once-a-day product. At 6h, three correct answers left strength at
  // 0.71 by the next morning, below the 0.8 mastery gate, so a child could not
  // master anything by practising once a day.
  initialHalfLifeHours: 24,
  minHalfLifeHours: 1,
  maxHalfLifeHours: 24 * 90,
  // Measured, not principled: it implies three correct answers give about two
  // months of retention, which is surely generous. It was chosen because the
  // simulation (simulate.ts) found nothing slower that let a child finish Level 1
  // in a reasonable number of quests. Revisit against real children.
  growthFactor: 4,
  errorShrink: 0.4,
  secondaryWeight: 0.5,
  // Above this, a correct answer was effortful rather than automatic, and
  // automaticity is the actual goal of phonics practice. 7s, not 4s: a five-year-old
  // taking five seconds to decode a word is reading, not failing. At 4s a child who
  // averaged 5.2s had every answer reinforced at half rate and could not finish.
  slowLatencyMs: 7000,
  slowReinforceFactor: 0.5,

  scaffoldAfterErrors: 2,
  abandonAfterErrors: 3,
  badDayDistinctTargets: 3,
  badDaySessionLength: 8,
  cappedDifficulty: 3,

  // Two correct answers means "they can do it", not "they have mastered it".
  // Mastery needs two separate sessions, and gating words on that would make a
  // child wait days before reading anything. The sounds that unlock words are
  // the sounds a sounds-only first quest asks about, so this cannot deadlock.
  wordReadinessCorrect: 2,

  // Six words read and five spelt, on top of all seven sounds proven in both
  // directions. Reduced from 8 and 6, which were arbitrary.
  blendWordsRequired: 6,
  segmentWordsRequired: 5,
};

export function withDefaults(partial?: Partial<EngineConfig>): EngineConfig {
  return { ...DEFAULT_CONFIG, ...(partial ?? {}) };
}
