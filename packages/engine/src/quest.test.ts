import { describe, expect, it } from 'vitest';
import { isPrimaryAttempt, starsFor, tallyAttempts } from './quest';
import { localDateString } from './dates';
import type { Attempt } from './types';

const attempt = (over: Partial<Attempt>): Attempt => ({
  sessionId: 's',
  targetId: 'sat',
  skill: 'BLEND_READ',
  taskTypeId: 'word-pick',
  correct: true,
  scaffolded: false,
  latencyMs: 1000,
  weight: 1,
  at: 0,
  ...over,
});

describe('isPrimaryAttempt', () => {
  it('is true for the skill the mini-game teaches, whatever the weight', () => {
    expect(isPrimaryAttempt(attempt({}))).toBe(true);
    expect(isPrimaryAttempt(attempt({ weight: 0.5 }))).toBe(true);
  });

  it('is false for credit given to a letter inside a word', () => {
    expect(isPrimaryAttempt(attempt({ targetId: 's', skill: 'SOUND_ID', weight: 0.5 }))).toBe(false);
  });
});

describe('tallyAttempts', () => {
  it('counts a word task\'s error once, not once per letter', () => {
    const tally = tallyAttempts([
      attempt({ correct: false }),
      attempt({ targetId: 's', skill: 'SOUND_ID', correct: false, weight: 0.5 }),
      attempt({ targetId: 'a', skill: 'SOUND_ID', correct: false, weight: 0.5 }),
    ]);
    expect(tally).toEqual({ errors: 1, scaffolds: 0 });
  });

  it('counts shown answers separately from errors', () => {
    expect(tallyAttempts([attempt({ scaffolded: true }), attempt({ correct: false })])).toEqual({
      errors: 1,
      scaffolds: 1,
    });
  });

  it('feeds starsFor to give the score', () => {
    expect(starsFor(tallyAttempts([]))).toBe(3);
  });
});

describe('localDateString', () => {
  it('formats the device-local calendar date', () => {
    const at = new Date(2026, 9, 14, 23, 30).getTime();
    expect(localDateString(at)).toBe('2026-10-14');
  });
});
