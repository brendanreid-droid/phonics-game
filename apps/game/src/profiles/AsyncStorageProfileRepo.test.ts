import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A fake AsyncStorage, the same one AsyncStorageProgressRepo.test.ts uses (see
 * there for why): a string-to-string map with a real async gap on every call,
 * so overlapping operations genuinely interleave, and switches to make
 * individual operations fail.
 */
const fake = vi.hoisted(() => {
  const state = {
    data: new Map<string, string>(),
    failGet: (_key: string): boolean => false,
    failSet: (_key: string): boolean => false,
  };
  const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
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
        state.data.delete(key);
      },
    },
  };
});

vi.mock('@react-native-async-storage/async-storage', () => ({ default: fake.module }));

import { AVATARS } from './avatars';
import { AsyncStorageProfileRepo } from './AsyncStorageProfileRepo';
import { describeProfileRepo } from './profileRepoContract';

beforeEach(() => {
  fake.state.data.clear();
  fake.state.failGet = () => false;
  fake.state.failSet = () => false;
});

describeProfileRepo('AsyncStorageProfileRepo', () => new AsyncStorageProfileRepo());

const ADA = { name: 'Ada', avatarId: AVATARS[0].id, now: 1 };
const BO = { name: 'Bo', avatarId: AVATARS[1].id, now: 2 };

describe('AsyncStorageProfileRepo on a device', () => {
  it('survives the app being killed: a new instance sees the profiles and the selection', async () => {
    const first = new AsyncStorageProfileRepo();
    const ada = await first.create(ADA);
    await first.create(BO);
    await first.select(ada.id);
    await first.markPlayed(ada.id, '2026-10-10');

    const afterRestart = new AsyncStorageProfileRepo();
    const list = await afterRestart.list();
    expect(list.map((p) => p.name)).toEqual(['Ada', 'Bo']);
    expect(list[0].lastPlayedOn).toBe('2026-10-10');
    expect(await afterRestart.selectedId()).toBe(ada.id);
  });

  it('removes the stored selection when it is cleared, rather than storing "null"', async () => {
    const repo = new AsyncStorageProfileRepo();
    const ada = await repo.create(ADA);
    await repo.select(ada.id);
    expect(fake.state.data.has('soundlings/selectedProfile')).toBe(true);
    await repo.select(null);
    expect(fake.state.data.has('soundlings/selectedProfile')).toBe(false);
  });

  it('forgets the stored selection key itself when its profile is removed, not just in effect', async () => {
    const repo = new AsyncStorageProfileRepo();
    const ada = await repo.create(ADA);
    await repo.select(ada.id);
    await repo.remove(ada.id);
    expect(fake.state.data.has('soundlings/selectedProfile')).toBe(false);
  });

  it('gives distinct ids even if the random source repeats itself', async () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      const repo = new AsyncStorageProfileRepo();
      const a = await repo.create(ADA);
      const b = await repo.create({ ...BO, now: ADA.now });
      expect(a.id).not.toBe(b.id);
    } finally {
      random.mockRestore();
    }
  });

  describe('when storage misbehaves', () => {
    it('REJECTS create when the write fails: a profile that did not save must not look saved', async () => {
      const repo = new AsyncStorageProfileRepo();
      fake.state.failSet = (key) => key === 'soundlings/profiles';
      await expect(repo.create(ADA)).rejects.toThrow(/disk full/);

      fake.state.failSet = () => false;
      expect(await repo.list()).toEqual([]);
    });

    it('keeps working after a failed create: one failure does not wedge the queue', async () => {
      const repo = new AsyncStorageProfileRepo();
      fake.state.failSet = () => true;
      await expect(repo.create(ADA)).rejects.toThrow();
      fake.state.failSet = () => false;
      await repo.create(BO);
      expect((await repo.list()).map((p) => p.name)).toEqual(['Bo']);
    });

    it('REJECTS remove when the write fails, and the profile is still there', async () => {
      const repo = new AsyncStorageProfileRepo();
      const ada = await repo.create(ADA);
      fake.state.failSet = () => true;
      await expect(repo.remove(ada.id)).rejects.toThrow();
      fake.state.failSet = () => false;
      expect((await repo.list()).length).toBe(1);
    });

    it('never overwrites the list when a read fails: create refuses instead', async () => {
      const repo = new AsyncStorageProfileRepo();
      await repo.create(ADA);
      await repo.create(BO);
      const before = fake.state.data.get('soundlings/profiles');

      fake.state.failGet = (key) => key === 'soundlings/profiles';
      await expect(repo.create({ name: 'Cy', avatarId: AVATARS[2].id, now: 3 })).rejects.toThrow(/read/i);
      expect(fake.state.data.get('soundlings/profiles')).toBe(before);

      fake.state.failGet = () => false;
      expect((await repo.list()).map((p) => p.name)).toEqual(['Ada', 'Bo']);
    });

    it('never overwrites the list when a read fails: remove and markPlayed do not write either', async () => {
      const repo = new AsyncStorageProfileRepo();
      const ada = await repo.create(ADA);
      await repo.create(BO);
      const before = fake.state.data.get('soundlings/profiles');

      fake.state.failGet = (key) => key === 'soundlings/profiles';
      await expect(repo.remove(ada.id)).rejects.toThrow(/read/i);
      await expect(repo.markPlayed(ada.id, '2026-10-10')).resolves.toBeUndefined();
      expect(fake.state.data.get('soundlings/profiles')).toBe(before);
    });

    it('does not throw from list or selectedId when storage is unreadable', async () => {
      const repo = new AsyncStorageProfileRepo();
      const ada = await repo.create(ADA);
      await repo.select(ada.id);
      fake.state.failGet = () => true;
      expect(await repo.list()).toEqual([]);
      expect(await repo.selectedId()).toBeNull();
    });

    it('does not throw from markPlayed or select(null) when storage is full', async () => {
      const repo = new AsyncStorageProfileRepo();
      const ada = await repo.create(ADA);
      await repo.select(ada.id);
      fake.state.failSet = () => true;
      await expect(repo.markPlayed(ada.id, '2026-10-10')).resolves.toBeUndefined();
      await expect(repo.select(ada.id)).resolves.toBeUndefined();
      await expect(repo.select(null)).resolves.toBeUndefined();
    });

    it('quarantines an unparseable list instead of silently destroying it, then carries on', async () => {
      fake.state.data.set('soundlings/profiles', '[{"id":"x","name":"Ad');
      const repo = new AsyncStorageProfileRepo();

      expect(await repo.list()).toEqual([]);
      await repo.create(ADA);

      expect((await repo.list()).map((p) => p.name)).toEqual(['Ada']);
      expect(fake.state.data.get('soundlings/profiles.corrupt')).toBe('[{"id":"x","name":"Ad');
    });

    it('treats valid JSON of the wrong shape as damaged, not as profiles', async () => {
      fake.state.data.set('soundlings/profiles', '{"not":"an array"}');
      const repo = new AsyncStorageProfileRepo();
      expect(await repo.list()).toEqual([]);
      await repo.create(ADA);
      expect(fake.state.data.get('soundlings/profiles.corrupt')).toBe('{"not":"an array"}');
    });

    it('keeps the sound profiles when only some entries are damaged, and sets the original aside', async () => {
      const good = { id: 'g1', name: 'Ada', avatarId: 'fox', createdAt: 1, lastPlayedOn: null };
      const raw = JSON.stringify([good, { id: 7 }, null, 'nope']);
      fake.state.data.set('soundlings/profiles', raw);
      const repo = new AsyncStorageProfileRepo();

      expect(await repo.list()).toEqual([good]);
      await repo.create(BO);

      expect((await repo.list()).map((p) => p.name)).toEqual(['Ada', 'Bo']);
      expect(fake.state.data.get('soundlings/profiles.corrupt')).toBe(raw);
    });

    it('does not report a selection whose profile has gone', async () => {
      fake.state.data.set('soundlings/selectedProfile', 'ghost');
      expect(await new AsyncStorageProfileRepo().selectedId()).toBeNull();
    });

    it('does not report a selection when the list is lost, rather than pointing at nobody', async () => {
      const repo = new AsyncStorageProfileRepo();
      const ada = await repo.create(ADA);
      await repo.select(ada.id);
      fake.state.data.delete('soundlings/profiles');
      expect(await repo.selectedId()).toBeNull();
    });

    it('still forgets the selection on remove when clearing the stored key fails', async () => {
      const repo = new AsyncStorageProfileRepo();
      const ada = await repo.create(ADA);
      await repo.select(ada.id);
      const realRemove = fake.module.removeItem;
      fake.module.removeItem = async () => {
        throw new Error('storage unavailable');
      };
      try {
        await repo.remove(ada.id);
      } finally {
        fake.module.removeItem = realRemove;
      }
      expect(await repo.selectedId()).toBeNull();
    });
  });
});
