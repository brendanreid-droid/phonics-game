import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, withDefaults } from './config';

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
