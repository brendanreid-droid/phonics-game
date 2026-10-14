import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname);

/**
 * The two files that decide whether a child's history survives a sync. They take
 * values in and return values out; the moment one of them can touch storage,
 * the network or the clock, its tests stop describing what runs on a device.
 */
const PURE_FILES = ['rebuild.ts', 'syncQueue.ts'];
const ALLOWED_BARE_IMPORTS = ['@soundlings/engine', '@soundlings/curriculum'];

function specifiers(source: string): string[] {
  const patterns = [
    /\b(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  return patterns.flatMap((re) => [...source.matchAll(re)].map((m) => m[1]));
}

describe('the pure sync files stay pure', () => {
  it('finds the files and the specifiers it is checking, so it cannot pass vacuously', () => {
    const rebuild = readFileSync(join(SRC, 'rebuild.ts'), 'utf8');
    expect(specifiers(rebuild).sort()).toEqual(['@soundlings/curriculum', '@soundlings/engine', '@soundlings/engine']);
    expect(specifiers(`import 'a'; require('b'); import('c');`).sort()).toEqual(['a', 'b', 'c']);
  });

  for (const name of PURE_FILES) {
    const source = readFileSync(join(SRC, name), 'utf8');

    it(`${name} imports only the engine and curriculum`, () => {
      for (const spec of specifiers(source)) expect(ALLOWED_BARE_IMPORTS, `${name} imports "${spec}"`).toContain(spec);
    });

    it(`${name} reads no clock, no global RNG, and makes no network call`, () => {
      expect(source.includes('Date.now()'), 'reads the clock').toBe(false);
      expect(source.includes('Math.random()'), 'reads the global RNG').toBe(false);
      expect(/\bfetch\(/.test(source), 'calls fetch').toBe(false);
      expect(/\bnew Date\(\)/.test(source), 'reads the clock').toBe(false);
    });
  }
});
