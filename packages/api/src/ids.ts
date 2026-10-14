import type { Attempt } from '@soundlings/engine';

/** An attempt that is certain to carry an id, which is what the server stores. */
export type IdentifiedAttempt = Attempt & { id: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

/**
 * A random version-4 UUID. `random` returns a float in [0, 1); it defaults to
 * the platform's crypto source and falls back to Math.random where that is
 * missing (older React Native runtimes). An attempt id has to be unique, not
 * secret, so the weaker source is acceptable.
 */
export function newUuid(random?: () => number): string {
  const bytes = new Uint8Array(16);
  const crypto = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (random === undefined && typeof crypto?.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    const next = random ?? Math.random;
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(next() * 256);
  }
  return formatUuid(bytes);
}

function formatUuid(bytes: Uint8Array): string {
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * A UUID derived from text, the same every time. cyrb128: four 32-bit lanes of a
 * non-cryptographic hash. Used to give stable server ids to things that
 * predate sync and so have none. Collisions between two different inputs would
 * need 2^64 of them by chance, and nothing here is adversarial: the input is a
 * child's own record.
 */
export function uuidFromText(text: string): string {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < text.length; i += 1) {
    const k = text.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  const bytes = new Uint8Array(16);
  [h1 ^ h2 ^ h3 ^ h4, h2 ^ h1, h3 ^ h1, h4 ^ h1].forEach((word, lane) => {
    for (let b = 0; b < 4; b += 1) bytes[lane * 4 + b] = (word >>> (24 - 8 * b)) & 0xff;
  });
  return formatUuid(bytes);
}

/**
 * The id a profile has on the server.
 *
 * New profiles are created with a UUID and keep it. A profile made before sync
 * existed has a short local id that the server's uuid column would reject, so
 * it is mapped to a stable UUID derived from the signed-in parent and its local
 * id. Deriving it, rather than storing a mapping, means every device computes
 * the same answer with nothing to keep in step.
 */
export function remoteProfileId(parentId: string, localId: string): string {
  return isUuid(localId) ? localId.toLowerCase() : uuidFromText(`profile|${parentId}|${localId}`);
}

/**
 * Gives every attempt an id, without ever changing one that has it.
 *
 * An attempt written before sync existed has none. Its id is derived from its
 * contents, plus a count of identical earlier attempts so that two genuinely
 * identical answers (the same tap, twice, in the same millisecond) remain two.
 * Derived rather than random so that stamping the same log twice, on this
 * device or another, yields the same ids: a crash between pushing and
 * remembering that it pushed cannot then duplicate anything.
 */
export function stampIds(profileId: string, attempts: readonly Attempt[]): IdentifiedAttempt[] {
  const seen = new Map<string, number>();
  return attempts.map((attempt) => {
    if (attempt.id !== undefined) return attempt as IdentifiedAttempt;
    const content = [
      profileId,
      attempt.sessionId,
      attempt.targetId,
      attempt.skill,
      attempt.taskTypeId,
      attempt.correct,
      attempt.scaffolded,
      attempt.latencyMs,
      attempt.weight,
      attempt.chosen ?? '',
      attempt.at,
    ].join('|');
    const nth = seen.get(content) ?? 0;
    seen.set(content, nth + 1);
    return { ...attempt, id: uuidFromText(`attempt|${content}|${nth}`) };
  });
}
