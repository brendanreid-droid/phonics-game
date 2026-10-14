import { getGrapheme, getWord } from '@soundlings/curriculum';
import {
  TASK_TYPES,
  buildSession,
  closingTask,
  masteryKey,
} from '@soundlings/engine';
import type {
  Attempt,
  ConfusionMap,
  EngineConfig,
  MasteryMap,
  TargetId,
  TargetOutcome,
  TaskInstance,
} from '@soundlings/engine';

/**
 * Every decision the quest runner makes that no human can eyeball lives here,
 * as plain functions, so it can be tested without rendering anything. The
 * runner itself (QuestRunner.ts) only sequences them.
 */

export interface Judgement {
  correct: boolean;
  chosen?: TargetId;
}

/**
 * Compares an answer to the task's correct choice.
 *
 * For a spelling task the answer is the assembled word and `correctChoice` is
 * the word id, so this is an exact comparison of the whole word: spelling "tap"
 * for "pat" uses the same letters and is still wrong.
 *
 * Case-insensitive, defensively. Word ids are lowercase today ("Sam" is the
 * display text, "sam" the id); this means a capitalised id or a tile label can
 * never mark a correctly spelled word wrong.
 */
export function judgeAnswer(task: TaskInstance, answer: string): Judgement {
  const correct = answer.toLowerCase() === task.correctChoice.toLowerCase();
  return correct ? { correct: true } : { correct: false, chosen: answer };
}

/**
 * What to remember about a wrong pick, or undefined when there is nothing worth
 * remembering. A spelling "answer" is a whole mis-built word, not one
 * alternative the child mixed up with the target, so it is not a confusion.
 * The simulation makes the same exclusion.
 */
export function confusionFor(task: TaskInstance, judgement: Judgement): TargetId | undefined {
  if (judgement.correct || task.skill === 'SEGMENT_SPELL') return undefined;
  return judgement.chosen;
}

export interface QuestTally {
  /** Tasks on which the child gave a wrong answer that counted as an error. */
  errors: number;
  /** Tasks the child finished only with the answer shown. */
  scaffolds: number;
}

/**
 * Stars for a finished quest. The floor is one.
 *
 * Three stars allow one slip, two allow a few mistakes and a couple of helped
 * finishes. Three errors in fourteen tasks is a good session for a five-year-old.
 *
 * A child who sat through fourteen tasks has earned something, whatever the
 * accuracy. Zero stars is a punishment for effort, and effort is exactly the
 * behaviour that brings them back tomorrow.
 */
export function starsFor(tally: QuestTally): 1 | 2 | 3 {
  if (tally.errors <= 1 && tally.scaffolds === 0) return 3;
  if (tally.errors <= 4 && tally.scaffolds <= 2) return 2;
  return 1;
}

export { dimmedFor } from './dimming';

// --- what the child has done this quest ------------------------------------

/** The key a target is tracked under: per skill, because singing /s/ is not hearing it. */
export function pairingKey(task: TaskInstance): string {
  return masteryKey(task.primaryTarget, task.skill);
}

export type QuestOutcomes = Map<string, TargetOutcome>;

/**
 * Notes how a finished outcome counts towards the closing-anchor promise. Right
 * means answered correctly and unaided; failed means answered wrongly or only
 * with the answer shown. Both can be true of one target: that child got it
 * right the second time, and was not on a clean success, so it is not proven.
 */
export function noteOutcome(outcomes: QuestOutcomes, task: TaskInstance, success: boolean): void {
  const seen = outcomes.get(pairingKey(task)) ?? { right: false, failed: false };
  if (success) seen.right = true;
  else seen.failed = true;
  outcomes.set(pairingKey(task), seen);
}

/** Whether a recorded outcome was a clean success: correct, and not shown the answer. */
export const isCleanSuccess = (outcome: { correct: boolean; scaffolded: boolean }): boolean =>
  outcome.correct && !outcome.scaffolded;

/**
 * Whether an attempt is the task's own, as against secondary credit for a
 * grapheme inside a word. Not told by weight: an answer given after the choices
 * were narrowed is a primary attempt at half weight, the same as a secondary.
 * Told by skill instead: a primary attempt is in the skill of the mini-game that
 * produced it, and secondary credit is always recorded under another skill.
 */
function isPrimaryAttempt(attempt: Attempt): boolean {
  return TASK_TYPES.find((type) => type.id === attempt.taskTypeId)?.skill === attempt.skill;
}

/**
 * Rebuilds what the child has done this quest from the attempt log, for a quest
 * resumed after an interruption.
 *
 * Without it a resumed quest would forget that the child fluffed /s/ before the
 * interruption, and the closing anchor could land on exactly that sound. Only
 * a task's own attempts count: secondary credit belongs to graphemes the child
 * was not directly asked.
 */
export function replayQuest(
  attempts: readonly Attempt[],
  sessionId: string,
): { outcomes: QuestOutcomes; tally: QuestTally } {
  const outcomes: QuestOutcomes = new Map();
  const tally: QuestTally = { errors: 0, scaffolds: 0 };
  for (const attempt of attempts) {
    if (attempt.sessionId !== sessionId || !isPrimaryAttempt(attempt)) continue;
    const key = masteryKey(attempt.targetId, attempt.skill);
    const seen = outcomes.get(key) ?? { right: false, failed: false };
    if (isCleanSuccess(attempt)) seen.right = true;
    else seen.failed = true;
    outcomes.set(key, seen);
    if (!attempt.correct) tally.errors += 1;
    if (attempt.scaffolded) tally.scaffolds += 1;
  }
  return { outcomes, tally };
}

/**
 * Keeps the closing-anchor promise.
 *
 * The session builder can guarantee only that the closing target was ASKED
 * earlier. Whether the child got it right is known only now. When the final
 * task is reached and its target was failed earlier in this quest, the close is
 * swapped for one they answered cleanly, else the easiest there is (the engine's
 * `closingTask`, which the simulation also uses). Closing on the one sound they
 * fluffed twenty seconds ago is worse than having no anchor at all.
 *
 * The swapped-in task gets a fresh id for its slot: it is a repeat of an earlier
 * task, and a repeated id would let the screen reuse the earlier task's state.
 * Always returns a new array; it equals the input when nothing is swapped.
 */
export function applyClosingSwap(
  plan: readonly TaskInstance[],
  index: number,
  outcomes: QuestOutcomes,
): TaskInstance[] {
  if (index !== plan.length - 1) return [...plan];
  const planned = plan[index];
  const closing = closingTask(planned, plan.slice(0, index), outcomes);
  if (closing === planned) return [...plan];
  const swapped: TaskInstance = {
    ...closing,
    id: slotId(index, closing),
    anchor: true,
  };
  return [...plan.slice(0, index), swapped];
}

/** Task ids carry their absolute position, as the session builder's do, so they stay unique in a quest. */
function slotId(position: number, task: TaskInstance): string {
  return `${position}-${task.taskTypeId}-${task.primaryTarget}`;
}

/** After an abandon on a bad day, at least this many tasks remain: an opener and a close. */
export const MIN_TAIL = 2;

/**
 * Applies the frustration guard's directives to the rest of a quest, after it
 * abandons a task.
 *
 * The guard reports its difficulty cap and its shortened length only on the
 * answer that triggers them, so the runner has to act on them then. The rest of
 * the quest is rebuilt under the cap, and it comes with its own opening anchor:
 * the child who was just let off a task they could not do is handed an easy win
 * next, which is the "insert a win-back" the guard asks for. A bad day shortens
 * the quest, but never below `MIN_TAIL`, so it still ends on an anchor.
 *
 * Never throws. A quest that cannot be rebuilt is shortened in place instead,
 * because an error in front of a child who is already struggling is the worst
 * available outcome.
 */
export function replanRemaining(args: {
  plan: readonly TaskInstance[];
  /** The index of the first task not yet played. */
  nextIndex: number;
  sessionId: string;
  level: number;
  mastery: MasteryMap;
  confusions: ConfusionMap;
  now: number;
  config: EngineConfig;
  maxDifficulty: number | null;
  truncateTo: number | null;
}): TaskInstance[] {
  const { plan, nextIndex } = args;
  const played = plan.slice(0, nextIndex);
  const remaining = plan.length - nextIndex;
  if (remaining <= 0) return [...plan];

  const length =
    args.truncateTo === null
      ? remaining
      : Math.min(remaining, Math.max(MIN_TAIL, args.truncateTo - nextIndex));
  if (args.maxDifficulty === null && length === remaining) return [...plan];

  try {
    const rebuilt = buildSession({
      // The session id the child's evidence is recorded under never changes; this
      // only seeds the rebuild.
      sessionId: `${args.sessionId}:r${nextIndex}`,
      level: args.level,
      mastery: args.mastery,
      confusions: args.confusions,
      now: args.now,
      config: args.config,
      length,
      ...(args.maxDifficulty === null ? {} : { maxDifficulty: args.maxDifficulty }),
    });
    return [...played, ...rebuilt.map((task, i) => ({ ...task, id: slotId(nextIndex + i, task) }))];
  } catch {
    return [...played, ...plan.slice(nextIndex, nextIndex + length)];
  }
}

// --- reading a stored quest back --------------------------------------------

/**
 * Whether a stored quest would be resumed, rather than a fresh one started.
 *
 * The one rule the quest runner and the island both go by, so the island only
 * says "Keep going" when the runner really will: same level, something left to
 * answer, and a plan this build can render.
 */
export function canResume(
  active: { level: number; index: number; plan: readonly TaskInstance[] } | null,
  level: number,
): boolean {
  return (
    active !== null && active.level === level && active.index < active.plan.length && isPlayablePlan(active.plan)
  );
}

/**
 * Whether a stored plan can be played by this build.
 *
 * `isActiveSession` checks the shape of the envelope. This checks that every
 * task in it is one the mini-games can render: a task type that no longer
 * exists, or a target the curriculum has dropped, would throw while rendering,
 * and since the same plan would be reloaded on every launch the child would be
 * locked out until storage was cleared. A plan that fails is treated as no plan.
 */
export function isPlayablePlan(plan: readonly TaskInstance[]): boolean {
  if (plan.length === 0) return false;
  return plan.every((task) => {
    try {
      const type = TASK_TYPES.find((t) => t.id === task.taskTypeId);
      if (!type || type.skill !== task.skill) return false;
      if (typeof task.id !== 'string' || typeof task.primaryTarget !== 'string') return false;
      if (!Array.isArray(task.choices) || !task.choices.every((c) => typeof c === 'string')) return false;
      if (!Array.isArray(task.secondaryTargets)) return false;
      if (typeof task.correctChoice !== 'string') return false;
      if (task.skill === 'SOUND_ID' || task.skill === 'LETTER_SOUND') {
        getGrapheme(task.correctChoice);
        task.choices.forEach((c) => getGrapheme(c));
        return task.choices.includes(task.correctChoice);
      }
      const word = getWord(task.correctChoice);
      if (task.skill === 'BLEND_READ') {
        task.choices.forEach((c) => getWord(c));
        return task.choices.includes(task.correctChoice);
      }
      task.choices.forEach((c) => getGrapheme(c));
      return word.graphemes.every((g) => task.choices.includes(g));
    } catch {
      return false;
    }
  });
}

// --- audio to warm up ------------------------------------------------------

const PROMPT_KEYS = [
  'ui.which_says',
  'ui.which_sound',
  'ui.find_letter',
  'ui.build_word',
  'ui.tap_picture',
  'ui.find_word',
  'ui.all_done',
];

/** Audio the next few tasks will want, so a prompt never arrives late. */
export function preloadKeysFor(tasks: readonly TaskInstance[]): string[] {
  const keys = new Set<string>(PROMPT_KEYS);
  for (const task of tasks) {
    try {
      if (task.skill === 'SOUND_ID' || task.skill === 'LETTER_SOUND') {
        for (const choice of task.choices) keys.add(getGrapheme(choice).audio.phoneme);
      } else {
        const word = getWord(task.correctChoice);
        keys.add(word.audio);
        for (const g of word.graphemes) keys.add(getGrapheme(g).audio.phoneme);
      }
    } catch {
      // A task that cannot resolve will fail loudly when it renders; warming
      // audio for it is not worth a second failure.
    }
  }
  return [...keys];
}

// --- the results screen's inputs -------------------------------------------

/**
 * The stars to show, from a route parameter. Anything unreadable is one star,
 * not zero and not NaN: the floor is part of the design.
 */
export function starsFromParam(raw: string | string[] | undefined): 1 | 2 | 3 {
  const text = Array.isArray(raw) ? raw[0] : raw;
  const value = Math.round(Number(text));
  if (!Number.isFinite(value) || value <= 1) return 1;
  return value >= 3 ? 3 : 2;
}

/** Creature ids from a route parameter, which may arrive as a string, an array or nothing. */
export function creatureIdsFromParam(raw: string | string[] | undefined): string[] {
  const text = Array.isArray(raw) ? raw.join(',') : (raw ?? '');
  return text.split(',').map((id) => id.trim()).filter((id) => id.length > 0);
}
