import manifest from './manifest.json';

type Manifest = Record<string, string | string[]>;

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

/**
 * Which pack a clip came from, read back out of its path.
 *
 * The path is the single fact about a clip's origin, so nothing else records
 * it; a separate flag could disagree with where the file actually came from,
 * and then the in-app warning would be lying.
 */
export function packOf(key: string): string {
  return audioPath(key).split('/')[2];
}

export function isPlaceholder(key: string): boolean {
  return packOf(key).startsWith('placeholder-');
}

/** Every clip still waiting to be recorded, sorted. */
export function placeholderKeys(): string[] {
  return manifestKeys().filter(isPlaceholder);
}

/**
 * The clips that teach: the phonemes and the words.
 *
 * These are the ones a synthesised voice actively damages. Say /t/ with a
 * schwa after it -- "tuh", which is what every text-to-speech engine does with
 * a lone consonant -- and a child sounding out t-a-p hears "tuh-a-puh" and
 * never reaches "tap". The interface lines and the praise have no such
 * failure mode: a robot saying "Well done!" is unlovely, not harmful.
 *
 * So the two are counted separately, and only this one blocks putting the game
 * in front of a child.
 */
function isTeachingClip(key: string): boolean {
  return key.startsWith('ph.') || key.startsWith('wd.');
}

/**
 * True while any phoneme or word is still synthesised.
 *
 * This is the one that gates child testing, and the one the loud banner on the
 * home screen reads.
 */
export function hasPlaceholderTeachingClips(): boolean {
  return placeholderKeys().some(isTeachingClip);
}

/** True while any clip at all is still synthesised. A mixed pack is normal while recording is in progress. */
export function isMixedPack(): boolean {
  return placeholderKeys().length > 0;
}

/** Randomised so a child never hears the same praise twice in a row. */
export const PRAISE_KEYS: string[] = manifestKeys().filter((key) => key.startsWith('praise.'));

export const ENCOURAGE_KEYS: string[] = manifestKeys().filter((key) => key.startsWith('encourage.'));
