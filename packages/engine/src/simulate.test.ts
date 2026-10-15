import { describe, expect, it } from 'vitest';
import { closingTask, simulateChild } from './simulate';
import type { ChildProfile } from './simulate';
import type { TargetOutcome } from './simulate';
import type { TaskInstance } from './types';

/**
 * Pacing, as measured. These are regression bounds, not promises: they were set from
 * 30 seeds (1 to 30) per profile with modest headroom, against DEFAULT_CONFIG as
 * calibrated. If one fails, the engine, the curriculum or the config changed what
 * Level 1 costs a child; find out why before touching a bound. Do not widen a bound
 * to get green.
 *
 * Measured (quests, min/mean/max; tasks mean), seeds 1 to 30, cap 100, with words gated
 * on known sounds (spec invariant 5a, wordReadinessCorrect 2) and SEVEN mini-games (Plan 3:
 * Word Pick, Missing Letter and Picture Start added, so six of the seven sounds, every
 * reading word and every spelling word need two different games before they count as proven):
 *   fast         11 / 17.1 / 22    tasks 240   (was 12 / 14.7 / 19, 206 with four games)
 *   average      14 / 22.0 / 37    tasks 308   (was 15 / 21.5 / 33, 301)
 *   struggling   13 / 31.5 / 64    tasks 441   (was 17 / 29.6 / 45, 414)   (70% accurate)
 *   nearChance   cap 40: 1 of 30 finished, mean 39.5 quests (was 3 of 30, 39.7)   (55% accurate)
 * Quest counts ROSE for the strong learner (+16%) and barely moved for the others. That is the
 * price of the anti-memorisation guarantee, not a defect: asking for two independent proofs
 * costs more than asking for one, and that is what makes the guarantee worth having. The bounds
 * below were re-set from these figures with modest headroom; nothing about mastery was weakened
 * to reach them. The earlier bounds (fast <= 16 and so on) described four games and are retired.
 *
 * One quest per simulated day, so these are also days.
 */
const SEED_COUNT = 30;
const seeds = Array.from({ length: SEED_COUNT }, (_, i) => i + 1);

function measure(profile: ChildProfile, maxQuests: number) {
  const runs = seeds.map((seed) => simulateChild({ profile, seed, maxQuests }));
  const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
  const quests = runs.map((r) => r.quests);
  const tasks = runs.map((r) => r.tasksPlayed);
  return {
    runs,
    completed: runs.filter((r) => r.complete).length,
    meanQuests: mean(quests),
    maxQuests: Math.max(...quests),
    meanTasks: mean(tasks),
    endingOnFailure: runs.reduce((a, r) => a + r.questsEndingOnFailure, 0) / quests.reduce((a, b) => a + b, 0),
    closingOnFailedTarget: runs.reduce((a, r) => a + r.questsClosingOnFailedTarget, 0),
    totalQuests: quests.reduce((a, b) => a + b, 0),
  };
}

describe('pacing simulation', { timeout: 60_000 }, () => {
  const fast = measure('fast', 100);
  const average = measure('average', 100);
  const struggling = measure('struggling', 100);
  const nearChance = measure('nearChance', 40);
  const strugglingAtCap = measure('struggling', 40);

  it('finishes Level 1 for every strong learner, in about 17 quests', () => {
    expect(fast.completed).toBe(SEED_COUNT);
    expect(fast.meanQuests).toBeGreaterThanOrEqual(12);
    expect(fast.meanQuests).toBeLessThanOrEqual(19);
    expect(fast.maxQuests).toBeLessThanOrEqual(26);
    expect(fast.meanTasks).toBeLessThanOrEqual(265);
  });

  it('finishes Level 1 for every average learner, in about 24 quests', () => {
    // Was "about 22". Oral blending adds a fifth skill to prove, so the count
    // rose, and that is the trade being made rather than a regression: the old
    // number was bought by never teaching a child to hear the sounds in a word.
    //
    // Re-set from the measurement, as the ranges have been before. These are
    // PROVISIONAL — Plan 6 Task 7 re-measures once the Meet card and the
    // read-before-spell gates land, and they will move again.
    expect(average.completed).toBe(SEED_COUNT);
    expect(average.meanQuests).toBeGreaterThanOrEqual(15);
    expect(average.meanQuests).toBeLessThanOrEqual(26);
    expect(average.maxQuests).toBeLessThanOrEqual(45);
    expect(average.meanTasks).toBeLessThanOrEqual(360);
  });

  it('finishes Level 1 for every struggling learner (70% accurate), in about 30 quests', () => {
    // 70% on a two-choice task is a child finding it genuinely hard but learning. This
    // is the case the adaptive engine exists for, and it must complete.
    expect(struggling.completed).toBe(SEED_COUNT);
    expect(struggling.meanQuests).toBeGreaterThanOrEqual(23);
    expect(struggling.meanQuests).toBeLessThanOrEqual(36);
    expect(struggling.maxQuests).toBeLessThanOrEqual(80);
    expect(struggling.meanTasks).toBeLessThanOrEqual(500);
  });

  it('gives a struggling learner materially more practice than a strong one', () => {
    expect(average.meanQuests).toBeGreaterThan(fast.meanQuests);
    expect(struggling.meanQuests).toBeGreaterThan(average.meanQuests);
    expect(struggling.meanQuests).toBeGreaterThanOrEqual(1.5 * fast.meanQuests);
    expect(struggling.meanTasks).toBeGreaterThan(average.meanTasks);
    expect(average.meanTasks).toBeGreaterThan(fast.meanTasks);
  });

  it('does not let a child performing near chance (55%) through within the quest cap', () => {
    // Chance on a two-choice task is 50%. A child at 55% is guessing, has not learned the
    // material, and must not be passed by volume. Of 30 children, 3 got through in 40
    // quests, by luck on every gate at once (1 of 30 with seven games); a 70% child got through 24 times.
    expect(nearChance.completed).toBeLessThanOrEqual(6);
    expect(nearChance.completed).toBeLessThan(strugglingAtCap.completed);
    expect(nearChance.meanQuests).toBeGreaterThanOrEqual(35);
  });

  it('never closes a quest on a target the child failed earlier, bar a rare no-alternative case', () => {
    // The runner's promise, modelled: the close is swapped away from a failed target.
    expect(fast.closingOnFailedTarget).toBe(0);
    expect(average.closingOnFailedTarget).toBe(0);
    expect(struggling.closingOnFailedTarget / struggling.totalQuests).toBeLessThanOrEqual(0.01);
  });

  it('reports how often a quest still ends on a failure, which a swap cannot remove', () => {
    // The swap picks something the child got right, but a flat-accuracy child can still
    // miss it. Measured: fast 6%, average 17%, struggling 29%. Scaffolded answers count.
    expect(fast.endingOnFailure).toBeLessThanOrEqual(0.1);
    expect(average.endingOnFailure).toBeLessThanOrEqual(0.25);
    expect(struggling.endingOnFailure).toBeLessThanOrEqual(0.4);
  });

  it('is deterministic for a given seed', () => {
    expect(simulateChild({ profile: 'average', seed: 8 })).toEqual(simulateChild({ profile: 'average', seed: 8 }));
  });

  it('lets a strong child graduate the first introduction group, which once could not happen', () => {
    // The deadlock this guards: with a first group that builds no word, SOUND_ID had one
    // proving task type, nothing was ever mastered, and the focus never moved.
    const after4 = seeds.map((seed) => simulateChild({ profile: 'fast', seed, maxQuests: 4 }).progress.graphemesMastered);
    expect(Math.min(...after4)).toBeGreaterThanOrEqual(1);
    expect(after4.reduce((a, b) => a + b, 0) / after4.length).toBeGreaterThanOrEqual(2);
  });
});

// The tests below do not depend on how DEFAULT_CONFIG is calibrated, so they
// stay meaningful while the pacing numbers above are being tuned.
describe('simulation mechanics', () => {
  const HOURS_PER_QUEST_MIN = 20;
  const HOURS_PER_QUEST_MAX = 24;

  it('plays one quest per day, so decay is exercised between quests', () => {
    const result = simulateChild({ profile: 'average', seed: 1, maxQuests: 6 });
    expect(result.quests).toBe(6);
    // Five gaps between six quests. Several quests inside one hour would never
    // let a half-life elapse, and every pacing number would be meaningless.
    expect(result.elapsedHours).toBeGreaterThanOrEqual(HOURS_PER_QUEST_MIN * 5);
    expect(result.elapsedHours).toBeLessThanOrEqual(HOURS_PER_QUEST_MAX * 5);
  });

  it('stops at maxQuests', () => {
    const result = simulateChild({ profile: 'fast', seed: 1, maxQuests: 2 });
    expect(result.quests).toBe(2);
    expect(result.complete).toBe(false);
  });

  it('plays at most one session length per quest, and shortens only on a bad day', () => {
    const result = simulateChild({ profile: 'struggling', seed: 1, maxQuests: 5 });
    expect(result.tasksPlayed).toBeLessThanOrEqual(5 * 14);
    expect(result.tasksPlayed).toBeGreaterThanOrEqual(5 * 8);
  });

  it('scaffolds a struggling child far more than a strong one', () => {
    const fast = simulateChild({ profile: 'fast', seed: 1, maxQuests: 6 });
    const slow = simulateChild({ profile: 'struggling', seed: 1, maxQuests: 6 });
    expect(slow.scaffoldedAnswers).toBeGreaterThan(fast.scaffoldedAnswers);
  });

  it('reports where the child stands when it stops', () => {
    const result = simulateChild({ profile: 'fast', seed: 1, maxQuests: 3 });
    expect(result.progress.level).toBe(1);
    expect(result.progress.complete).toBe(result.complete);
  });

  it('different seeds give different children', () => {
    const a = simulateChild({ profile: 'average', seed: 1, maxQuests: 6 });
    const b = simulateChild({ profile: 'average', seed: 2, maxQuests: 6 });
    expect(a).not.toEqual(b);
  });
});

describe('closingTask: the runner promise that a quest does not close on a fluffed target', () => {
  const task = (id: string, target: string, taskTypeId: string, difficulty: number, skill: TaskInstance['skill'] = 'SOUND_ID'): TaskInstance => ({
    id, taskTypeId, skill, primaryTarget: target, secondaryTargets: [], choices: [], correctChoice: target,
    band: 'focus', anchor: false, difficulty, seed: 1,
  });
  const hunt = (id: string, target: string) => task(id, target, 'sound-hunt', 1);
  const singer = (id: string, target: string) => task(id, target, 'sound-singer', 2, 'LETTER_SOUND');
  const outcomes = (entries: Array<[string, Partial<TargetOutcome>]>) =>
    new Map<string, TargetOutcome>(entries.map(([k, v]) => [k, { right: false, failed: false, ...v }]));

  it('keeps the planned close when its target was not failed', () => {
    const planned = singer('close', 's');
    const earlier = [hunt('a', 'a'), hunt('s1', 's')];
    const seen = outcomes([['a::SOUND_ID', { right: true }], ['s::SOUND_ID', { right: true }]]);
    expect(closingTask(planned, earlier, seen)).toBe(planned);
  });

  it('keeps the planned close when nothing has been played yet', () => {
    const planned = hunt('only', 's');
    expect(closingTask(planned, [], outcomes([]))).toBe(planned);
  });

  it('swaps to a target the child got right when the planned one was failed earlier', () => {
    const planned = hunt('close', 's');
    const earlier = [hunt('s1', 's'), hunt('a1', 'a')];
    const seen = outcomes([['s::SOUND_ID', { failed: true }], ['a::SOUND_ID', { right: true }]]);
    expect(closingTask(planned, earlier, seen).primaryTarget).toBe('a');
  });

  it('does not swap to a target that was both right and failed', () => {
    const planned = hunt('close', 's');
    const earlier = [hunt('s1', 's'), hunt('a1', 'a'), hunt('t1', 't')];
    const seen = outcomes([
      ['s::SOUND_ID', { failed: true }],
      ['a::SOUND_ID', { right: true, failed: true }],
      ['t::SOUND_ID', { right: true }],
    ]);
    expect(closingTask(planned, earlier, seen).primaryTarget).toBe('t');
  });

  it('judges a pairing, not a bare target: failing s by ear says nothing about singing it', () => {
    const planned = singer('close', 's');
    const earlier = [hunt('s1', 's')];
    const seen = outcomes([['s::SOUND_ID', { failed: true }]]);
    expect(closingTask(planned, earlier, seen)).toBe(planned);
  });

  it('prefers a different mini-game from the task just before, even when that one is harder', () => {
    const planned = hunt('close', 's');
    const earlier = [hunt('x1', 'a'), singer('x2', 't'), hunt('x3', 'p')];
    const seen = outcomes([
      ['s::SOUND_ID', { failed: true }],
      ['a::SOUND_ID', { right: true }],
      ['t::LETTER_SOUND', { right: true }],
      ['p::SOUND_ID', { right: true }],
    ]);
    // The task before the close is a hunt. Both hunts are easier than the
    // singer, but closing on a third hunt in a row is what the quest avoids.
    expect(closingTask(planned, earlier, seen).id).toBe('x2');
  });

  it('prefers the easier of two proven tasks when the mini-game differs equally', () => {
    const planned = singer('close', 's');
    const earlier = [singer('x0', 'a'), task('x1', 't', 'picture-match', 3, 'BLEND_READ'), hunt('x2', 'p'), singer('x3', 'm')];
    const seen = outcomes([
      ['s::LETTER_SOUND', { failed: true }],
      ['a::LETTER_SOUND', { right: true }],
      ['t::BLEND_READ', { right: true }],
      ['p::SOUND_ID', { right: true }],
      ['m::LETTER_SOUND', { right: true }],
    ]);
    expect(closingTask(planned, earlier, seen).id).toBe('x2');
  });

  it('falls back to the easiest task there is when the child got nothing right', () => {
    const planned = singer('close', 's');
    const earlier = [hunt('x2', 'a'), singer('x1', 's')];
    const seen = outcomes([['s::LETTER_SOUND', { failed: true }], ['a::SOUND_ID', { failed: true }]]);
    expect(closingTask(planned, earlier, seen).id).toBe('x2');
    // Still the easiest when neither shares the previous mini-game.
    const mixed = [task('y1', 'p', 'picture-match', 3, 'BLEND_READ'), task('y2', 'a', 'sound-hunt', 1), task('y3', 't', 'word-builder', 4, 'SEGMENT_SPELL')];
    const seen2 = outcomes([['s::LETTER_SOUND', { failed: true }]]);
    expect(closingTask(planned, mixed, seen2).id).toBe('y2');
  });
});

describe('simulation: the closing swap in play', () => {
  // Sampled across seeds. A single seed pins one random stream, so any change to how the engine draws
  // numbers flips it for no reason that matters; the difference between a struggling child and a strong
  // one is large and robust (measured over 40 seeds of 8 quests: 1.93 swaps for struggling, 0.97 for
  // average, 0.20 for fast), and that is what is asserted.
  const swapsPerQuest = (profile: ChildProfile, config?: Record<string, number>) => {
    const runs = Array.from({ length: 20 }, (_, i) => simulateChild({ profile, seed: i + 1, maxQuests: 8, config }));
    return {
      swaps: runs.reduce((a, r) => a + r.closingSwaps, 0) / runs.length,
      scaffolded: runs.reduce((a, r) => a + r.scaffoldedAnswers, 0),
      failedEndings: runs.reduce((a, r) => a + r.questsEndingOnFailure, 0),
      quests: runs.reduce((a, r) => a + r.quests, 0),
      endedOnFailure: runs.reduce((a, r) => a + r.questsEndingOnFailure, 0),
    };
  };

  it('swaps the close for struggling children, and counts quests that still end badly', () => {
    const struggling = swapsPerQuest('struggling');
    expect(struggling.swaps).toBeGreaterThanOrEqual(1);
    // The swap picks something the child answered right, but they can still
    // get it wrong this time: a flat-accuracy child cannot be promised a win.
    expect(struggling.endedOnFailure).toBeLessThanOrEqual(struggling.quests);
  });

  it('counts an answer the child was handed as a failure, for the ending and for the swap', () => {
    // Every wrong answer is scaffolded straight away, so a child is never
    // recorded as wrong, only as shown the answer. Those must still count as
    // failures: they did not succeed.
    const handed = swapsPerQuest('struggling', { scaffoldAfterErrors: 1, abandonAfterErrors: 9 });
    expect(handed.scaffolded).toBeGreaterThan(0);
    expect(handed.failedEndings).toBeGreaterThan(0);
    expect(handed.swaps).toBeGreaterThan(0);
  });

  it('a strong child is rarely swapped, and far less often than a struggling one', () => {
    const fast = swapsPerQuest('fast');
    const slow = swapsPerQuest('struggling');
    expect(fast.swaps).toBeLessThan(slow.swaps);
    expect(slow.swaps).toBeGreaterThanOrEqual(2 * fast.swaps);
    expect(fast.swaps).toBeLessThanOrEqual(0.6);
  });
});

