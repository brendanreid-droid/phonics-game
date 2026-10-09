import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname);
const PKG = join(__dirname, '..', 'package.json');

/**
 * The curriculum package must stay pure data. If this test fails, do not
 * delete it — move whatever you were adding into packages/api or apps/game.
 */
describe('curriculum purity', () => {
  it('declares no runtime dependencies', () => {
    const pkg = JSON.parse(readFileSync(PKG, 'utf8')) as { dependencies?: Record<string, string> };
    expect(pkg.dependencies ?? {}).toEqual({});
  });

  it('imports no React, network client, or filesystem module', () => {
    const banned = [/from ['"]react/, /from ['"]react-native/, /from ['"]node:fs/, /\bfetch\(/, /from ['"]axios/];
    const files = readdirSync(SRC).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    for (const file of files) {
      const source = readFileSync(join(SRC, file), 'utf8');
      for (const pattern of banned) {
        expect(pattern.test(source), `${file} matches ${pattern}`).toBe(false);
      }
    }
  });

  it('reads neither the clock nor the global RNG', () => {
    const files = readdirSync(SRC).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    for (const file of files) {
      const source = readFileSync(join(SRC, file), 'utf8');
      expect(source.includes('Date.now()'), `${file} reads the clock`).toBe(false);
      expect(source.includes('Math.random()'), `${file} reads the global RNG`).toBe(false);
    }
  });
});
