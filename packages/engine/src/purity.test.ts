import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname);
const PKG = join(SRC, '..', 'package.json');

/**
 * Bare specifiers an engine source file may import. The engine builds on the
 * curriculum's types and nothing else. Adding an entry here is an architectural
 * decision, not a convenience.
 */
const ALLOWED_BARE_IMPORTS: readonly string[] = ['@soundlings/curriculum'];

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
 * The engine is the product's moat, so it stays pure and fast to test. If this
 * fails, do not delete it — the thing you were adding belongs in apps/game, not
 * here.
 */
describe('engine purity', () => {
  it('depends only on the curriculum package', () => {
    const pkg = JSON.parse(readFileSync(PKG, 'utf8')) as Record<string, Record<string, string> | undefined>;
    expect(Object.keys(pkg.dependencies ?? {})).toEqual(['@soundlings/curriculum']);
    expect(pkg.peerDependencies ?? {}).toEqual({});
    expect(pkg.optionalDependencies ?? {}).toEqual({});
  });

  it('finds at least the known source files, so the walk cannot silently match nothing', () => {
    const names = sourceFiles(SRC).map((f) => f.slice(SRC.length + 1));
    expect(names).toEqual(expect.arrayContaining(['types.ts', 'config.ts', 'rng.ts', 'mastery.ts']));
  });

  it('extracts the specifiers a file really imports, so the import check cannot pass vacuously', () => {
    const read = (name: string) => readFileSync(join(SRC, name), 'utf8');
    expect(specifiers(read('mastery.ts')).sort()).toEqual(
      ['./config', './taskTypes', './types', './types', '@soundlings/curriculum'],
    );
    expect(specifiers(read('types.ts'))).toEqual(['@soundlings/curriculum']);
    // Forms no real file uses today but the check must still see.
    expect(specifiers(`import 'a'; const b = require('b'); const c = await import('c');`).sort()).toEqual(
      ['a', 'b', 'c'],
    );
    expect(specifiers(`export type {\n  X,\n  Y,\n} from './x';`)).toEqual(['./x']);
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

  it('reads neither the clock nor the global RNG — both are injected', () => {
    for (const file of sourceFiles(SRC)) {
      const source = readFileSync(file, 'utf8');
      expect(source.includes('Date.now()'), `${file} reads the clock`).toBe(false);
      expect(source.includes('Math.random()'), `${file} reads the global RNG`).toBe(false);
    }
  });

  it('makes no network calls', () => {
    // Not an import, so the specifier check cannot see it.
    for (const file of sourceFiles(SRC)) {
      expect(/\bfetch\(/.test(readFileSync(file, 'utf8')), `${file} calls fetch`).toBe(false);
    }
  });
});
