import { describe, expect, it } from 'vitest';
import { getWord } from '@soundlings/curriculum';
import { ROBOT_TALK_PROMPT_KEYS, robotGapMs, robotRevealKey, robotTalkKeys } from './robotTalkAudio';

describe('robotTalkKeys', () => {
  it('says each sound of the word, in order', () => {
    expect(robotTalkKeys(getWord('map'))).toEqual(['ph.m', 'ph.a', 'ph.p']);
  });

  it('never says the word itself', () => {
    // The whole point. Saying "map" and then asking which picture is a map is a
    // listening game a two-year-old wins; pushing the sounds together is the
    // skill. Nothing in the prompt or the robot talk may name the word.
    const keys = [...ROBOT_TALK_PROMPT_KEYS, ...robotTalkKeys(getWord('map'))];
    expect(keys).not.toContain(getWord('map').audio);
    for (const key of keys) expect(key.startsWith('wd.')).toBe(false);
  });

  it('says the blended word only as the reveal, after an answer', () => {
    expect(robotRevealKey(getWord('map'))).toBe(getWord('map').audio);
  });

  it('repeats a doubled sound rather than collapsing it', () => {
    // "pip" is /p/ /i/ /p/. Three sounds, and a child counting them should hear
    // three. De-duplicating would teach the wrong word.
    expect(robotTalkKeys(getWord('pip'))).toEqual(['ph.p', 'ph.i', 'ph.p']);
  });
});

describe('robotGapMs', () => {
  it('shortens the gap as the hint tier rises, which is the teaching move', () => {
    expect(robotGapMs(1)).toBeGreaterThan(robotGapMs(2));
    expect(robotGapMs(2)).toBeGreaterThan(robotGapMs(3));
  });

  it('never closes the gap entirely', () => {
    // At zero the game says the word, which is the one thing it must not do
    // before the child has answered.
    for (const tier of [1, 2, 3] as const) expect(robotGapMs(tier)).toBeGreaterThan(0);
  });
});
