import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { manifestKeys } from '@soundlings/audio';
import { renderAssetMap } from '../../../../scripts/generate-audio-asset-map';

/**
 * The generated map is what makes audio load at all: Metro bundles a clip only
 * if it sees a literal require() of it. The map cannot be imported here (a
 * `require` of an .m4a only means something to Metro), so these tests read it
 * as text. If someone changes the manifest or the clips and forgets to
 * regenerate, a child hears silence on that prompt; this is the net.
 */
const APP_ROOT = resolve(__dirname, '../..');
const REPO_ROOT = resolve(APP_ROOT, '../..');
const GENERATED = resolve(__dirname, 'assetMap.generated.ts');
const MANIFEST = resolve(REPO_ROOT, 'packages/audio/src/manifest.json');

const source = readFileSync(GENERATED, 'utf8');
const entries = [...source.matchAll(/^\s+"([^"]+)": require\("([^"]+)"\),$/gm)].map(
  (m) => [m[1], m[2]] as const,
);

describe('generated audio asset map', () => {
  it('covers every clip in the manifest, and nothing else', () => {
    expect(entries.map(([key]) => key).sort()).toEqual(manifestKeys());
    expect(entries.length).toBeGreaterThan(0);
  });

  it('has exactly one require() per clip, so nothing is silently dropped by the pattern above', () => {
    const code = source.split('\n').filter((line) => !/^\s*(\/\/|\/?\*)/.test(line)).join('\n');
    const requires = code.match(/require\(/g) ?? [];
    expect(requires.length).toBe(entries.length);
  });

  it('requires a real file for every clip, by a literal string Metro can analyse', () => {
    for (const [key, path] of entries) {
      expect(path, key).toMatch(/^\.\.\/\.\.\/assets\/voice\/.+\.m4a$/);
      expect(existsSync(resolve(__dirname, path)), `${key} -> ${path}`).toBe(true);
    }
  });

  it('points each key at the file the manifest names for it', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Record<string, string | boolean>;
    for (const [key, path] of entries) {
      expect(resolve(__dirname, path), key).toBe(resolve(APP_ROOT, manifest[key] as string));
    }
  });

  it('matches what the generator would write now, so a forgotten regenerate fails here', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Record<string, string | boolean>;
    expect(source).toBe(renderAssetMap(manifest));
  });
});
