/**
 * The grown-up PIN: four digits, kept as a salted hash.
 *
 * Read this before "improving" it. The hash exists so that a PIN is not sitting
 * in device storage as plain digits, which would be gratuitous. It is NOT a
 * defence against anyone determined: there are only 10,000 four-digit PINs, so
 * any hash of one can be reversed in milliseconds, and a grown-up with the
 * device can simply clear its storage. The gate stops a five-year-old; the
 * threat model does not justify a crypto dependency, and slowing the hash would
 * only make the keypad feel sluggish to the person it is for.
 */

export interface StoredPin {
  salt: string;
  hash: string;
}

/** Exactly four ASCII digits. `\d` and `$` both let something else through. */
const PIN_FORMAT = /^[0-9]{4}$/;

export function isValidPinFormat(pin: string): boolean {
  return typeof pin === 'string' && PIN_FORMAT.test(pin);
}

/**
 * A 64-bit hash of the salt and PIN together, as 16 hex digits: two
 * independently seeded 32-bit mixes (the cyrb53 construction) side by side.
 * Deterministic, dependency-free, and spreads every one of the 10,000 possible
 * PINs to a different value.
 */
function mix(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

/** The salt's length leads, so no salt and PIN pair can read as another: ("a", "b1") and ("ab", "1") differ. */
export function hashPin(pin: string, salt: string): StoredPin {
  return { salt, hash: mix(`${salt.length}:${salt}:${pin}`) };
}

export function verifyPin(pin: string, stored: StoredPin): boolean {
  if (!isValidPinFormat(pin)) return false;
  if (typeof stored !== 'object' || stored === null) return false;
  if (typeof stored.salt !== 'string' || typeof stored.hash !== 'string') return false;
  return hashPin(pin, stored.salt).hash === stored.hash;
}

/**
 * A fresh salt. `Math.random` is fine here: the salt only has to differ between
 * devices, not be unguessable, and this file is not in a pure package.
 */
export function randomSalt(): string {
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}
