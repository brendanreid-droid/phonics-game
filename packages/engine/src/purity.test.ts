import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname);
const PKG = join(__dirname, '..', 'package.json');

/**
 * The engine is the product's moat, so it stays pure and fast to test. If this
 * fails, the thing you were adding belongs in apps/game, not here.
 */
describe('engine purity', () => {
  it('depends only on the curriculum package', () => {
    const pkg = JSON.parse(readFileSync(PKG, 'utf8')) as { dependencies?: Record<string, string> };
    expect(Object.keys(pkg.dependencies ?? {})).toEqual(['@soundlings/curriculum']);
  });

  it('imports no React, React Native, or network client', () => {
    const banned = [/from ['"]react/, /from ['"]react-native/, /from ['"]axios/, /\bfetch\(/];
    for (const file of sourceFiles()) {
      const source = readFileSync(join(SRC, file), 'utf8');
      for (const pattern of banned) {
        expect(pattern.test(source), `${file} matches ${pattern}`).toBe(false);
      }
    }
  });

  it('reads neither the clock nor the global RNG — both are injected', () => {
    for (const file of sourceFiles()) {
      const source = readFileSync(join(SRC, file), 'utf8');
      expect(source.includes('Date.now()'), `${file} reads the clock`).toBe(false);
      expect(source.includes('Math.random()'), `${file} reads the global RNG`).toBe(false);
    }
  });
});

function sourceFiles(): string[] {
  return readdirSync(SRC).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
}
