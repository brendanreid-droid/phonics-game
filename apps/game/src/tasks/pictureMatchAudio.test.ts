import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { WORD_LIST } from '@soundlings/curriculum';
import { hasAudio } from '@soundlings/audio';
import { PICTURE_MATCH_PROMPT_KEYS, WORD_PICK_PROMPT_KEYS, soundOutKeys } from './pictureMatchAudio';

describe('Picture Match audio', () => {
  it('sounds the graphemes out one at a time, in order', () => {
    const word = WORD_LIST.find((w) => w.id === 'sip');
    if (!word) throw new Error('expected the word "sip"');
    expect(soundOutKeys(word)).toEqual(['ph.s', 'ph.i', 'ph.p']);
  });

  it('never speaks a word, for any word: reading it is the task', () => {
    for (const word of WORD_LIST) {
      const keys = soundOutKeys(word);
      expect(keys, word.id).not.toContain(word.audio);
      expect(
        keys.filter((key) => key.startsWith('wd.')),
        word.id,
      ).toEqual([]);
    }
    expect(PICTURE_MATCH_PROMPT_KEYS.filter((key) => key.startsWith('wd.'))).toEqual([]);
  });

  it('only asks for clips that exist, so a hint can never be silently mute', () => {
    for (const word of WORD_LIST) {
      for (const key of soundOutKeys(word)) expect(hasAudio(key), `${word.id}: ${key}`).toBe(true);
    }
    for (const key of PICTURE_MATCH_PROMPT_KEYS) expect(hasAudio(key)).toBe(true);
  });

  it('is the only source of speech in the component', () => {
    // The component is plain React Native and cannot be rendered under Node
    // here, so guard the invariant at the source: no word clip is referenced.
    const source = readFileSync(fileURLToPath(new URL('./PictureMatch.tsx', import.meta.url).href), 'utf8');
    expect(source).not.toMatch(/\bword\.audio\b/);
    expect(source).not.toMatch(/['"`]wd\./);
  });
});

describe('Word Pick audio', () => {
  it('never speaks a word in its prompt: the picture is shown and reading the cards is the task', () => {
    expect(WORD_PICK_PROMPT_KEYS.length).toBeGreaterThan(0);
    expect(WORD_PICK_PROMPT_KEYS.filter((key) => key.startsWith('wd.'))).toEqual([]);
  });

  it('only asks for clips that exist', () => {
    for (const key of WORD_PICK_PROMPT_KEYS) expect(hasAudio(key), key).toBe(true);
  });
});
