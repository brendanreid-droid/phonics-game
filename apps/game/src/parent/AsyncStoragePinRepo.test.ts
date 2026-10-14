import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A fake AsyncStorage, the same one AsyncStorageProfileRepo.test.ts uses: a
 * string-to-string map with a real async gap on every call, so overlapping
 * operations genuinely interleave, and switches to make operations fail.
 */
const fake = vi.hoisted(() => {
  const state = {
    data: new Map<string, string>(),
    failGet: (_key: string): boolean => false,
    failSet: (_key: string): boolean => false,
    failRemove: (_key: string): boolean => false,
    /** Extra milliseconds the next calls take, so one write can be made to finish after a later one. */
    delays: [] as number[],
  };
  const tick = () => new Promise<void>((resolve) => setTimeout(resolve, state.delays.shift() ?? 0));
  return {
    state,
    module: {
      getItem: async (key: string) => {
        await tick();
        if (state.failGet(key)) throw new Error('storage unavailable');
        return state.data.get(key) ?? null;
      },
      setItem: async (key: string, value: string) => {
        await tick();
        if (state.failSet(key)) throw new Error('disk full');
        state.data.set(key, value);
      },
      removeItem: async (key: string) => {
        await tick();
        if (state.failRemove(key)) throw new Error('storage unavailable');
        state.data.delete(key);
      },
    },
  };
});

vi.mock('@react-native-async-storage/async-storage', () => ({ default: fake.module }));

import { AsyncStoragePinRepo } from './AsyncStoragePinRepo';
import { describePinRepo } from './pinRepoContract';

const KEY = 'soundlings/parentPin';

beforeEach(() => {
  fake.state.data.clear();
  fake.state.failGet = () => false;
  fake.state.failSet = () => false;
  fake.state.failRemove = () => false;
  fake.state.delays = [];
});

describePinRepo('AsyncStoragePinRepo', () => new AsyncStoragePinRepo());

describe('AsyncStoragePinRepo on a device', () => {
  it('survives the app being killed: a new instance still knows the PIN', async () => {
    await new AsyncStoragePinRepo().set('4821');
    const afterRestart = new AsyncStoragePinRepo();
    expect(await afterRestart.isSet()).toBe(true);
    expect(await afterRestart.verify('4821')).toBe(true);
    expect(await afterRestart.verify('4822')).toBe(false);
  });

  it('never writes the digits to storage', async () => {
    await new AsyncStoragePinRepo().set('4821');
    const raw = fake.state.data.get(KEY);
    expect(raw).toBeDefined();
    expect(raw).not.toContain('4821');
  });

  it('writes a different stored value for the same PIN on different devices', async () => {
    let n = 0;
    await new AsyncStoragePinRepo(() => `device-${(n += 1)}`).set('4821');
    const first = fake.state.data.get(KEY);
    await new AsyncStoragePinRepo(() => `device-${(n += 1)}`).set('4821');
    expect(fake.state.data.get(KEY)).not.toBe(first);
  });

  it('removes the stored value on clear rather than storing something empty', async () => {
    const repo = new AsyncStoragePinRepo();
    await repo.set('1234');
    await repo.clear();
    expect(fake.state.data.has(KEY)).toBe(false);
  });

  it('applies overlapping writes in the order they were made, even when an earlier one is slower', async () => {
    // Without the queue the slow first write would land last and the grown-up's
    // newest PIN would be silently replaced by the one before it.
    const repo = new AsyncStoragePinRepo();
    fake.state.delays = [40];
    await Promise.all([repo.set('1111'), repo.set('2222')]);
    expect(await repo.verify('2222')).toBe(true);
    expect(await repo.verify('1111')).toBe(false);
  });

  it('does not let a slow clear land after a newer set', async () => {
    const repo = new AsyncStoragePinRepo();
    await repo.set('1111');
    fake.state.delays = [40];
    await Promise.all([repo.clear(), repo.set('2222')]);
    expect(await repo.verify('2222')).toBe(true);
  });

  describe('when storage misbehaves', () => {
    it('REJECTS set when the write fails: a PIN that did not save must not look saved', async () => {
      const repo = new AsyncStoragePinRepo();
      fake.state.failSet = () => true;
      await expect(repo.set('1234')).rejects.toThrow(/disk full/);
      fake.state.failSet = () => false;
      expect(await repo.isSet()).toBe(false);
    });

    it('keeps the old PIN when replacing it fails', async () => {
      const repo = new AsyncStoragePinRepo();
      await repo.set('1111');
      fake.state.failSet = () => true;
      await expect(repo.set('2222')).rejects.toThrow();
      fake.state.failSet = () => false;
      expect(await repo.verify('1111')).toBe(true);
    });

    it('REJECTS clear when it cannot remove the PIN: a reset that did not happen must not look done', async () => {
      const repo = new AsyncStoragePinRepo();
      await repo.set('1234');
      fake.state.failRemove = () => true;
      await expect(repo.clear()).rejects.toThrow(/unavailable/);
      fake.state.failRemove = () => false;
      expect(await repo.verify('1234')).toBe(true);
    });

    it('keeps working after a failed write: one failure does not wedge the queue', async () => {
      const repo = new AsyncStoragePinRepo();
      fake.state.failSet = () => true;
      await expect(repo.set('1111')).rejects.toThrow();
      fake.state.failSet = () => false;
      await repo.set('2222');
      expect(await repo.verify('2222')).toBe(true);
    });

    it('keeps the gate shut, not open, when the PIN cannot be read', async () => {
      // Reading "no PIN" here would put the choose-a-PIN screen in front of a
      // child. A transient failure should look like a PIN that cannot be matched.
      const repo = new AsyncStoragePinRepo();
      await repo.set('1234');
      fake.state.failGet = () => true;
      expect(await repo.isSet()).toBe(true);
      expect(await repo.verify('1234')).toBe(false);
      fake.state.failGet = () => false;
      expect(await repo.verify('1234')).toBe(true);
    });

    it('treats a damaged stored value as no PIN, so a grown-up is never locked out for good', async () => {
      for (const damaged of ['{"salt":"x"', '"just a string"', '42', '{"salt":"x"}', '{"salt":"","hash":""}', 'null']) {
        fake.state.data.set(KEY, damaged);
        const repo = new AsyncStoragePinRepo();
        expect(await repo.isSet(), damaged).toBe(false);
        expect(await repo.verify('1234'), damaged).toBe(false);
        await repo.set('1234');
        expect(await repo.verify('1234'), damaged).toBe(true);
      }
    });
  });
});
