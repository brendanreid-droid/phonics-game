import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, emptyRecord } from '@soundlings/engine';
import { MemoryProgressRepo } from '../data/MemoryProgressRepo';
import type { ProgressRepo } from '../data/ProgressRepo';
import { deleteProfile } from './deleteProfile';
import { MemoryProfileRepo } from './MemoryProfileRepo';
import type { ProfileRepo } from './ProfileRepo';

async function setup() {
  const profiles = new MemoryProfileRepo();
  const progress = new MemoryProgressRepo();
  const a = await profiles.create({ name: 'Ada', avatarId: 'fox', now: 1 });
  const b = await profiles.create({ name: 'Ben', avatarId: 'frog', now: 2 });
  for (const p of [a, b]) {
    await progress.saveMastery(p.id, { 's::SOUND_ID': emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG) });
    await progress.markPlayedOn(p.id, '2026-10-10');
    await progress.markLevelComplete(p.id, 1, 5);
  }
  return { profiles, progress, a, b };
}

describe('deleteProfile', () => {
  it('removes the profile and all of that child\'s progress', async () => {
    const { profiles, progress, a } = await setup();
    await deleteProfile(a.id, profiles, progress);
    expect((await profiles.list()).map((p) => p.id)).not.toContain(a.id);
    expect(await progress.loadMastery(a.id)).toEqual({});
    expect(await progress.loadPlayedDates(a.id)).toEqual([]);
    expect(await progress.loadCompletions(a.id)).toEqual({});
  });

  it('touches nothing of any other child', async () => {
    const { profiles, progress, a, b } = await setup();
    await deleteProfile(a.id, profiles, progress);
    expect((await profiles.list()).map((p) => p.id)).toEqual([b.id]);
    expect(Object.keys(await progress.loadMastery(b.id))).toEqual(['s::SOUND_ID']);
    expect(await progress.loadPlayedDates(b.id)).toEqual(['2026-10-10']);
    expect(await progress.loadCompletions(b.id)).toEqual({ 1: 5 });
  });

  it('clears progress for the id it was given, and only that id - whichever child that is', async () => {
    const { profiles, a, b } = await setup();
    for (const target of [b, a]) {
      const cleared: string[] = [];
      const spy = { clear: async (id: string) => void cleared.push(id) } as unknown as ProgressRepo;
      await deleteProfile(target.id, profiles, spy);
      expect(cleared).toEqual([target.id]);
    }
  });

  it('deleting the younger profile clears theirs and keeps the elder\'s (not merely "the first in the list")', async () => {
    const { profiles, progress, a, b } = await setup();
    await deleteProfile(b.id, profiles, progress);
    expect(await progress.loadMastery(b.id)).toEqual({});
    expect(Object.keys(await progress.loadMastery(a.id))).toEqual(['s::SOUND_ID']);
    expect(await progress.loadCompletions(a.id)).toEqual({ 1: 5 });
    expect((await profiles.list()).map((p) => p.id)).toEqual([a.id]);
  });

  it('clears the progress BEFORE the profile row goes, so a failure leaves an id to retry with', async () => {
    const { profiles, a } = await setup();
    let stillListedWhenCleared: boolean | null = null;
    const spy = {
      clear: async (id: string) => {
        stillListedWhenCleared = (await profiles.list()).some((p) => p.id === id);
      },
    } as unknown as ProgressRepo;
    await deleteProfile(a.id, profiles, spy);
    expect(stillListedWhenCleared).toBe(true);
  });

  it('keeps the profile, and says so, when the progress could not be cleared', async () => {
    const { profiles, a } = await setup();
    const failing = {
      clear: async () => {
        throw new Error('storage unavailable');
      },
    } as unknown as ProgressRepo;
    await expect(deleteProfile(a.id, profiles, failing)).rejects.toThrow(/storage unavailable/);
    expect((await profiles.list()).map((p) => p.id)).toContain(a.id);
  });

  it('can be retried after a failure and then completes', async () => {
    const { profiles, progress, a } = await setup();
    const flaky = {
      clear: async () => {
        throw new Error('storage unavailable');
      },
    } as unknown as ProgressRepo;
    await expect(deleteProfile(a.id, profiles, flaky)).rejects.toThrow();
    await deleteProfile(a.id, profiles, progress);
    expect((await profiles.list()).map((p) => p.id)).not.toContain(a.id);
    expect(await progress.loadMastery(a.id)).toEqual({});
  });

  it('never reaches the profile repo at all when clearing fails', async () => {
    const { b } = await setup();
    const removed: string[] = [];
    const spyProfiles = { remove: async (id: string) => void removed.push(id) } as unknown as ProfileRepo;
    const failing = { clear: async () => { throw new Error('nope'); } } as unknown as ProgressRepo;
    await expect(deleteProfile(b.id, spyProfiles, failing)).rejects.toThrow();
    expect(removed).toEqual([]);
  });
});
