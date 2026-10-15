import { GRAPHEMES, WORDS, getLevel, graphemesForLevel } from '@soundlings/curriculum';
import { TASK_TYPES } from '@soundlings/engine';
import type { Attempt } from '@soundlings/engine';

/**
 * The "needs a hand" signal: is this child answering about as well as chance?
 *
 * This is the reason the parent area exists. The mastery gate is statistical,
 * not absolute (spec §11.1): a child answering at chance eventually passes it,
 * and 40 of 50 simulated near-chance children completed Level 1 given enough
 * attempts, at a mean of 72 quests. No gate built on counting right answers can
 * be made luck-proof, so the engine cannot hold the line alone. A five-year-old
 * who is guessing needs a person beside them, and the most useful thing the app
 * can do is say so rather than let them grind through another seventy quests.
 *
 * What it must not do is cry wolf. A flag that fires on one bad afternoon
 * teaches a parent to ignore it, which is worse than having none. So:
 *
 *  - It looks at the child's last three sittings, each of which has to be
 *    consistent with guessing, and the three together too. One good sitting in
 *    the window clears it, and it clears as soon as the child improves because
 *    the old sittings fall out of the window.
 *  - It needs a minimum of real answers, so a short visit is not a sitting.
 *  - Chance is not a flat rate. Two choices means 50%, four means 25%, and the
 *    same score is guessing in one and fine in the other. It is worked out from
 *    the choices the child actually saw (see `choiceCountsSeen`).
 */

export interface NeedsAHand {
  raised: boolean;
  /** What the grown-up reads. Empty when `raised` is false. */
  message: string;
}

/**
 * Said to a parent about their five-year-old, who will probably hear it
 * repeated. It names no number and no verdict, says what to do, and does no
 * harm if repeated to the child. Do not add "failing", "behind", "struggling"
 * or "below average", and do not turn it into an explanation of the maths.
 */
export const NEEDS_A_HAND_MESSAGE =
  'Some of these sounds are proving tricky. Sounds take time, and some take longer than others. ' +
  'Ten minutes sitting together will help more than more time on the app: say each sound out loud, ' +
  'point to the letter, and let them hear you do it first. The quests will be here when they are ready.';

/** The last this-many sittings are judged. Fewer would be one bad afternoon. */
const SITTINGS = 3;
/** Fewer real answers than this is a visit, not a sitting. A quest is fourteen tasks. */
const MIN_TRIALS_PER_SITTING = 6;
/** Across the sittings judged. Short enough that three real quests reach it. */
const MIN_TRIALS_TOTAL = 30;
/**
 * How far above chance a score can be and still count as consistent with it, in
 * standard deviations of what guessing would give. 1.5 lets about 93 in 100
 * guessing sittings through while a child answering 70% on two choices over
 * three sittings sits well clear of it.
 */
const Z_LIMIT = 1.5;

/** Games that assemble something from tiles rather than tap one of several choices. */
const ASSEMBLY_TASKS: ReadonlySet<string> = new Set(['word-builder']);

// --- how many choices the child saw -----------------------------------------

/**
 * Graphemes in the level's introduction groups, in the order opened. A grapheme
 * taught at an earlier level is open from the start.
 */
function groupIndexOf(targetId: string, level: number): number | null {
  const groups = getLevel(level).introductionGroups;
  const has = (table: object) => Object.prototype.hasOwnProperty.call(table, targetId);
  const ids = has(GRAPHEMES) ? [targetId] : has(WORDS) ? WORDS[targetId].graphemes : null;
  if (ids === null) return null;
  const indexes = ids.map((id) => groups.findIndex((group) => group.includes(id)));
  return Math.max(...indexes);
}

/** How many sounds a child with groups 0..furthest open has met. Mirrors metGraphemes.ts in the engine. */
function metCount(level: number, furthest: number): number {
  const opened = new Set(getLevel(level).introductionGroups.slice(0, Math.max(0, furthest) + 1).flat());
  return graphemesForLevel(level).filter((g) => g.introducedInLevel < level || opened.has(g.id)).length;
}

const typeOf = (id: string) => TASK_TYPES.find((t) => t.id === id);

/** An answer is for the task's own target. The credit a word task gives its letters is a different skill. */
export function isPrimary(attempt: Attempt): boolean {
  const type = typeOf(attempt.taskTypeId);
  return type !== undefined && type.skill === attempt.skill;
}

/**
 * For each attempt, how many choices were on the screen, or null where that is
 * not a number of choices (the credit a word task gives its letters, a game this
 * build does not know, or Word Builder, which assembles a word from tiles).
 *
 * Read from `Attempt.choiceCount`, which the quest runner now writes down. The
 * rest of this function is the fallback for attempts logged before that field
 * existed, whose history must keep working: there the count is reconstructed the
 * way the session builder chose it. A quest shows `met - 1` choices, kept
 * between the game's own minimum and maximum (`makeTask` in the engine's
 * sessionBuilder), where `met` is how many sounds the child has been introduced
 * to. Introduction is read from the furthest group of sounds the child has been
 * asked about by the end of that sitting, which is exact for the builder's rule
 * once a sitting has touched the newest group, as a quest on it always does.
 *
 * The reconstruction is checked against the sessions the engine really builds
 * (needsAHand.test.ts), with the recorded field stripped. It can only be wrong
 * in the direction of too few choices, which makes chance look higher than it
 * was and so makes the signal slightly easier to raise, never harder: a missed
 * guesser costs more than a flag that clears itself.
 */
export function choiceCountsSeen(attempts: readonly Attempt[], level = 1): Array<number | null> {
  // The furthest group reached by the end of each sitting, cumulatively.
  const order: string[] = [];
  const furthestIn = new Map<string, number>();
  for (const attempt of attempts) {
    if (!furthestIn.has(attempt.sessionId)) {
      order.push(attempt.sessionId);
      furthestIn.set(attempt.sessionId, 0);
    }
    // Oral blending must not move this on. Its target is a word, and the words
    // it uses are every picturable one at the level regardless of which letters
    // the child has met — hearing that /m/-/a/-/p/ is "map" says nothing about
    // having been introduced to `m`. Letting it count made the reconstruction
    // think a child on day one had reached the last introduction group.
    if (attempt.skill === 'ORAL_BLEND') continue;
    const group = groupIndexOf(attempt.targetId, level);
    if (group !== null && group > furthestIn.get(attempt.sessionId)!) furthestIn.set(attempt.sessionId, group);
  }
  const reached = new Map<string, number>();
  let furthest = 0;
  for (const sessionId of order) {
    furthest = Math.max(furthest, furthestIn.get(sessionId)!);
    reached.set(sessionId, furthest);
  }

  return attempts.map((attempt) => {
    const type = typeOf(attempt.taskTypeId);
    if (type === undefined || !isPrimary(attempt) || ASSEMBLY_TASKS.has(type.id)) return null;
    // A recorded count wins. Anything that is not a whole number of at least two
    // cannot be a count of choices and is treated as not recorded.
    if (Number.isInteger(attempt.choiceCount) && attempt.choiceCount! >= 2) return attempt.choiceCount!;
    const met = metCount(level, reached.get(attempt.sessionId)!);
    return Math.min(type.maxChoices, Math.max(type.minChoices, met - 1));
  });
}

// --- the answers that count -------------------------------------------------

export interface Trial {
  sessionId: string;
  correct: boolean;
  /** The probability of being right by luck: one over the choices, at least one half if hinted. */
  chance: number;
}

/**
 * The answers that say something about guessing, each with the chance of
 * getting it right by luck.
 *
 * Left out:
 *  - Answers where the child was shown the answer: they prove nothing either way.
 *  - The credit a word task gives its letters: not questions the child was asked.
 *  - A game this build does not know.
 *  - Word Builder, which assembles a word from tiles and is not a tap among
 *    choices. A word is not something luck builds, so a success there would say
 *    "not guessing" loudly, but a child who cannot yet do the taps cannot do it
 *    either, and the engine's own near-chance children pass it as often as they
 *    pass anything. Counting it would hide exactly the child this is for. Left
 *    out, the signal rests on the taps alone.
 *  - The right tap that follows a wrong one on the same sound. The wrong tap
 *    narrows the choices and the child then taps the one that is left; logged
 *    as a second answer, a child guessing between two would read as 75% right
 *    and the signal would miss exactly the child it is for.
 *
 * A right answer after a hint narrowed the choices before any tap is real but
 * partly a coin flip, so its chance is at least one half.
 */
export function trialsFrom(attempts: readonly Attempt[], level = 1): Trial[] {
  const choices = choiceCountsSeen(attempts, level);
  const trials: Trial[] = [];
  let previous: Attempt | null = null;

  attempts.forEach((attempt, index) => {
    if (!isPrimary(attempt)) return;
    const retry =
      previous !== null &&
      previous.sessionId === attempt.sessionId &&
      previous.targetId === attempt.targetId &&
      previous.skill === attempt.skill &&
      !previous.correct &&
      !previous.scaffolded &&
      attempt.correct &&
      attempt.weight < 1;
    previous = attempt;

    if (attempt.scaffolded || retry) return;
    const count = choices[index];
    if (count === null) return; // Word Builder: see above.
    const base = 1 / count;
    const aided = attempt.correct && attempt.weight < 1;
    trials.push({
      sessionId: attempt.sessionId,
      correct: attempt.correct,
      chance: aided ? Math.max(base, 0.5) : base,
    });
  });

  return trials;
}

// --- the verdict ------------------------------------------------------------

interface Score {
  /** How many more right than luck would give, in standard deviations. */
  z: number;
  taps: number;
}

function score(trials: readonly Trial[]): Score {
  let right = 0;
  let expected = 0;
  let variance = 0;
  let taps = 0;
  for (const trial of trials) {
    if (trial.correct) right += 1;
    expected += trial.chance;
    variance += trial.chance * (1 - trial.chance);
    taps += 1;
  }
  return { z: variance === 0 ? 0 : (right - expected) / Math.sqrt(variance), taps };
}

const NOT_RAISED: NeedsAHand = { raised: false, message: '' };

/** Sittings in the order they began, keeping only those with enough real taps. */
function realSittings(trials: readonly Trial[]): Trial[][] {
  const bySitting = new Map<string, Trial[]>();
  for (const trial of trials) {
    bySitting.set(trial.sessionId, [...(bySitting.get(trial.sessionId) ?? []), trial]);
  }
  return [...bySitting.values()].filter(
    (sitting) => sitting.length >= MIN_TRIALS_PER_SITTING,
  );
}

/**
 * The quests that count as "recently", oldest first: the last few sittings with
 * enough real answers to be a sitting. This is the window `needsAHand` judges,
 * exported so that what the parent is told about mix-ups is drawn from the same
 * stretch of play as the near-chance signal, and the two tell one story.
 */
export function recentSittings(attempts: readonly Attempt[], level = 1): string[] {
  return realSittings(trialsFrom(attempts, level))
    .slice(-SITTINGS)
    .map((sitting) => sitting[0].sessionId);
}

/**
 * Is this child's recent pattern consistent with guessing?
 *
 * `attempts` is the child's whole log, oldest first. Pure: the same log gives
 * the same answer, so it clears of its own accord when the child improves and
 * can come back if they slip again.
 */
export function needsAHand(attempts: readonly Attempt[], level = 1): NeedsAHand {
  const sittings = realSittings(trialsFrom(attempts, level));
  if (sittings.length < SITTINGS) return NOT_RAISED;

  const recent = sittings.slice(-SITTINGS);
  const together = recent.flat();
  if (score(together).taps < MIN_TRIALS_TOTAL) return NOT_RAISED;

  const everySittingLooksLikeGuessing = recent.every((sitting) => score(sitting).z <= Z_LIMIT);
  if (!everySittingLooksLikeGuessing || score(together).z > Z_LIMIT) return NOT_RAISED;

  return { raised: true, message: NEEDS_A_HAND_MESSAGE };
}
