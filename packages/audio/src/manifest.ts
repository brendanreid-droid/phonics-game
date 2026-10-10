import manifest from './manifest.json';

type Manifest = Record<string, string | boolean>;

const RAW = manifest as unknown as Manifest;

/** Manifest keys beginning with `_` are metadata, not clips. */
function isClipKey(key: string): boolean {
  return !key.startsWith('_');
}

export function manifestKeys(): string[] {
  return Object.keys(RAW).filter(isClipKey).sort();
}

export function hasAudio(key: string): boolean {
  return isClipKey(key) && typeof RAW[key] === 'string';
}

/**
 * The asset path for an audio key, relative to the app root.
 *
 * Throws rather than returning undefined. A missing clip that fails silently
 * means a child sits looking at a screen that asked them nothing, which is far
 * worse than a loud failure in development.
 */
export function audioPath(key: string): string {
  const value = RAW[key];
  if (!isClipKey(key) || typeof value !== 'string') throw new Error(`Unknown audio key: ${key}`);
  return value;
}

/** True while the bundled pack is machine-generated rather than recorded. */
export function isPlaceholderPack(): boolean {
  return RAW._placeholder === true;
}

export function packName(): string {
  return typeof RAW._pack === 'string' ? RAW._pack : 'unknown';
}

/** Randomised so a child never hears the same praise twice in a row. */
export const PRAISE_KEYS: string[] = manifestKeys().filter((key) => key.startsWith('praise.'));

export const ENCOURAGE_KEYS: string[] = manifestKeys().filter((key) => key.startsWith('encourage.'));
