import { withDefaults } from './config';
import type { EngineConfig } from './config';
import { levelProgress } from './completion';
import type { LevelProgress } from './completion';
import { recordConfusion } from './distractors';
import { FrustrationGuard } from './frustration';
import { makeRng } from './rng';
import { buildSession } from './sessionBuilder';
import { recordTaskResult } from './taskOutcome';
import type { ConfusionMap, MasteryMap, TaskInstance } from './types';

export type ChildProfile = 'fast' | 'average' | 'struggling';

export interface SimulateArgs {
  profile: ChildProfile;
  seed: number;
  level?: number;
  maxQuests?: number;
  config?: Partial<EngineConfig>;
}

export interface SimulateResult {
  profile: ChildProfile;
  quests: number;
  tasksPlayed: number;
  complete: boolean;
  /** Where the child stands when the run stops, for seeing which quota held them back. */
  progress: LevelProgress;
  /**
   * Quests whose last task was answered wrongly or only with the answer shown.
   * A scaffolded answer is not a success: the child was handed it.
   */
  questsEndingOnFailure: number;
  /** Quests where the runner swapped the closing task because its target had been failed earlier. */
  closingSwaps: number;
  /** Quests that closed on a target the child had failed or been scaffolded on earlier in that quest. */
  questsClosingOnFailedTarget: number;
  scaffoldedAnswers: number;
  /** Simulated hours from the first quest's start to the last quest's start. */
  elapsedHours: number;
}

/** Probability a synthetic child answers correctly, before any help. */
const ACCURACY: Record<ChildProfile, number> = {
  fast: 0.95,
  average: 0.8,
  struggling: 0.55,
};

/** Milliseconds a synthetic child takes. Struggling children are also slower. */
const LATENCY: Record<ChildProfile, number> = {
  fast: 1200,
  average: 2600,
  struggling: 5200,
};

const HOUR = 3_600_000;

export interface TargetOutcome {
  /** Answered correctly and unaided at least once this quest. */
  right: boolean;
  /** Answered wrongly, or only with the answer shown, at least once this quest. */
  failed: boolean;
}

/** A target as asked in one skill: failing /s/ by ear says nothing about singing it. */
const pairingOf = (task: TaskInstance): string => `${task.primaryTarget}::${task.skill}`;

/**
 * The runner's closing-anchor promise (spec 5.4, Task 27). The builder can only
 * guarantee the closing target was ASKED earlier; the runner knows the answers.
 * If the child failed the planned closing target earlier in this quest, close
 * on something they got right instead (a different mini-game from the task
 * before it where possible, easiest first), else on the easiest task there is.
 * Closing on the one sound they fluffed is worse than having no anchor.
 */
export function closingTask(
  planned: TaskInstance,
  earlier: readonly TaskInstance[],
  outcomes: ReadonlyMap<string, TargetOutcome>,
): TaskInstance {
  if (!outcomes.get(pairingOf(planned))?.failed) return planned;
  const previousType = earlier[earlier.length - 1]?.taskTypeId;
  const easiest = (tasks: readonly TaskInstance[]) =>
    [...tasks].sort(
      (a, b) =>
        Number(a.taskTypeId === previousType) - Number(b.taskTypeId === previousType) ||
        a.difficulty - b.difficulty,
    )[0];
  const proven = earlier.filter((t) => {
    const o = outcomes.get(pairingOf(t));
    return o?.right && !o.failed;
  });
  if (proven.length > 0) return easiest(proven);
  return earlier.length > 0 ? easiest(earlier) : planned;
}
/** Time a child spends on one task. */
const TASK_MS = 20_000;
/** From the end of one quest to the start of the next: one quest per day. */
const OVERNIGHT_MS = 20 * HOUR;

/**
 * Plays a synthetic child through a level, one quest per simulated day.
 *
 * One quest per day matters: mastery requires retention across sessions, so
 * simulating several quests within one hour would never exercise decay and the
 * numbers would be meaningless.
 */
export function simulateChild(args: SimulateArgs): SimulateResult {
  const config = withDefaults(args.config);
  const level = args.level ?? 1;
  const maxQuests = args.maxQuests ?? 40;
  const rng = makeRng(args.seed);
  const accuracy = ACCURACY[args.profile];
  const latency = LATENCY[args.profile];

  let mastery: MasteryMap = {};
  let confusions: ConfusionMap = {};
  const start = 1000 * HOUR;
  let now = start;
  let lastQuestStart = start;
  let quests = 0;
  let tasksPlayed = 0;
  let scaffoldedAnswers = 0;
  let questsEndingOnFailure = 0;
  let closingSwaps = 0;
  let questsClosingOnFailedTarget = 0;

  while (quests < maxQuests && !levelProgress(level, mastery, now, config).complete) {
    quests += 1;
    lastQuestStart = now;
    const sessionId = `sim-${args.seed}-${quests}`;
    const guard = new FrustrationGuard(config);

    let plan = buildSession({ sessionId, level, mastery, confusions, now, config });
    let lastOutcomeSuccess = true;
    const outcomes = new Map<string, TargetOutcome>();
    const played: TaskInstance[] = [];

    for (let i = 0; i < plan.length; i += 1) {
      let task = plan[i];
      if (i === plan.length - 1) {
        const closing = closingTask(task, played, outcomes);
        if (closing !== task) closingSwaps += 1;
        task = closing;
        if (outcomes.get(pairingOf(task))?.failed) questsClosingOnFailedTarget += 1;
      }
      tasksPlayed += 1;
      now += TASK_MS;

      let correct = rng() < accuracy;
      let scaffolded = false;
      let chosen: string | undefined;

      if (correct) {
        guard.record(task.primaryTarget, true);
      } else {
        // A wrong answer triggers the guard, which may hand the child the answer.
        const directive = guard.record(task.primaryTarget, false);
        if (directive.scaffold) {
          scaffolded = true;
          correct = true;
          scaffoldedAnswers += 1;
        } else if (task.skill !== 'SEGMENT_SPELL') {
          // Spelling has no single wrong pick to learn from: its choices are
          // letter tiles, not alternatives to the answer.
          const wrong = task.choices.filter((c) => c !== task.correctChoice);
          chosen = wrong[Math.floor(rng() * wrong.length)];
        }
        if (directive.truncateTo !== null && directive.truncateTo < plan.length) {
          plan = plan.slice(0, directive.truncateTo);
        }
      }

      mastery = recordTaskResult(
        mastery,
        task,
        { sessionId, correct, scaffolded, latencyMs: latency, at: now, ...(chosen === undefined ? {} : { chosen }) },
        config,
      );
      if (chosen !== undefined) confusions = recordConfusion(confusions, task.primaryTarget, chosen);

      const seen = outcomes.get(pairingOf(task)) ?? { right: false, failed: false };
      if (correct && !scaffolded) seen.right = true;
      else seen.failed = true;
      outcomes.set(pairingOf(task), seen);
      played.push(task);

      lastOutcomeSuccess = correct && !scaffolded;
    }

    if (!lastOutcomeSuccess) questsEndingOnFailure += 1;

    // Next quest is the next day.
    now += OVERNIGHT_MS;
  }

  const progress = levelProgress(level, mastery, now, config);
  return {
    profile: args.profile,
    quests,
    tasksPlayed,
    complete: progress.complete,
    progress,
    questsEndingOnFailure,
    closingSwaps,
    questsClosingOnFailedTarget,
    scaffoldedAnswers,
    elapsedHours: (lastQuestStart - start) / HOUR,
  };
}
