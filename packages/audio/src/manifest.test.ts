import { existsSync, readFileSync } from 'node:fs';
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

describe('the recording script', () => {
  // packages/audio/voice-script.txt is what a human records from, what Polly
  // generates from, and what the macOS stand-in generates from. If it and the
  // manifest disagree, someone records 68 clips and the game still has a hole.
  const lines = readFileSync(join(REPO_ROOT, 'packages', 'audio', 'voice-script.txt'), 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.startsWith('#'));
  const rows = lines.map((line) => {
    const [key, text, ipa, mode, note] = line.split('|');
    return { key, text, ipa, mode, note };
  });

  it('covers exactly the clips the game plays, with nothing spare', () => {
    expect(rows.map((r) => r.key).sort()).toEqual(manifestKeys().sort());
  });

  it('gives every line something to say', () => {
    for (const row of rows) expect(row.text?.trim(), row.key).toBeTruthy();
  });

  it('tells whoever records it how to say every sound and every word', () => {
    // The delivery note is the whole value of this file. A voice actor reading
    // "sss" with no instruction says "ess"; reading `t` they say "tuh". Both
    // are the confusions synthetic phonics exists to prevent, and neither is
    // catchable by any test — only by a person listening.
    for (const row of rows) expect(row.note?.trim(), `${row.key} has no delivery note`).toBeTruthy();
  });

  it('gives every sound and every word an IPA transcription', () => {
    // IPA is what lets a speech engine produce /s/ rather than "ess", and what
    // removes the ambiguity for a human. The interface lines do not need one:
    // they are ordinary sentences.
    for (const row of rows) {
      if (row.key.startsWith('ui.') || row.key.startsWith('praise.') || row.key.startsWith('encourage.')) continue;
      expect(row.ipa?.trim(), `${row.key} has no IPA`).toBeTruthy();
    }
  });

  it('never writes a stop consonant with a vowel after it', () => {
    // "tuh" and "puh" are what the macOS stand-in says, and they are wrong: a
    // child sounding out t-a-p hears "tuh-a-puh" and never reaches "tap". The
    // stand-in is stuck with them, so the note beside each one must say so —
    // it is the instruction that stops a human repeating the mistake.
    for (const key of ['ph.t', 'ph.p']) {
      const row = rows.find((r) => r.key === key)!;
      expect(row.note.toLowerCase(), key).toContain('no schwa');
    }
  });
});
