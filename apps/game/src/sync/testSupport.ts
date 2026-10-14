import { getWord } from '@soundlings/curriculum';
import { makeRng } from '@soundlings/engine';
import type { TaskInstance } from '@soundlings/engine';
import type { AudioService } from '@soundlings/audio';
import type { ProgressRepo } from '../data/ProgressRepo';
import { QuestRunner } from '../quest/QuestRunner';

/** Helpers shared by the sync tests: a child who plays whole quests through the real runner. */

export const silentAudio = (): AudioService =>
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

/** A clock that moves forward on every reading, starting from `from`. */
export function steppingClock(from: number, step = 2500) {
  let t = from;
  return {
    now: () => {
      t += step;
      return t;
    },
    jump: (ms: number) => {
      t += ms;
    },
    peek: () => t,
  };
}

/**
 * Plays one whole quest through the real QuestRunner and returns once it has
 * finished. `slip` is the chance a task is first answered wrongly. Resolves with
 * how many answers it took, so a test can see that real play happened.
 */
export async function playQuest(args: {
  repo: ProgressRepo;
  profileId: string;
  now: () => number;
  seed: number;
  slip?: number;
}): Promise<number> {
  const rng = makeRng(args.seed);
  const runner = new QuestRunner({
    profileId: args.profileId,
    level: 1,
    repo: args.repo,
    audio: silentAudio(),
    now: args.now,
    celebrateMs: 0,
  });
  await runner.start();
  let answers = 0;
  while (runner.getView().status === 'playing') {
    const task = runner.getView().task as TaskInstance;
    if (rng() < (args.slip ?? 0.2) && runner.getView().status === 'playing') {
      await runner.answer(wrongFor(task), 0);
    }
    if (runner.getView().status === 'playing' && runner.getView().task === task) {
      await runner.answer(correctFor(task), 0);
    }
    answers += 1;
    if (answers > 80) throw new Error('quest never finished');
  }
  if (runner.getView().status !== 'finished') throw new Error(`quest ended as ${runner.getView().status}`);
  return answers;
}
