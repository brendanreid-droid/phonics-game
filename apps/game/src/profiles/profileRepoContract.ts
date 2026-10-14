import { describe, expect, it } from 'vitest';
import { AVATARS } from './avatars';
import type { ProfileRepo } from './ProfileRepo';

/**
 * The behaviour every ProfileRepo must have, run against each implementation.
 *
 * One suite rather than two, so the in-memory repo the tests use cannot drift
 * away from the AsyncStorage one a child actually relies on. Named and shaped
 * like describeProgressRepo in ../data/progressRepoContract.ts. `fresh`
 * returns a repository with no data.
 */
export function describeProfileRepo(name: string, fresh: () => ProfileRepo): void {
  describe(`ProfileRepo contract: ${name}`, () => {
    it('starts with no profiles and nobody selected', async () => {
      const repo = fresh();
      expect(await repo.list()).toEqual([]);
      expect(await repo.selectedId()).toBeNull();
    });

    it('creates a profile and returns it with an id', async () => {
      const repo = fresh();
      const created = await repo.create({ name: 'Ada', avatarId: AVATARS[0].id, now: 1000 });
      expect(created.name).toBe('Ada');
      expect(created.avatarId).toBe(AVATARS[0].id);
      expect(created.createdAt).toBe(1000);
      expect(created.lastPlayedOn).toBeNull();
      expect(created.id.length).toBeGreaterThan(0);
      expect(await repo.list()).toEqual([created]);
    });

    it('gives every profile a distinct id', async () => {
      const repo = fresh();
      const a = await repo.create({ name: 'Ada', avatarId: AVATARS[0].id, now: 1 });
      const b = await repo.create({ name: 'Bo', avatarId: AVATARS[1].id, now: 1 });
      expect(a.id).not.toBe(b.id);
    });

    it('never gives a new profile the id of one that was removed', async () => {
      // Progress is stored under the profile id. A reused id would hand a new
      // child the old child's mastery, creatures and trophies.
      const repo = fresh();
      const seen = new Set<string>();
      for (let i = 0; i < 20; i += 1) {
        const created = await repo.create({ name: `Kid${i}`, avatarId: AVATARS[0].id, now: 1 });
        expect(seen.has(created.id)).toBe(false);
        seen.add(created.id);
        await repo.remove(created.id);
      }
    });

    it('normalises the name on create', async () => {
      const repo = fresh();
      const created = await repo.create({ name: '  Mary   Jane ', avatarId: AVATARS[0].id, now: 1 });
      expect(created.name).toBe('Mary Jane');
      expect((await repo.list())[0].name).toBe('Mary Jane');
    });

    it('refuses a duplicate name, and stores nothing for the refused attempt', async () => {
      const repo = fresh();
      await repo.create({ name: 'Ada', avatarId: AVATARS[0].id, now: 1 });
      await expect(repo.create({ name: ' ada ', avatarId: AVATARS[1].id, now: 2 })).rejects.toThrow(/already/i);
      expect((await repo.list()).map((p) => p.name)).toEqual(['Ada']);
    });

    it('refuses an empty name', async () => {
      const repo = fresh();
      await expect(repo.create({ name: '   ', avatarId: AVATARS[0].id, now: 1 })).rejects.toThrow(/name/i);
      expect(await repo.list()).toEqual([]);
    });

    it('refuses an unknown avatar', async () => {
      const repo = fresh();
      await expect(repo.create({ name: 'Ada', avatarId: 'nope', now: 1 })).rejects.toThrow(/avatar/i);
      expect(await repo.list()).toEqual([]);
    });

    it('lets two profiles share a face; only names must differ', async () => {
      const repo = fresh();
      await repo.create({ name: 'Ada', avatarId: AVATARS[0].id, now: 1 });
      await repo.create({ name: 'Bo', avatarId: AVATARS[0].id, now: 2 });
      expect((await repo.list()).length).toBe(2);
    });

    it('lists profiles oldest first, so the order a child sees never shuffles', async () => {
      const repo = fresh();
      const a = await repo.create({ name: 'Ada', avatarId: AVATARS[0].id, now: 100 });
      const b = await repo.create({ name: 'Bo', avatarId: AVATARS[1].id, now: 50 });
      expect((await repo.list()).map((p) => p.id)).toEqual([b.id, a.id]);
    });

    it('keeps creation order for profiles made in the same instant', async () => {
      const repo = fresh();
      const names = ['Ada', 'Bo', 'Cy', 'Di', 'Ed'];
      for (const name of names) await repo.create({ name, avatarId: AVATARS[0].id, now: 7 });
      expect((await repo.list()).map((p) => p.name)).toEqual(names);
    });

    it('selects a profile and remembers it', async () => {
      const repo = fresh();
      const created = await repo.create({ name: 'Ada', avatarId: AVATARS[0].id, now: 1 });
      await repo.select(created.id);
      expect(await repo.selectedId()).toBe(created.id);
    });

    it('changes the selection to another profile', async () => {
      const repo = fresh();
      const a = await repo.create({ name: 'Ada', avatarId: AVATARS[0].id, now: 1 });
      const b = await repo.create({ name: 'Bo', avatarId: AVATARS[1].id, now: 2 });
      await repo.select(a.id);
      await repo.select(b.id);
      expect(await repo.selectedId()).toBe(b.id);
    });

    it('refuses to select a profile that does not exist, and keeps the old selection', async () => {
      const repo = fresh();
      const created = await repo.create({ name: 'Ada', avatarId: AVATARS[0].id, now: 1 });
      await repo.select(created.id);
      await expect(repo.select('nobody')).rejects.toThrow(/unknown profile/i);
      expect(await repo.selectedId()).toBe(created.id);
    });

    it('clears the selection', async () => {
      const repo = fresh();
      const created = await repo.create({ name: 'Ada', avatarId: AVATARS[0].id, now: 1 });
      await repo.select(created.id);
      await repo.select(null);
      expect(await repo.selectedId()).toBeNull();
    });

    describe('adopt (sync)', () => {
      const elsewhere = {
        id: '3f2b8a40-0000-4000-8000-000000000001',
        name: 'Zed',
        avatarId: AVATARS[1].id,
        createdAt: 50,
        lastPlayedOn: '2026-10-01',
      };

      it('adds a profile under the id it already has, keeping every field', async () => {
        const repo = fresh();
        await repo.adopt(elsewhere);
        expect(await repo.list()).toEqual([elsewhere]);
      });

      it('is idempotent: adopting again changes nothing, and does not overwrite', async () => {
        const repo = fresh();
        await repo.adopt(elsewhere);
        await repo.adopt({ ...elsewhere, name: 'Changed', lastPlayedOn: null });
        expect(await repo.list()).toEqual([elsewhere]);
      });

      it('keeps a child whose name matches one already here: refusing would lose their history', async () => {
        const repo = fresh();
        await repo.create({ name: 'Zed', avatarId: AVATARS[0].id, now: 10 });
        await repo.adopt(elsewhere);
        expect((await repo.list()).map((p) => p.id)).toHaveLength(2);
      });

      it('shows an avatar this build does not know as a face it does, rather than crash the picker', async () => {
        const repo = fresh();
        await repo.adopt({ ...elsewhere, avatarId: 'a-face-from-the-future' });
        expect((await repo.list())[0].avatarId).toBe(AVATARS[0].id);
      });

      it('can then be removed like any other profile', async () => {
        const repo = fresh();
        await repo.adopt(elsewhere);
        await repo.remove(elsewhere.id);
        expect(await repo.list()).toEqual([]);
      });
    });

    it('removes a profile', async () => {
      const repo = fresh();
      const created = await repo.create({ name: 'Ada', avatarId: AVATARS[0].id, now: 1 });
      await repo.remove(created.id);
      expect(await repo.list()).toEqual([]);
    });

    it('removes only the profile asked for', async () => {
      const repo = fresh();
      const keep = await repo.create({ name: 'Ada', avatarId: AVATARS[0].id, now: 1 });
      const drop = await repo.create({ name: 'Bo', avatarId: AVATARS[1].id, now: 2 });
      await repo.remove(drop.id);
      expect((await repo.list()).map((p) => p.id)).toEqual([keep.id]);
    });

    it('frees a name for reuse once its profile is removed', async () => {
      const repo = fresh();
      const first = await repo.create({ name: 'Ada', avatarId: AVATARS[0].id, now: 1 });
      await repo.remove(first.id);
      await expect(repo.create({ name: 'Ada', avatarId: AVATARS[0].id, now: 2 })).resolves.toBeDefined();
    });

    it('clears the selection when the selected profile is removed', async () => {
      const repo = fresh();
      const created = await repo.create({ name: 'Ada', avatarId: AVATARS[0].id, now: 1 });
      await repo.select(created.id);
      await repo.remove(created.id);
      expect(await repo.selectedId()).toBeNull();
    });

    it('leaves the selection alone when a different profile is removed', async () => {
      const repo = fresh();
      const keep = await repo.create({ name: 'Ada', avatarId: AVATARS[0].id, now: 1 });
      const drop = await repo.create({ name: 'Bo', avatarId: AVATARS[1].id, now: 2 });
      await repo.select(keep.id);
      await repo.remove(drop.id);
      expect(await repo.selectedId()).toBe(keep.id);
    });

    it('ignores removing a profile that is not there', async () => {
      const repo = fresh();
      await repo.create({ name: 'Ada', avatarId: AVATARS[0].id, now: 1 });
      await expect(repo.remove('nobody')).resolves.toBeUndefined();
      expect((await repo.list()).map((p) => p.name)).toEqual(['Ada']);
    });

    it('records the day a profile last played', async () => {
      const repo = fresh();
      const created = await repo.create({ name: 'Ada', avatarId: AVATARS[0].id, now: 1 });
      await repo.markPlayed(created.id, '2026-10-10');
      const [loaded] = await repo.list();
      expect(loaded.lastPlayedOn).toBe('2026-10-10');
    });

    it('records the day against the right profile only', async () => {
      const repo = fresh();
      const a = await repo.create({ name: 'Ada', avatarId: AVATARS[0].id, now: 1 });
      const b = await repo.create({ name: 'Bo', avatarId: AVATARS[1].id, now: 2 });
      await repo.markPlayed(b.id, '2026-10-10');
      const byId = Object.fromEntries((await repo.list()).map((p) => [p.id, p.lastPlayedOn]));
      expect(byId[a.id]).toBeNull();
      expect(byId[b.id]).toBe('2026-10-10');
    });

    it('ignores marking a profile that is not there, without inventing one', async () => {
      const repo = fresh();
      await expect(repo.markPlayed('nobody', '2026-10-10')).resolves.toBeUndefined();
      expect(await repo.list()).toEqual([]);
    });

    it('does not let a caller mutate stored profiles through the list it gets', async () => {
      const repo = fresh();
      await repo.create({ name: 'Ada', avatarId: AVATARS[0].id, now: 1 });
      const list = await repo.list();
      list[0].name = 'Tampered';
      list.pop();
      expect((await repo.list()).map((p) => p.name)).toEqual(['Ada']);
    });

    it('does not let a caller mutate the stored profile through the one create returned', async () => {
      const repo = fresh();
      const created = await repo.create({ name: 'Ada', avatarId: AVATARS[0].id, now: 1 });
      created.name = 'Tampered';
      created.lastPlayedOn = '1999-01-01';
      const [stored] = await repo.list();
      expect(stored.name).toBe('Ada');
      expect(stored.lastPlayedOn).toBeNull();
    });

    describe('overlapping calls', () => {
      it('keeps every profile when several are created at once', async () => {
        const repo = fresh();
        const names = ['Ada', 'Bo', 'Cy', 'Di', 'Ed', 'Flo'];
        await Promise.all(names.map((name, i) => repo.create({ name, avatarId: AVATARS[i].id, now: i })));
        expect((await repo.list()).map((p) => p.name)).toEqual(names);
      });

      it('lets only one of two simultaneous creates of the same name succeed', async () => {
        const repo = fresh();
        const results = await Promise.allSettled([
          repo.create({ name: 'Ada', avatarId: AVATARS[0].id, now: 1 }),
          repo.create({ name: 'ada', avatarId: AVATARS[1].id, now: 2 }),
        ]);
        expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
        expect((await repo.list()).length).toBe(1);
      });

      it('does not lose a play-day when it overlaps another write', async () => {
        const repo = fresh();
        const a = await repo.create({ name: 'Ada', avatarId: AVATARS[0].id, now: 1 });
        await Promise.all([
          repo.markPlayed(a.id, '2026-10-10'),
          repo.create({ name: 'Bo', avatarId: AVATARS[1].id, now: 2 }),
        ]);
        const byName = Object.fromEntries((await repo.list()).map((p) => [p.name, p.lastPlayedOn]));
        expect(byName).toEqual({ Ada: '2026-10-10', Bo: null });
      });
    });
  });
}
