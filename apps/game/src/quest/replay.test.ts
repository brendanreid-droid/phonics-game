import { describe, expect, it } from 'vitest';
import { getWord } from '@soundlings/curriculum';
import { DEFAULT_CONFIG, makeRng } from '@soundlings/engine';
import type { TaskInstance } from '@soundlings/engine';
import { rebuildFrom } from '@soundlings/api';
import type { AudioService } from '@soundlings/audio';
import { MemoryProgressRepo } from '../data/MemoryProgressRepo';
import { QuestRunner } from './QuestRunner';

const PROFILE = 'p1';
const HOUR = 3_600_000;

const silentAudio = (): AudioService =>
  ({
    praise: async () => {},
    encourage: async () => {},
    say: async () => {},
    sayAll: async () => {},
    interrupt: async () => {},
    preload: async () => {},
  }) as unknown as AudioService;

const correctFor = (task: TaskInstance): string =>
  task.skill === 'SEGMENT_SPELL' ? getWord(task.correctChoice).graphemes.join('') : task.correctChoice;

const wrongFor = (task: TaskInstance): string =>
  task.skill === 'SEGMENT_SPELL' ? 'zzz' : (task.choices.find((c) => c !== task.correctChoice) ?? 'zzz');

/**
 * The test the sync design rests on, run against the real quest runner rather
 * than a re-enactment of it.
 *
 * Mastery is never synced: another device rebuilds it from the attempt log. So
 * the log must be able to reproduce, exactly, the mastery the runner saved.
 * Here a child plays several whole quests through QuestRunner, with slips,
 * shown answers and a bad patch that makes the frustration guard abandon tasks,
 * and the mastery the runner persisted is compared with one rebuilt from the
 * persisted attempts alone.
 */
describe('a quest played through the real runner can be rebuilt from its log', () => {
  async function playChild(seed: number, quests: number, slip: number) {
    const rng = makeRng(seed);
    const repo = new MemoryProgressRepo();
    let t = 5_000_000_000;
    const now = () => {
      t += 1500 + Math.floor(rng() * 6000);
      return t;
    };

    for (let q = 0; q < quests; q += 1) {
      const runner = new QuestRunner({
        profileId: PROFILE,
        level: 1,
        repo,
        audio: silentAudio(),
        now,
        celebrateMs: 0,
      });
      await runner.start();
      let answers = 0;
      while (runner.getView().status === 'playing') {
        const task = runner.getView().task as TaskInstance;
        // Slip: wrong once or more on this task; the runner decides how it ends.
        if (rng() < slip) {
          const misses = 1 + Math.floor(rng() * 3);
          for (let m = 0; m < misses && runner.getView().status === 'playing'; m += 1) {
            if (runner.getView().task === task) await runner.answer(wrongFor(task), rng() < 0.5 ? 2 : 0);
          }
        }
        if (runner.getView().status === 'playing' && runner.getView().task === task) {
          await runner.answer(correctFor(task), rng() < 0.2 ? 2 : 0);
        }
        answers += 1;
        if (answers > 80) throw new Error('quest never finished');
      }
      expect(runner.getView().status).toBe('finished');
      t += 20 * HOUR;
    }
    return repo;
  }

  for (const [seed, slip] of [
    [1, 0.0],
    [2, 0.15],
    [3, 0.4],
    [4, 0.8],
  ] as const) {
    it(`reproduces the saved mastery exactly (seed ${seed}, slip rate ${slip})`, async () => {
      const repo = await playChild(seed, 6, slip);
      const live = await repo.loadMastery(PROFILE);
      const attempts = await repo.loadAttempts(PROFILE);

      // Not vacuous: real quests, real records, errors present when slips were.
      expect(Object.keys(live).length).toBeGreaterThan(3);
      expect(attempts.length).toBeGreaterThan(60);
      if (slip > 0) expect(attempts.some((a) => !a.correct)).toBe(true);
      if (slip >= 0.4) expect(attempts.some((a) => a.scaffolded)).toBe(true);

      expect(rebuildFrom(attempts, DEFAULT_CONFIG).mastery).toEqual(live);
    });
  }

  it('reproduces the saved mastery after the log has been through a jumble and a repeat', async () => {
    const repo = await playChild(7, 5, 0.3);
    const live = await repo.loadMastery(PROFILE);
    const attempts = (await repo.loadAttempts(PROFILE)).map((a, i) => ({ ...a, id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}` }));
    const jumbled = [...attempts.slice(40), ...attempts.slice(0, 40), ...attempts.slice(10, 20)];
    expect(rebuildFrom(jumbled, DEFAULT_CONFIG).mastery).toEqual(live);
  });
});
