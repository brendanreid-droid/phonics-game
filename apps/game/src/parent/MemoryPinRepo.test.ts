import { describe, expect, it } from 'vitest';
import { MemoryPinRepo } from './MemoryPinRepo';
import { describePinRepo } from './pinRepoContract';

describePinRepo('MemoryPinRepo', () => new MemoryPinRepo());

describe('MemoryPinRepo', () => {
  it('uses a fresh salt for each PIN it sets', async () => {
    let n = 0;
    const salts: string[] = [];
    const repo = new MemoryPinRepo(() => {
      n += 1;
      salts.push(`salt-${n}`);
      return `salt-${n}`;
    });
    await repo.set('1234');
    await repo.set('1234');
    expect(salts).toEqual(['salt-1', 'salt-2']);
  });
});
