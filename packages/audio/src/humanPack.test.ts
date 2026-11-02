import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildManifest, scriptKeys } from '../../../scripts/generate-audio-manifest';
import { manifestKeys, packOf } from './manifest';
import measured from './human-au.measured.json';

/**
 * The recorded pack, and the work done to it on the way in.
 *
 * ## What these tests are really guarding
 *
 * The pack arrived with about half a second of silence at each end of every
 * clip. That is not margin: AudioService.sayAll plays one clip straight after
 * another with no gap of its own, so the padding becomes a full second of dead
 * air between the sounds of a word. A child sounding out s-i-t with a second
 * between each sound hears three noises, not a word — and blending is the
 * entire skill the game teaches, so the pack was unusable as delivered.
 *
 * scripts/import-voice-pack.sh trims it, and records what it measured in
 * human-au.measured.json. These tests read those measurements back, because the
 * alternative is decoding AAC in Node, and a trim that silently stopped
 * happening would be the kind of defect nobody notices until a child cannot
 * blend and we conclude the child is struggling.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const APP_ROOT = join(REPO_ROOT, 'apps', 'game');

type Measurement = {
  durationMs: number;
  leadMs: number;
  tailMs: number;
  peak: number;
  sourceDurationMs: number;
  sourceBlocks: number;
  keptBlocks: number;
};

const MEASURED = measured as unknown as Record<string, Measurement | string>;
const clips = Object.entries(MEASURED).filter(
  (entry): entry is [string, Measurement] => !entry[0].startsWith('_'),
);

describe('the recorded pack', () => {
  it('is measured for exactly the clips the manifest takes from it', () => {
    const fromHuman = manifestKeys().filter((key) => packOf(key) === 'human-au');
    expect(clips.map(([key]) => key).sort()).toEqual(fromHuman.sort());
    expect(clips.length).toBeGreaterThanOrEqual(31);
  });

  it('keeps a master WAV for every imported clip, so the trim can be redone', () => {
    // Without the masters the only copy of each clip is the trimmed, lossily
    // encoded one, and changing the trim would mean recording again.
    const missing = clips
      .map(([key]) => key)
      .filter((key) => !existsSync(join(REPO_ROOT, 'packages/audio/masters/human-au', `${key}.wav`)));
    expect(missing, `no master for: ${missing.join(', ')}`).toEqual([]);
  });

  it('starts almost immediately: no clip opens with an audible gap', () => {
    // The defect this whole import exists to fix. 40ms is below the threshold
    // at which a gap is heard as a gap at all.
    for (const [key, m] of clips) {
      expect(m.leadMs, `${key} opens with ${m.leadMs}ms of silence`).toBeLessThanOrEqual(40);
    }
  });

  it('ends promptly', () => {
    // No lower bound, deliberately. A fricative decays so gradually that its
    // energy is still above the noise floor when the fade reaches it, so a
    // measured tail of nothing is correct for /f/ and means only that the fade
    // is doing the work of stopping the clip cleanly.
    for (const [key, m] of clips) {
      expect(m.tailMs, `${key} ends with ${m.tailMs}ms of silence`).toBeLessThanOrEqual(100);
    }
  });

  it('holds one sound per phoneme clip, however many takes were recorded', () => {
    // /t/ and /p/ cannot be held, so the reader gave three of each in one file.
    // That is the right instinct at a microphone and the wrong file here: the
    // game plays one clip as one sound, and plays it three times over on a
    // teaching card, which would have made nine.
    const sounds = clips.filter(([key]) => key.startsWith('ph.'));
    expect(sounds.length).toBe(7);
    for (const [key, m] of sounds) {
      expect(m.keptBlocks, `${key} holds ${m.keptBlocks} sounds`).toBe(1);
    }
    // Not vacuous: the repeated takes really are in the masters, and really
    // were discarded rather than never having been there.
    const repeated = sounds.filter(([, m]) => m.sourceBlocks > 1).map(([key]) => key);
    expect(repeated).toEqual(['ph.t', 'ph.p']);
  });

  it('keeps one word per word clip, dropping false starts', () => {
    // Several clips open with a breath or an abandoned attempt, then a pause,
    // then the word. Kept, that pause is dead air in the middle of a prompt.
    for (const [key, m] of clips.filter(([key]) => key.startsWith('wd.'))) {
      expect(m.keptBlocks, `${key} holds ${m.keptBlocks} separated blocks`).toBeLessThanOrEqual(2);
    }
  });

  it('removed at least half a second of silence from every clip', () => {
    // States the delivered defect as a fact rather than a memory. If a future
    // pack arrives already trimmed this will fail, and the right response is to
    // relax it — not to go looking for a bug.
    for (const [key, m] of clips) {
      const removed = m.sourceDurationMs - m.durationMs;
      expect(removed, `${key}: only ${removed}ms removed`).toBeGreaterThanOrEqual(500);
    }
  });

  it('levels every clip to the same peak', () => {
    // As delivered the phonemes peaked between 0.33 and 0.79 while the words
    // sat at 0.79, so the single sounds — the hardest thing in the game to hear
    // — were also the quietest.
    for (const [key, m] of clips) {
      expect(m.peak, key).toBeGreaterThan(0.8);
      expect(m.peak, `${key} is close enough to full scale that encoding may clip it`).toBeLessThan(0.9);
    }
  });

  it('holds clips of a plausible length for a sound or a short word', () => {
    // Wide bounds on purpose: a stretched /sss/ and a brisk "it" are both
    // correct. This catches a clip that is a fragment or a whole sentence.
    for (const [key, m] of clips) {
      expect(m.durationMs, `${key} is ${m.durationMs}ms`).toBeGreaterThanOrEqual(180);
      expect(m.durationMs, `${key} is ${m.durationMs}ms`).toBeLessThanOrEqual(1400);
    }
  });

  it('holds words of a consistent length, so none is an outlier worth a listen', () => {
    // Before the false starts were dropped the spread was 245ms to 928ms, and
    // the long end was all padding rather than speech. A word that drifts back
    // out of this band is one to play on /voice before trusting it.
    for (const [key, m] of clips.filter(([key]) => key.startsWith('wd.'))) {
      expect(m.durationMs, `${key} is ${m.durationMs}ms`).toBeLessThanOrEqual(850);
    }
  });
});

describe('the manifest generator', () => {
  const has = (pack: string, key: string) =>
    existsSync(join(APP_ROOT, 'assets/voice', pack, `${key}.m4a`));

  it('matches the committed manifest, so a forgotten regenerate fails here', () => {
    const keys = scriptKeys(readFileSync(join(REPO_ROOT, 'packages/audio/voice-script.txt'), 'utf8'));
    const built = buildManifest(keys, has);
    const committed = JSON.parse(
      readFileSync(join(REPO_ROOT, 'packages/audio/src/manifest.json'), 'utf8'),
    );
    expect(built).toEqual(committed);
  });

  it('prefers a recorded clip over a stand-in wherever there is one', () => {
    const built = buildManifest(['ph.s', 'ui.lets_go'], (pack, key) =>
      pack === 'human-au' ? key === 'ph.s' : true,
    );
    expect(built['ph.s']).toBe('assets/voice/human-au/ph.s.m4a');
    expect(built['ui.lets_go']).toBe('assets/voice/placeholder-au/ui.lets_go.m4a');
  });

  it('refuses to write a key that no pack can play', () => {
    // A key present in the manifest but absent from disk is silence on a
    // prompt: a child looking at a screen that asked them nothing.
    expect(() => buildManifest(['ph.s'], () => false)).toThrow(/no clip in any pack for: ph\.s/i);
  });

  it('reads the keys out of the clip list, ignoring comments and blank lines', () => {
    expect(scriptKeys('# note\n\nph.s|sss|s||Stretch it.\nui.lets_go|Go!|||Bright.\n')).toEqual([
      'ph.s',
      'ui.lets_go',
    ]);
  });
});
