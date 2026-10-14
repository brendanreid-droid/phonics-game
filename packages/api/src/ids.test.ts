import { describe, expect, it } from 'vitest';
import type { Attempt } from '@soundlings/engine';
import { isUuid, newUuid, remoteProfileId, stampIds, uuidFromText } from './ids';

const attempt = (over: Partial<Attempt> = {}): Attempt => ({
  sessionId: 's1',
  targetId: 's',
  skill: 'SOUND_ID',
  taskTypeId: 'SOUND_HUNT',
  correct: true,
  scaffolded: false,
  latencyMs: 1200,
  weight: 1,
  at: 1000,
  ...over,
});

describe('uuids', () => {
  it('makes well-formed random UUIDs that differ', () => {
    const a = newUuid();
    expect(isUuid(a)).toBe(true);
    expect(newUuid()).not.toBe(a);
  });

  it('takes an injected random source, for deterministic tests', () => {
    expect(newUuid(() => 0.5)).toBe(newUuid(() => 0.5));
  });

  it('derives the same UUID from the same text and a different one from different text', () => {
    expect(isUuid(uuidFromText('hello'))).toBe(true);
    expect(uuidFromText('hello')).toBe(uuidFromText('hello'));
    expect(uuidFromText('hello')).not.toBe(uuidFromText('hellp'));
  });
});

describe('remoteProfileId', () => {
  it('keeps a profile that already has a UUID exactly as it is', () => {
    const id = newUuid();
    expect(remoteProfileId('parent-a', id)).toBe(id);
  });

  it('maps a legacy local id to a stable UUID, the same on every device', () => {
    const mapped = remoteProfileId('parent-a', 'mhx1-abc');
    expect(isUuid(mapped)).toBe(true);
    expect(remoteProfileId('parent-a', 'mhx1-abc')).toBe(mapped);
  });

  it('gives two parents with the same local id different server ids', () => {
    expect(remoteProfileId('parent-a', 'mhx1-abc')).not.toBe(remoteProfileId('parent-b', 'mhx1-abc'));
  });
});

describe('stampIds', () => {
  it('never changes an id an attempt already has', () => {
    const id = newUuid();
    expect(stampIds('p', [attempt({ id })])[0].id).toBe(id);
  });

  it('stamps a legacy attempt the same way every time', () => {
    const first = stampIds('p', [attempt()])[0].id;
    expect(isUuid(first)).toBe(true);
    expect(stampIds('p', [attempt()])[0].id).toBe(first);
  });

  it('keeps two identical answers distinct, so neither is lost to de-duplication', () => {
    const [a, b] = stampIds('p', [attempt(), attempt()]);
    expect(a.id).not.toBe(b.id);
  });

  it('does not depend on where in the log an attempt sits', () => {
    const x = attempt({ at: 1 });
    const y = attempt({ at: 2 });
    const forward = stampIds('p', [x, y]);
    const backward = stampIds('p', [y, x]);
    expect(backward[1].id).toBe(forward[0].id);
    expect(backward[0].id).toBe(forward[1].id);
  });

  it('gives the same attempt a different id under a different profile', () => {
    expect(stampIds('p1', [attempt()])[0].id).not.toBe(stampIds('p2', [attempt()])[0].id);
  });
});
