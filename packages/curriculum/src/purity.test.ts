import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname);
const PKG = join(SRC, '..', 'package.json');

/**
 * Bare specifiers a curriculum source file may import. Deliberately empty: the
 * package is pure data. Adding an entry here is an architectural decision, not
 * a convenience.
 */
const ALLOWED_BARE_IMPORTS: readonly string[] = [];

/** Every non-test .ts file under src, recursively. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [full] : [];
  });
}

/** Module specifiers from `import … from 'x'`, `export … from 'x'`, `import 'x'`, `import('x')`, `require('x')`. */
function specifiers(source: string): string[] {
  const patterns = [
    /\b(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  return patterns.flatMap((re) => [...source.matchAll(re)].map((m) => m[1]));
}

/**
 * The curriculum package must stay pure data. If this test fails, do not
 * delete it — move whatever you were adding into packages/api or apps/game.
 */
describe('curriculum purity', () => {
  it('declares no dependencies of any kind', () => {
    const pkg = JSON.parse(readFileSync(PKG, 'utf8')) as Record<string, Record<string, string> | undefined>;
    expect(pkg.dependencies ?? {}).toEqual({});
    expect(pkg.peerDependencies ?? {}).toEqual({});
    expect(pkg.optionalDependencies ?? {}).toEqual({});
  });

  it('finds at least the known source files, so the walk cannot silently match nothing', () => {
    const names = sourceFiles(SRC).map((f) => f.slice(SRC.length + 1));
    expect(names).toEqual(expect.arrayContaining(['index.ts', 'graphemes.ts', 'words.ts']));
  });

  it('extracts the specifiers a file really imports, so the import check cannot pass vacuously', () => {
    const read = (name: string) => readFileSync(join(SRC, name), 'utf8');
    expect(specifiers(read('lookups.ts')).sort()).toEqual(
      ['./creatures', './graphemes', './levels', './trickyWords', './types', './words'],
    );
    // Barrel re-exports, including multi-line `export type { … } from`.
    expect(specifiers(read('index.ts'))).toEqual(
      expect.arrayContaining(['./types', './graphemes', './words', './lookups']),
    );
    // Forms no real file uses today but the check must still see.
    expect(specifiers(`import 'a'; const b = require('b'); const c = await import('c');`).sort()).toEqual(
      ['a', 'b', 'c'],
    );
  });

  it('imports only relative modules inside src, or an explicitly allowed specifier', () => {
    for (const file of sourceFiles(SRC)) {
      for (const spec of specifiers(readFileSync(file, 'utf8'))) {
        if (spec.startsWith('./') || spec.startsWith('../')) {
          const target = resolve(dirname(file), spec);
          expect(
            target === SRC || target.startsWith(SRC + sep),
            `${file} imports ${spec}, which escapes src`,
          ).toBe(true);
        } else {
          expect(ALLOWED_BARE_IMPORTS, `${file} imports "${spec}"`).toContain(spec);
        }
      }
    }
  });

  it('reads neither the clock nor the global RNG', () => {
    for (const file of sourceFiles(SRC)) {
      const source = readFileSync(file, 'utf8');
      expect(source.includes('Date.now()'), `${file} reads the clock`).toBe(false);
      expect(source.includes('Math.random()'), `${file} reads the global RNG`).toBe(false);
    }
  });
});
