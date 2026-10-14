import { describe, expect, it } from 'vitest';
import type { PinRepo } from './PinRepo';

/**
 * The behaviour every PinRepo must have, run against each implementation.
 *
 * One suite rather than two, so the in-memory repo the tests use cannot drift
 * away from the AsyncStorage one a grown-up actually relies on. Shaped like
 * describeProfileRepo in ../profiles/profileRepoContract.ts. `fresh` returns a
 * repository with no PIN set.
 */
export function describePinRepo(name: string, fresh: () => PinRepo): void {
  describe(`PinRepo contract: ${name}`, () => {
    it('starts with no PIN set', async () => {
      expect(await fresh().isSet()).toBe(false);
    });

    it('opens nothing when no PIN is set, whatever is typed', async () => {
      const repo = fresh();
      expect(await repo.verify('0000')).toBe(false);
      expect(await repo.verify('1234')).toBe(false);
    });

    it('remembers a PIN once set', async () => {
      const repo = fresh();
      await repo.set('1234');
      expect(await repo.isSet()).toBe(true);
    });

    it('accepts the PIN that was set', async () => {
      const repo = fresh();
      await repo.set('4821');
      expect(await repo.verify('4821')).toBe(true);
    });

    it('rejects every other PIN', async () => {
      const repo = fresh();
      await repo.set('4821');
      for (const wrong of ['4822', '1284', '0000', '', '482', '48211', 'abcd']) {
        expect(await repo.verify(wrong), wrong).toBe(false);
      }
    });

    it('treats a leading zero as a digit', async () => {
      const repo = fresh();
      await repo.set('0123');
      expect(await repo.verify('0123')).toBe(true);
      expect(await repo.verify('123')).toBe(false);
    });

    it('replaces the PIN when set again', async () => {
      const repo = fresh();
      await repo.set('1111');
      await repo.set('2222');
      expect(await repo.verify('2222')).toBe(true);
      expect(await repo.verify('1111')).toBe(false);
    });

    it('refuses a PIN that is not four digits, and keeps the one it had', async () => {
      const repo = fresh();
      await repo.set('1234');
      for (const bad of ['123', '12345', 'abcd', '12 4', '']) {
        await expect(repo.set(bad), bad).rejects.toThrow(/four digits/i);
      }
      expect(await repo.verify('1234')).toBe(true);
    });

    it('refuses a bad PIN without setting one, when none was set', async () => {
      const repo = fresh();
      await expect(repo.set('12')).rejects.toThrow();
      expect(await repo.isSet()).toBe(false);
    });

    it('clears the PIN, so the old one no longer opens anything', async () => {
      const repo = fresh();
      await repo.set('1234');
      await repo.clear();
      expect(await repo.isSet()).toBe(false);
      expect(await repo.verify('1234')).toBe(false);
    });

    it('lets a new PIN be set after clearing', async () => {
      const repo = fresh();
      await repo.set('1234');
      await repo.clear();
      await repo.set('9876');
      expect(await repo.verify('9876')).toBe(true);
      expect(await repo.verify('1234')).toBe(false);
    });

    it('ignores clearing when nothing is set', async () => {
      const repo = fresh();
      await expect(repo.clear()).resolves.toBeUndefined();
      expect(await repo.isSet()).toBe(false);
    });

    describe('overlapping calls', () => {
      it('ends on the last PIN set when several are set at once', async () => {
        const repo = fresh();
        await Promise.all([repo.set('1111'), repo.set('2222'), repo.set('3333')]);
        expect(await repo.verify('3333')).toBe(true);
        expect(await repo.verify('1111')).toBe(false);
        expect(await repo.verify('2222')).toBe(false);
      });

      it('ends cleared when a clear is the last of overlapping calls', async () => {
        const repo = fresh();
        await Promise.all([repo.set('1111'), repo.clear()]);
        expect(await repo.isSet()).toBe(false);
      });

      it('ends set when a set is the last of overlapping calls', async () => {
        const repo = fresh();
        await repo.set('1111');
        await Promise.all([repo.clear(), repo.set('2222')]);
        expect(await repo.verify('2222')).toBe(true);
      });
    });
  });
}
