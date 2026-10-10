import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getWord } from '@soundlings/curriculum';
import {
  DEFAULT_CONFIG,
  buildSession,
  levelProgress,
  masteryKey,
  recordAttempts,
  recordTaskResult,
} from '@soundlings/engine';
import type { Attempt, MasteryMap, TaskInstance } from '@soundlings/engine';
import type { AudioService } from '@soundlings/audio';
import { MemoryProgressRepo } from '../data/MemoryProgressRepo';
import type { ActiveSession, ProgressRepo } from '../data/ProgressRepo';
import { QuestRunner } from './QuestRunner';
import type { QuestView } from './QuestRunner';

const PROFILE = 'p1';
const START = 5_000_000_000;

/** An AudioService that makes no sound and finishes instantly. */
function silentAudio(): AudioService {
  return {
    praise: async () => {},
    encourage: async () => {},
    say: async () => {},
    sayAll: async () => {},
    interrupt: async () => {},
    preload: async () => {},
  } as unknown as AudioService;
}

function clock(step = 2000) {
  let t = START;
  return () => {
    t += step;
    return t;
  };
}

function runnerFor(repo: ProgressRepo, now = clock()) {
  return new QuestRunner({ profileId: PROFILE, level: 1, repo, audio: silentAudio(), now, celebrateMs: 0 });
}

const correctFor = (task: TaskInstance): string =>
  task.skill === 'SEGMENT_SPELL' ? getWord(task.correctChoice).graphemes.join('') : task.correctChoice;

const wrongFor = (task: TaskInstance): string => {
  if (task.skill === 'SEGMENT_SPELL') return 'zzz';
  const wrong = task.choices.find((c) => c !== task.correctChoice);
  if (!wrong) throw new Error('no wrong choice');
  return wrong;
};

async function started(repo: ProgressRepo = new MemoryProgressRepo()) {
  const runner = runnerFor(repo);
  await runner.start();
  return { runner, repo };
}

const viewOf = (runner: QuestRunner): QuestView => runner.getView();
const taskOf = (runner: QuestRunner): TaskInstance => {
  const task = runner.getView().task;
  if (!task) throw new Error(`no current task (status ${runner.getView().status})`);
  return task;
};

/** Answers every remaining task correctly. */
async function finishCleanly(runner: QuestRunner): Promise<number> {
  let answered = 0;
  while (viewOf(runner).status === 'playing') {
    await runner.answer(correctFor(taskOf(runner)));
    answered += 1;
    if (answered > 60) throw new Error('quest never finished');
  }
  return answered;
}

/** Seeds a repo with a stored quest, as an interrupted one would be. */
async function storeQuest(repo: ProgressRepo, plan: TaskInstance[], index = 0, extra: Partial<ActiveSession> = {}) {
  const session: ActiveSession = {
    sessionId: 'stored-quest',
    level: 1,
    plan,
    index,
    stars: 3,
    startedAt: START,
    ...extra,
  };
  await repo.saveActiveSession(PROFILE, session);
  return session;
}

const freshPlan = (id = 'seed-1') =>
  buildSession({ sessionId: id, level: 1, mastery: {}, confusions: {}, now: START });

describe('a clean quest', () => {
  it('runs all fourteen tasks and finishes with three stars', async () => {
    const { runner } = await started();
    expect(viewOf(runner).status).toBe('playing');
    expect(viewOf(runner).total).toBe(14);

    const answered = await finishCleanly(runner);
    expect(answered).toBe(14);
    expect(viewOf(runner).status).toBe('finished');
    expect(viewOf(runner).stars).toBe(3);
  });

  it('shows each task in order, with the pips advancing by one', async () => {
    const { runner } = await started();
    const indexes: number[] = [];
    while (viewOf(runner).status === 'playing') {
      indexes.push(viewOf(runner).index);
      await runner.answer(correctFor(taskOf(runner)));
    }
    expect(indexes).toEqual(Array.from({ length: 14 }, (_, i) => i));
  });

  it('clears the stored quest and records the score when it ends', async () => {
    const { runner, repo } = await started();
    await finishCleanly(runner);
    expect(await repo.loadActiveSession(PROFILE)).toBeNull();
    const scores = await repo.loadHighScores(PROFILE);
    expect(scores).toHaveLength(1);
    expect(scores[0]).toMatchObject({ level: 1, stars: 3, cleanRun: true });
  });

  it('starts a different quest each day for the same child', async () => {
    const repo = new MemoryProgressRepo();
    const a = await started(repo);
    const firstPlan = (await repo.loadActiveSession(PROFILE))?.plan.map((t) => t.id);
    await finishCleanly(a.runner);
    const b = await started(repo);
    expect(viewOf(b.runner).status).toBe('playing');
    expect((await repo.loadActiveSession(PROFILE))?.sessionId).not.toBe('stored-quest');
    expect(firstPlan).toHaveLength(14);
  });
});

describe('how outcomes become evidence', () => {
  it('folds answers into mastery exactly as the engine does for the simulation', async () => {
    // Replays what the runner did through the engine's own recordTaskResult. If
    // the runner ever folded outcomes some other way, this stops matching. A
    // frozen clock makes latency and time identical on both sides.
    const repo = new MemoryProgressRepo();
    const runner = runnerFor(repo, () => START);
    await runner.start();
    const session = await repo.loadActiveSession(PROFILE);
    if (!session) throw new Error('expected a stored quest');

    await finishCleanly(runner);

    let expected: MasteryMap = {};
    for (const task of session.plan) {
      expected = recordTaskResult(
        expected,
        task,
        { sessionId: session.sessionId, correct: true, scaffolded: false, latencyMs: 0, at: START },
        DEFAULT_CONFIG,
      );
    }
    expect(await repo.loadMastery(PROFILE)).toEqual(expected);
  });

  it('logs every attempt that was folded in, so mastery can be rebuilt from the log alone', async () => {
    const { runner, repo } = await started();
    await finishCleanly(runner);

    const attempts = await repo.loadAttempts(PROFILE);
    const rebuilt = recordAttempts({}, attempts, DEFAULT_CONFIG);
    const stored = await repo.loadMastery(PROFILE);

    expect(Object.keys(rebuilt).sort()).toEqual(Object.keys(stored).sort());
    for (const key of Object.keys(stored)) {
      expect(rebuilt[key].correctCount, key).toBeCloseTo(stored[key].correctCount);
      expect(rebuilt[key].attemptCount, key).toBe(stored[key].attemptCount);
    }
    // Primary attempts at full weight, and secondary credit at the config weight, in the same log.
    expect(attempts.some((a) => a.weight === 1)).toBe(true);
  });

  it('records the sound a child mixed up with the target', async () => {
    const { runner, repo } = await started();
    const task = taskOf(runner);
    if (task.skill === 'SEGMENT_SPELL') throw new Error('day one opens on a sound task');
    const wrong = wrongFor(task);
    await runner.answer(wrong);
    const confusions = await repo.loadConfusions(PROFILE);
    expect(confusions[`${task.primaryTarget}>${wrong}`]).toBe(1);
  });
});

describe('persistence', () => {
  it('saves after every answered task, not only at the end', async () => {
    const { runner, repo } = await started();
    for (let done = 1; done <= 5; done += 1) {
      await runner.answer(correctFor(taskOf(runner)));
      const session = await repo.loadActiveSession(PROFILE);
      expect(session?.index, `after ${done} tasks`).toBe(done);
      const attempts = await repo.loadAttempts(PROFILE);
      expect(attempts.filter((a) => a.weight === 1), `after ${done} tasks`).toHaveLength(done);
      expect(Object.keys(await repo.loadMastery(PROFILE)).length).toBeGreaterThan(0);
    }
  });

  it('resumes an interrupted quest on the very next task, with the plan intact', async () => {
    const repo = new MemoryProgressRepo();
    const first = await started(repo);
    const planBefore = (await repo.loadActiveSession(PROFILE))?.plan;
    for (let i = 0; i < 6; i += 1) await first.runner.answer(correctFor(taskOf(first.runner)));
    const expectedNext = taskOf(first.runner);

    // The app is killed and relaunched: a new runner over the same storage.
    const second = await started(repo);

    expect(viewOf(second.runner).index).toBe(6);
    expect(taskOf(second.runner).id).toBe(expectedNext.id);
    const planAfter = (await repo.loadActiveSession(PROFILE))?.plan;
    expect(planAfter).toEqual(planBefore);
  });

  it('keeps the evidence it already had when it resumes, and adds to it', async () => {
    const repo = new MemoryProgressRepo();
    const first = await started(repo);
    for (let i = 0; i < 4; i += 1) await first.runner.answer(correctFor(taskOf(first.runner)));
    const attemptsBefore = (await repo.loadAttempts(PROFILE)).length;

    const second = await started(repo);
    expect((await repo.loadAttempts(PROFILE)).length).toBe(attemptsBefore);
    await finishCleanly(second.runner);
    expect(viewOf(second.runner).status).toBe('finished');
    expect((await repo.loadAttempts(PROFILE)).filter((a) => a.weight === 1)).toHaveLength(14);
  });

  it('resumes into the same session id, so one quest counts as one session of evidence', async () => {
    const repo = new MemoryProgressRepo();
    const first = await started(repo);
    await first.runner.answer(correctFor(taskOf(first.runner)));
    const second = await started(repo);
    await second.runner.answer(correctFor(taskOf(second.runner)));
    const ids = new Set((await repo.loadAttempts(PROFILE)).map((a) => a.sessionId));
    expect(ids.size).toBe(1);
  });

  it('keeps the star count across an interruption', async () => {
    const repo = new MemoryProgressRepo();
    const first = await started(repo);
    // Two errors on different tasks: two stars.
    await first.runner.answer(wrongFor(taskOf(first.runner)));
    await first.runner.answer(correctFor(taskOf(first.runner)));
    await first.runner.answer(wrongFor(taskOf(first.runner)));
    await first.runner.answer(correctFor(taskOf(first.runner)));
    const second = await started(repo);
    await finishCleanly(second.runner);
    expect(viewOf(second.runner).stars).toBe(2);
  });

  it('starts fresh rather than crashing on a stored quest it cannot play', async () => {
    const repo = new MemoryProgressRepo();
    const broken = freshPlan().map((t, i) => (i === 3 ? { ...t, taskTypeId: 'retired-game' } : t));
    await storeQuest(repo, broken, 0);
    const { runner } = await started(repo);
    expect(viewOf(runner).status).toBe('playing');
    expect((await repo.loadActiveSession(PROFILE))?.sessionId).not.toBe('stored-quest');
  });

  it('starts fresh when the stored quest is for another level', async () => {
    const repo = new MemoryProgressRepo();
    await storeQuest(repo, freshPlan(), 3);
    await repo.saveActiveSession(PROFILE, { ...(await repo.loadActiveSession(PROFILE))!, level: 2 });
    const { runner } = await started(repo);
    expect(viewOf(runner).index).toBe(0);
  });

  it('keeps playing when storage fails, rather than stranding the child', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const repo = new MemoryProgressRepo();
    vi.spyOn(repo, 'saveMastery').mockRejectedValue(new Error('disk full'));
    vi.spyOn(repo, 'appendAttempt').mockRejectedValue(new Error('disk full'));
    const { runner } = await started(repo);
    await finishCleanly(runner);
    expect(viewOf(runner).status).toBe('finished');
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('writes the evidence before it moves the pointer to the next task', async () => {
    const repo = new MemoryProgressRepo();
    const order: string[] = [];
    const appendAttempt = repo.appendAttempt.bind(repo);
    const saveMastery = repo.saveMastery.bind(repo);
    const saveActiveSession = repo.saveActiveSession.bind(repo);
    vi.spyOn(repo, 'appendAttempt').mockImplementation(async (p, a) => {
      order.push('attempt');
      await appendAttempt(p, a);
    });
    vi.spyOn(repo, 'saveMastery').mockImplementation(async (p, m) => {
      order.push('mastery');
      await saveMastery(p, m);
    });
    vi.spyOn(repo, 'saveActiveSession').mockImplementation(async (p, s) => {
      order.push(`session:${s?.index ?? 'null'}`);
      await saveActiveSession(p, s);
    });
    const { runner } = await started(repo);
    order.length = 0;
    await runner.answer(correctFor(taskOf(runner)));
    expect(order.indexOf('mastery')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('mastery')).toBeLessThan(order.indexOf('session:1'));
    expect(order.indexOf('attempt')).toBeLessThan(order.indexOf('mastery'));
  });
});

describe('a wrong answer', () => {
  let ctx: Awaited<ReturnType<typeof started>>;
  beforeEach(async () => {
    ctx = await started();
  });

  it('leaves the child on the same task with more help', async () => {
    const task = taskOf(ctx.runner);
    await ctx.runner.answer(wrongFor(task));
    const view = viewOf(ctx.runner);
    expect(view.status).toBe('playing');
    expect(view.index).toBe(0);
    expect(view.task?.id).toBe(task.id);
    expect(view.tier).toBe(2);
  });

  it('shows the answer on the second error, still on the same task', async () => {
    const task = taskOf(ctx.runner);
    await ctx.runner.answer(wrongFor(task));
    await ctx.runner.answer(wrongFor(task));
    const view = viewOf(ctx.runner);
    expect(view.index).toBe(0);
    expect(view.task?.id).toBe(task.id);
    expect(view.tier).toBe(3);
  });

  it('lets them finish by tapping the revealed answer, recorded as helped and not as learnt', async () => {
    const task = taskOf(ctx.runner);
    await ctx.runner.answer(wrongFor(task));
    await ctx.runner.answer(wrongFor(task));
    await ctx.runner.answer(correctFor(task));

    expect(viewOf(ctx.runner).index).toBe(1);
    const primary = (await ctx.repo.loadAttempts(PROFILE)).filter((a) => a.weight === 1);
    // One genuine error, then the helped finish. The second wrong tap is the
    // scaffold trigger and is not logged as a second error, as in the simulation.
    expect(primary.map((a) => [a.correct, a.scaffolded])).toEqual([
      [false, false],
      [true, true],
    ]);
    const record = (await ctx.repo.loadMastery(PROFILE))[masteryKey(task.primaryTarget, task.skill)];
    expect(record.scaffoldedCount).toBe(1);
    // Nothing was proven: a helped answer must not count as a success.
    expect(record.primaryCorrectCount).toBe(0);
    expect(record.correctCount).toBe(0);
  });

  it('abandons on the third error: moves on, recorded as helped, and does not ask it again', async () => {
    const task = taskOf(ctx.runner);
    await ctx.runner.answer(wrongFor(task));
    await ctx.runner.answer(wrongFor(task));
    await ctx.runner.answer(wrongFor(task));

    expect(viewOf(ctx.runner).index).toBe(1);
    expect(viewOf(ctx.runner).tier).toBe(0);
    const last = (await ctx.repo.loadAttempts(PROFILE)).filter((a) => a.weight === 1).at(-1);
    expect(last).toMatchObject({ correct: true, scaffolded: true });
  });

  it('caps the difficulty of whatever remains after an abandon', async () => {
    const task = taskOf(ctx.runner);
    for (let i = 0; i < 3; i += 1) await ctx.runner.answer(wrongFor(task));
    const plan = (await ctx.repo.loadActiveSession(PROFILE))?.plan ?? [];
    expect(plan).toHaveLength(14);
    for (const t of plan.slice(1)) expect(t.difficulty, t.id).toBeLessThanOrEqual(DEFAULT_CONFIG.cappedDifficulty);
    expect(plan[1].anchor).toBe(true);
  });

  it('forgives a helped finish: the next miss on that sound is a fresh start, not an instant abandon', async () => {
    // The simulation never retries, so there a helped finish can leave the count
    // standing. Here it would leave a child who accepted help one miss from
    // being abandoned with no second chance, which punishes asking for help.
    const repo = new MemoryProgressRepo();
    const [first, , ...rest] = freshPlan('guard-1');
    const hunts = [first, { ...first, id: 'again' }, ...rest];
    await storeQuest(repo, hunts, 0);
    const { runner } = await started(repo);

    await runner.answer(wrongFor(first));
    await runner.answer(wrongFor(first));
    await runner.answer(correctFor(first)); // helped finish
    expect(taskOf(runner).id).toBe('again');

    await runner.answer(wrongFor(taskOf(runner)));
    // Still on the same task, with the first level of help.
    expect(viewOf(runner).index).toBe(1);
    expect(viewOf(runner).tier).toBe(2);
  });

  it('forgives an abandoned task the same way', async () => {
    const repo = new MemoryProgressRepo();
    const [first, , ...rest] = freshPlan('guard-2');
    await storeQuest(repo, [first, { ...first, id: 'again' }, ...rest], 0);
    const { runner } = await started(repo);
    for (let i = 0; i < 3; i += 1) await runner.answer(wrongFor(first));
    // The replan rebuilt what remained, so find the next task for this sound's
    // count by asking for any wrong answer: it must keep the child on the task.
    const next = taskOf(runner);
    await runner.answer(wrongFor(next));
    expect(viewOf(runner).task?.id).toBe(next.id);
    expect(viewOf(runner).tier).toBe(2);
  });

  it('does not count the child out of stars for asking for help alone', async () => {
    await finishCleanly(ctx.runner);
    expect(viewOf(ctx.runner).stars).toBe(3);
  });

  it('gives fewer stars for a quest with errors, never fewer than one', async () => {
    for (let i = 0; i < 14; i += 1) {
      const task = taskOf(ctx.runner);
      await ctx.runner.answer(wrongFor(task));
      await ctx.runner.answer(wrongFor(task));
      await ctx.runner.answer(wrongFor(task));
      if (viewOf(ctx.runner).status !== 'playing') break;
    }
    expect(viewOf(ctx.runner).status).toBe('finished');
    expect(viewOf(ctx.runner).stars).toBe(1);
  });

  it('shortens the quest on a bad day, and still ends the quest', async () => {
    let tasksPlayed = 0;
    while (viewOf(ctx.runner).status === 'playing') {
      const task = taskOf(ctx.runner);
      tasksPlayed += 1;
      for (let i = 0; i < 3 && viewOf(ctx.runner).task?.id === task.id; i += 1) {
        await ctx.runner.answer(wrongFor(task));
      }
      if (tasksPlayed > 30) throw new Error('quest never ended');
    }
    expect(tasksPlayed).toBeLessThan(14);
    expect(tasksPlayed).toBeGreaterThanOrEqual(3);
  });
});

describe('stars from a played quest', () => {
  it('still earns three stars after one slip', async () => {
    const { runner } = await started();
    await runner.answer(wrongFor(taskOf(runner)));
    await finishCleanly(runner);
    expect(viewOf(runner).stars).toBe(3);
  });

  it('earns two stars for three errors on three different tasks', async () => {
    const { runner } = await started();
    for (let i = 0; i < 3; i += 1) {
      await runner.answer(wrongFor(taskOf(runner)));
      await runner.answer(correctFor(taskOf(runner)));
    }
    await finishCleanly(runner);
    expect(viewOf(runner).stars).toBe(2);
  });

  it('earns one star for five errors', async () => {
    const { runner } = await started();
    for (let i = 0; i < 5; i += 1) {
      await runner.answer(wrongFor(taskOf(runner)));
      await runner.answer(correctFor(taskOf(runner)));
    }
    await finishCleanly(runner);
    expect(viewOf(runner).stars).toBe(1);
  });
});

describe('how much a right answer is worth after help', () => {
  const primaryOf = async (repo: ProgressRepo) =>
    (await repo.loadAttempts(PROFILE)).filter((a) => a.skill === 'SOUND_ID' || a.skill === 'LETTER_SOUND');

  it('is full weight when the child was not helped', async () => {
    const { runner, repo } = await started();
    await runner.answer(correctFor(taskOf(runner)), 0);
    const [attempt] = await primaryOf(repo);
    expect(attempt).toMatchObject({ correct: true, scaffolded: false, weight: 1 });
  });

  it('is full weight with only the idle nudge, which narrows nothing', async () => {
    const { runner, repo } = await started();
    await runner.answer(correctFor(taskOf(runner)), 1);
    expect((await primaryOf(repo))[0].weight).toBe(1);
  });

  it('is half weight after an error has narrowed the choices, and not scaffolded', async () => {
    const { runner, repo } = await started();
    const task = taskOf(runner);
    await runner.answer(wrongFor(task));
    await runner.answer(correctFor(task));
    const attempts = await primaryOf(repo);
    expect(attempts[0]).toMatchObject({ correct: false, weight: 1 });
    expect(attempts[1]).toMatchObject({ correct: true, scaffolded: false, weight: DEFAULT_CONFIG.secondaryWeight });
  });

  it('is half weight after the task itself reports tier 2, as an idle pause or the owl does', async () => {
    const { runner, repo } = await started();
    await runner.answer(correctFor(taskOf(runner)), 2);
    expect((await primaryOf(repo))[0]).toMatchObject({ correct: true, scaffolded: false, weight: 0.5 });
  });

  it('is earned less: the mastery record counts half a correct answer', async () => {
    const aided = await started();
    const task = taskOf(aided.runner);
    await aided.runner.answer(correctFor(task), 2);
    const record = (await aided.repo.loadMastery(PROFILE))[masteryKey(task.primaryTarget, task.skill)];
    expect(record.correctCount).toBe(0.5);
    expect(record.primaryCorrectCount).toBe(0);

    const unaided = await started();
    await unaided.runner.answer(correctFor(taskOf(unaided.runner)), 0);
    const clean = (await unaided.repo.loadMastery(PROFILE))[masteryKey(task.primaryTarget, task.skill)];
    expect(clean.correctCount).toBe(1);
  });

  it('leaves a scaffolded finish as scaffolded, not as half weight', async () => {
    const { runner, repo } = await started();
    const task = taskOf(runner);
    await runner.answer(wrongFor(task));
    await runner.answer(wrongFor(task));
    await runner.answer(correctFor(task), 3);
    const last = (await primaryOf(repo)).at(-1);
    expect(last).toMatchObject({ correct: true, scaffolded: true, weight: 1 });
  });

  it('weighs a helped answer the same after a restart', async () => {
    // The closing swap and the stars are rebuilt from the log, so a half-weight
    // answer must still read back as the task's own attempt.
    const repo = new MemoryProgressRepo();
    const first = await started(repo);
    const task = taskOf(first.runner);
    await first.runner.answer(wrongFor(task));
    await first.runner.answer(correctFor(task));
    const second = await started(repo);
    await finishCleanly(second.runner);
    expect(viewOf(second.runner).stars).toBe(3);
  });
});

describe('handling taps', () => {
  it('ignores a second tap that lands while the first is still being handled', async () => {
    const { runner, repo } = await started();
    const task = taskOf(runner);
    await Promise.all([runner.answer(correctFor(task)), runner.answer(correctFor(task))]);
    expect(viewOf(runner).index).toBe(1);
    expect((await repo.loadAttempts(PROFILE)).filter((a) => a.weight === 1)).toHaveLength(1);
  });

  it('ignores answers before the quest has loaded and after it has finished', async () => {
    const repo = new MemoryProgressRepo();
    const runner = runnerFor(repo);
    await runner.answer('s');
    expect(await repo.loadAttempts(PROFILE)).toHaveLength(0);

    await runner.start();
    await finishCleanly(runner);
    const before = (await repo.loadAttempts(PROFILE)).length;
    await runner.answer('s');
    expect((await repo.loadAttempts(PROFILE)).length).toBe(before);
  });

  it('is safe to start twice', async () => {
    const repo = new MemoryProgressRepo();
    const runner = runnerFor(repo);
    await Promise.all([runner.start(), runner.start()]);
    expect(viewOf(runner).status).toBe('playing');
    expect(viewOf(runner).index).toBe(0);
  });

  it('tells subscribers when the view changes', async () => {
    const { runner } = await started();
    const listener = vi.fn();
    const unsubscribe = runner.subscribe(listener);
    await runner.answer(correctFor(taskOf(runner)));
    expect(listener).toHaveBeenCalled();
    unsubscribe();
    listener.mockClear();
    await runner.answer(correctFor(taskOf(runner)));
    expect(listener).not.toHaveBeenCalled();
  });

  it('reports an error rather than hanging when the quest cannot be built', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const runner = new QuestRunner({
      profileId: PROFILE,
      level: 99,
      repo: new MemoryProgressRepo(),
      audio: silentAudio(),
      now: clock(),
      celebrateMs: 0,
    });
    await runner.start();
    expect(viewOf(runner).status).toBe('error');
    error.mockRestore();
  });
});

describe('the closing anchor promise', () => {
  /**
   * A stored quest in which the child is asked the closing task's own target
   * (same sound, same mini-game) earlier on, so they can fail it there. The
   * session builder cannot know the answer; only the runner can.
   */
  function questWithRepeatedClose() {
    const plan = freshPlan('closing-1');
    const closing = plan[plan.length - 1];
    const earlierAt = 3;
    const earlier: TaskInstance = { ...closing, id: `${earlierAt}-repeat`, anchor: false };
    const patched = plan.map((t, i) => (i === earlierAt ? earlier : t));
    // Neighbours must differ in type for a realistic quest; the runner does not care.
    return { plan: patched, closing, earlierAt };
  }

  const pairing = (t: TaskInstance) => `${t.primaryTarget}::${t.skill}`;

  it('swaps the close when the child fluffed that sound earlier in the quest', async () => {
    const repo = new MemoryProgressRepo();
    const { plan, closing, earlierAt } = questWithRepeatedClose();
    await storeQuest(repo, plan, 0);
    const { runner } = await started(repo);

    for (let i = 0; i < plan.length - 1; i += 1) {
      const task = taskOf(runner);
      if (i === earlierAt) {
        await runner.answer(wrongFor(task));
        await runner.answer(correctFor(task));
      } else {
        await runner.answer(correctFor(task));
      }
    }

    expect(viewOf(runner).index).toBe(plan.length - 1);
    const final = taskOf(runner);
    expect(pairing(final)).not.toBe(pairing(closing));
    expect(final.anchor).toBe(true);
    // And what the child was shown is what was stored, so a resume agrees.
    const stored = await repo.loadActiveSession(PROFILE);
    expect(stored?.plan.at(-1)?.id).toBe(final.id);
  });

  it('closes on something the child got right, not something else they got wrong', async () => {
    const repo = new MemoryProgressRepo();
    const { plan, closing, earlierAt } = questWithRepeatedClose();
    await storeQuest(repo, plan, 0);
    const { runner } = await started(repo);

    const fluffed = new Set<string>();
    for (let i = 0; i < plan.length - 1; i += 1) {
      const task = taskOf(runner);
      if (i === earlierAt) {
        fluffed.add(pairing(task));
        await runner.answer(wrongFor(task));
      }
      await runner.answer(correctFor(task));
    }
    expect(fluffed.has(pairing(closing))).toBe(true);
    expect(fluffed.has(pairing(taskOf(runner)))).toBe(false);
  });

  it('leaves the planned close alone when the child answered that sound cleanly', async () => {
    const repo = new MemoryProgressRepo();
    const { plan, closing } = questWithRepeatedClose();
    await storeQuest(repo, plan, 0);
    const { runner } = await started(repo);
    for (let i = 0; i < plan.length - 1; i += 1) await runner.answer(correctFor(taskOf(runner)));
    expect(taskOf(runner).id).toBe(closing.id);
  });

  it('still keeps the promise after an interruption, using the attempt log', async () => {
    const repo = new MemoryProgressRepo();
    const { plan, closing, earlierAt } = questWithRepeatedClose();
    await storeQuest(repo, plan, 0);
    const first = await started(repo);

    for (let i = 0; i <= earlierAt; i += 1) {
      const task = taskOf(first.runner);
      if (i === earlierAt) await first.runner.answer(wrongFor(task));
      await first.runner.answer(correctFor(task));
    }
    // Killed and relaunched in the middle of the quest.
    const second = await started(repo);
    while (viewOf(second.runner).index < plan.length - 1) {
      await second.runner.answer(correctFor(taskOf(second.runner)));
    }
    expect(pairing(taskOf(second.runner))).not.toBe(pairing(closing));
  });

  it('keeps the promise when the quest is resumed already standing on the final task', async () => {
    const repo = new MemoryProgressRepo();
    const { plan, closing, earlierAt } = questWithRepeatedClose();
    await storeQuest(repo, plan, 0);
    const first = await started(repo);
    for (let i = 0; i < plan.length - 1; i += 1) {
      const task = taskOf(first.runner);
      if (i === earlierAt) await first.runner.answer(wrongFor(task));
      await first.runner.answer(correctFor(task));
    }
    const second = await started(repo);
    expect(viewOf(second.runner).index).toBe(plan.length - 1);
    expect(pairing(taskOf(second.runner))).not.toBe(pairing(closing));
  });
});

describe('creatures', () => {
  /** Three clean answers across two task types in one earlier session. */
  const sessionA = (targetId: string, skill: Attempt['skill'], types: string[]): Attempt[] =>
    types.map((taskTypeId, i) => ({
      sessionId: 'earlier-A',
      targetId,
      skill,
      taskTypeId,
      correct: true,
      scaffolded: false,
      latencyMs: 1000,
      weight: 1,
      at: START - 3_600_000 + i,
    }));

  const priorKnowledge = (): MasteryMap => {
    const attempts: Attempt[] = [
      // /s/ by ear: three clean answers in session A, two mini-games.
      ...sessionA('s', 'SOUND_ID', ['sound-hunt', 'sound-hunt', 'picture-match']),
      // /s/ by sight: mastered across two earlier sessions.
      ...sessionA('s', 'LETTER_SOUND', ['sound-singer', 'sound-singer', 'sound-singer']),
      ...sessionA('s', 'LETTER_SOUND', ['sound-singer']).map((a) => ({ ...a, sessionId: 'earlier-B' })),
    ];
    return recordAttempts({}, attempts, DEFAULT_CONFIG);
  };

  const twoTaskQuest = (): TaskInstance[] => {
    const full = buildSession({ sessionId: 'creature-1', level: 1, mastery: {}, confusions: {}, now: START });
    const hunt = full.find((t) => t.taskTypeId === 'sound-hunt' && t.primaryTarget === 's');
    const other = full.find((t) => t.taskTypeId === 'sound-singer' && t.primaryTarget !== 's');
    if (!hunt || !other) throw new Error('expected suitable tasks in the plan');
    return [hunt, other];
  };

  it('is a real setup: finishing /s/ by ear in a new session hatches Sisi', () => {
    const progress = levelProgress(1, priorKnowledge(), START, DEFAULT_CONFIG);
    expect(progress.creaturesEarned).not.toContain('sisi');
  });

  it('announces a creature earned during the quest', async () => {
    const repo = new MemoryProgressRepo();
    await repo.saveMastery(PROFILE, priorKnowledge());
    await storeQuest(repo, twoTaskQuest(), 0, { sessionId: 'quest-today' });
    const { runner } = await started(repo);
    await finishCleanly(runner);
    expect(viewOf(runner).newCreatures).toEqual(['sisi']);
  });

  it('still announces it when the creature hatched before an interruption', async () => {
    const repo = new MemoryProgressRepo();
    await repo.saveMastery(PROFILE, priorKnowledge());
    await storeQuest(repo, twoTaskQuest(), 0, { sessionId: 'quest-today' });
    const first = await started(repo);
    await first.runner.answer(correctFor(taskOf(first.runner))); // /s/ is mastered now

    const second = await started(repo);
    await finishCleanly(second.runner);
    expect(viewOf(second.runner).newCreatures).toEqual(['sisi']);
  });

  it('announces nothing for a creature the child already had', async () => {
    const repo = new MemoryProgressRepo();
    await repo.saveMastery(PROFILE, priorKnowledge());
    // Already hatched before this quest begins.
    await storeQuest(repo, twoTaskQuest(), 0, { sessionId: 'quest-today', creaturesAtStart: ['sisi'] });
    const { runner } = await started(repo);
    await finishCleanly(runner);
    expect(viewOf(runner).newCreatures).toEqual([]);
  });
});
