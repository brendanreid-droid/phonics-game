import { describe, expect, it } from 'vitest';
import type { Level } from '@soundlings/curriculum';
import { LEVELS } from '@soundlings/curriculum';
import { currentLevel, levelCards, levelFromParam } from './levelCards';
import { masteredLevelOne, masteredSounds } from './masteryFixture';

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

const level2: Level = { ...LEVELS[0], number: 2, name: 'Second island', graphemeIds: ['s', 'a'], introductionGroups: [['s', 'a']] };
const TWO = [LEVELS[0], level2];

describe('levelCards', () => {
  it('makes one card per level, with its name and creatures', () => {
    const [card] = levelCards({ levels: LEVELS, mastery: {}, completions: {}, now: NOW });
    expect(card.number).toBe(1);
    expect(card.name).toBe('Island of First Sounds');
    expect(card.creatures).toHaveLength(7);
  });

  it('does not assume there is only one level', () => {
    expect(levelCards({ levels: TWO, mastery: {}, completions: {}, now: NOW })).toHaveLength(2);
  });

  it('shows the first level as in progress with live progress, even before anything is done', () => {
    const [card] = levelCards({ levels: LEVELS, mastery: {}, completions: {}, now: NOW });
    expect(card.state).toBe('in-progress');
    expect(card.fraction).toBe(0);
    expect(card.playable).toBe(true);
  });

  it('shows the live fraction while a level is under way', () => {
    const [card] = levelCards({ levels: LEVELS, mastery: masteredSounds(['s', 'a', 't', 'p', 'i', 'm', 'f'], NOW), completions: {}, now: NOW });
    expect(card.state).toBe('in-progress');
    expect(card.fraction).toBeGreaterThan(0.2);
    expect(card.fraction).toBeLessThan(1);
  });

  it('reads COMPLETE from the latch, not the live calculation', () => {
    // No mastery at all: the live calculation says nothing is learned. The
    // latch says the child finished this level, and that is what they see.
    const [card] = levelCards({ levels: LEVELS, mastery: {}, completions: { 1: NOW - 30 * DAY }, now: NOW });
    expect(card.state).toBe('complete');
    expect(card.creatures.every((c) => c.hatched)).toBe(true);
  });

  it('stays complete after the evidence has decayed away', () => {
    const mastery = masteredLevelOne(NOW - 400 * DAY);
    const [card] = levelCards({ levels: LEVELS, mastery, completions: { 1: NOW - 400 * DAY }, now: NOW });
    expect(card.state).toBe('complete');
  });

  it('does NOT call a level complete just because the live calculation says so, if it was never latched', () => {
    const [card] = levelCards({ levels: LEVELS, mastery: masteredLevelOne(NOW), completions: {}, now: NOW });
    expect(card.state).toBe('in-progress');
  });

  it('locks later levels until the one before is complete, with no detail', () => {
    const [, second] = levelCards({ levels: TWO, mastery: {}, completions: {}, now: NOW });
    expect(second.state).toBe('locked');
    expect(second.playable).toBe(false);
  });

  it('unlocks the next level once the one before is latched complete', () => {
    const [first, second] = levelCards({ levels: TWO, mastery: {}, completions: { 1: 5 }, now: NOW });
    expect(first.state).toBe('complete');
    expect(second.state).toBe('in-progress');
    expect(second.playable).toBe(true);
  });

  it('keeps a complete level playable, for another go', () => {
    const [card] = levelCards({ levels: LEVELS, mastery: {}, completions: { 1: 5 }, now: NOW });
    expect(card.playable).toBe(true);
  });

  it('shows hatched and egg faces for an in-progress level, by what is mastered now', () => {
    const [card] = levelCards({ levels: LEVELS, mastery: masteredSounds(['s'], NOW), completions: {}, now: NOW });
    expect(card.creatures.filter((c) => c.hatched).map((c) => c.creature.id)).toEqual(['sisi']);
  });
});

describe('currentLevel', () => {
  it('is the first level not yet completed', () => {
    expect(currentLevel(TWO, {})).toBe(1);
    expect(currentLevel(TWO, { 1: 5 })).toBe(2);
  });

  it('is the last level when everything is complete, so there is always somewhere to play', () => {
    expect(currentLevel(TWO, { 1: 5, 2: 6 })).toBe(2);
  });
});

describe('levelFromParam', () => {
  it('accepts a real level number', () => {
    expect(levelFromParam('2', TWO)).toBe(2);
  });

  it('falls back to the first level for anything else', () => {
    for (const bad of [undefined, '', 'abc', '0', '-1', '99', '1.5', 'NaN']) {
      expect(levelFromParam(bad, TWO)).toBe(1);
    }
  });
});
