import { describe, expect, it } from 'vitest';
import { confusionKey, masteryKey } from './types';

describe('masteryKey', () => {
  it('identifies a record by target and skill together', () => {
    expect(masteryKey('s', 'SOUND_ID')).toBe('s::SOUND_ID');
    expect(masteryKey('s', 'SOUND_ID')).not.toBe(masteryKey('s', 'LETTER_SOUND'));
    expect(masteryKey('s', 'SOUND_ID')).not.toBe(masteryKey('a', 'SOUND_ID'));
  });

  it('gives every target/skill pair of a small grid its own key', () => {
    const keys = new Set<string>();
    for (const target of ['s', 'a', 't', 'sat']) {
      for (const skill of ['SOUND_ID', 'LETTER_SOUND', 'BLEND_READ'] as const) {
        keys.add(masteryKey(target, skill));
      }
    }
    expect(keys.size).toBe(12);
  });
});

describe('confusionKey', () => {
  it('records the direction of a mix-up: asked for s, picked f', () => {
    expect(confusionKey('s', 'f')).toBe('s>f');
    expect(confusionKey('s', 'f')).not.toBe(confusionKey('f', 's'));
  });
});
