import { describe, expect, it } from 'vitest';
import { LEVELS } from '@soundlings/curriculum';
import { DEFAULT_CONFIG, withDefaults } from './config';
import { applyAttempt, emptyRecord, strengthAt } from './mastery';

describe('withDefaults', () => {
  it('returns the defaults when given nothing', () => {
    expect(withDefaults()).toEqual(DEFAULT_CONFIG);
    expect(withDefaults({})).toEqual(DEFAULT_CONFIG);
  });

  it('applies overrides and keeps every other default', () => {
    const config = withDefaults({ secondaryWeight: 0.3, sessionLength: 10 });
    expect(config.secondaryWeight).toBe(0.3);
    expect(config.sessionLength).toBe(10);
    expect(config.masteryStrength).toBe(DEFAULT_CONFIG.masteryStrength);
    expect(config.growthFactor).toBe(DEFAULT_CONFIG.growthFactor);
  });

  it('does not mutate the shared defaults', () => {
    const before = { ...DEFAULT_CONFIG };
    withDefaults({ masteryCorrect: 99 });
    expect(DEFAULT_CONFIG).toEqual(before);
    expect(withDefaults().masteryCorrect).toBe(before.masteryCorrect);
  });
});

describe('DEFAULT_CONFIG rationale', () => {
  const HOUR = 3_600_000;

  it('lets a child who practises once a day hold what three correct answers earned', () => {
    // At a 6h starting half-life, three correct answers left strength at 0.71 by the next
    // morning, under the mastery gate, so nothing could be mastered by daily practice.
    let record = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
    for (let i = 0; i < 3; i += 1) {
      record = applyAttempt(
        record,
        { sessionId: `s${i}`, targetId: 's', skill: 'SOUND_ID', taskTypeId: 'sound-hunt', correct: true, scaffolded: false, latencyMs: 900, weight: 1, at: HOUR },
        DEFAULT_CONFIG,
      );
    }
    expect(strengthAt(record, HOUR + 20 * HOUR, DEFAULT_CONFIG)).toBeGreaterThanOrEqual(DEFAULT_CONFIG.masteryStrength);
  });

  it('holds even a single correct answer through to the next morning (a pin on the tuning)', () => {
    // The product of starting half-life and one step of growth must reach about 62h, the
    // half-life at which 20 hours of decay still leaves 0.8. Retuning one of the two
    // without the other should be a decision, not an accident.
    const record = applyAttempt(
      emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG),
      { sessionId: 's', targetId: 's', skill: 'SOUND_ID', taskTypeId: 'sound-hunt', correct: true, scaffolded: false, latencyMs: 900, weight: 1, at: HOUR },
      DEFAULT_CONFIG,
    );
    expect(strengthAt(record, HOUR + 20 * HOUR, DEFAULT_CONFIG)).toBeGreaterThanOrEqual(DEFAULT_CONFIG.masteryStrength);
  });

  it('keeps the focus front no wider than the first introduction group', () => {
    // Wider spans two groups, which is not a small front a child can finish.
    expect(DEFAULT_CONFIG.focusTargetCount).toBeLessThanOrEqual(LEVELS[0].introductionGroups[0].length);
  });

  it('does not call five seconds to decode a word slow: that is reading, not failing', () => {
    expect(DEFAULT_CONFIG.slowLatencyMs).toBeGreaterThanOrEqual(5000);
  });

  it('keeps the slow-answer rule alive', () => {
    expect(DEFAULT_CONFIG.slowReinforceFactor).toBeLessThan(1);
  });

  it('keeps every mastery guarantee at its designed strength', () => {
    expect(DEFAULT_CONFIG.masteryCorrect).toBe(3);
    expect(DEFAULT_CONFIG.masterySessions).toBe(2);
    expect(DEFAULT_CONFIG.masteryStrength).toBe(0.8);
    expect(DEFAULT_CONFIG.masteryTaskTypes).toBe(2);
  });

  it('asks for six words read and five spelt, as decided, on top of every sound in both directions', () => {
    expect(DEFAULT_CONFIG.blendWordsRequired).toBe(6);
    expect(DEFAULT_CONFIG.segmentWordsRequired).toBe(5);
  });
});
