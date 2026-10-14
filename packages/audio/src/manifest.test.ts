import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allAudioKeys } from '@soundlings/curriculum';
import {
  ENCOURAGE_KEYS,
  PRAISE_KEYS,
  audioPath,
  hasAudio,
  isPlaceholderPack,
  manifestKeys,
} from './manifest';

const REPO_ROOT = join(__dirname, '..', '..', '..');
const APP_ROOT = join(REPO_ROOT, 'apps', 'game');

describe('audio manifest', () => {
  it('resolves every audio key the curriculum references', () => {
    const missing = allAudioKeys().filter((key) => !hasAudio(key));
    expect(missing, `missing audio for: ${missing.join(', ')}`).toEqual([]);
  });

  it('is not vacuous: the curriculum key list includes phonemes, words and every tricky word', () => {
    // Guards the check above against passing on an empty list if allAudioKeys regresses.
    const keys = allAudioKeys();
    for (const key of ['ph.s', 'ln.s', 'wd.mat', 'wd.i_pronoun', 'wd.the', 'wd.a_word', 'wd.as', 'wd.is']) {
      expect(keys, key).toContain(key);
    }
  });

  it('points every manifest entry at a file that exists on disk', () => {
    const broken = manifestKeys().filter((key) => !existsSync(join(APP_ROOT, audioPath(key))));
    expect(broken, `manifest keys with no file: ${broken.join(', ')}`).toEqual([]);
  });

  it('provides at least 12 praise variants so praise never feels canned', () => {
    expect(PRAISE_KEYS.length).toBeGreaterThanOrEqual(12);
    for (const key of PRAISE_KEYS) expect(hasAudio(key), key).toBe(true);
  });

  it('provides encouragement clips for wrong answers', () => {
    expect(ENCOURAGE_KEYS.length).toBeGreaterThanOrEqual(3);
    for (const key of ENCOURAGE_KEYS) expect(hasAudio(key), key).toBe(true);
  });

  it('provides every instruction clip the seven mini-games need', () => {
    for (const key of ['ui.which_says', 'ui.which_sound', 'ui.find_letter', 'ui.build_word', 'ui.tap_picture', 'ui.listen_again', 'ui.find_word', 'ui.missing_letter', 'ui.which_starts']) {
      expect(hasAudio(key), key).toBe(true);
    }
  });

  it('throws on an unknown key rather than silently playing nothing', () => {
    expect(() => audioPath('nope.nothing')).toThrow(/unknown audio key/i);
  });

  it('reports that the current pack is a placeholder', () => {
    // When this flips to false, a real voice pack has landed and the in-app
    // placeholder banner will disappear on its own.
    expect(isPlaceholderPack()).toBe(true);
  });
});
