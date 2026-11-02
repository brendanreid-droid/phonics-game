import {
  getLevel,
  getWord,
  graphemesForLevel,
  introductionGroupIndex,
  picturableWordsForLevel,
  wordsForLevel,
} from '@soundlings/curriculum';
import type { GraphemeId, Skill, TargetId, WordId } from '@soundlings/curriculum';
import { withDefaults } from './config';
import type { EngineConfig } from './config';
import { pickGraphemeDistractors, pickTileDistractors, pickWordDistractors } from './distractors';
import { blankPositionFor } from './missingLetter';
import { hasInitialPicture } from './pictureStart';
import { getRecord, isMastered, strengthAt } from './mastery';
import { graphemesMetAt, wordsDecodableFrom } from './metGraphemes';
import { readyForThreeSounds, readyToSpell } from './readiness';
import { deriveSeed, makeRng, seedFromString, shuffle } from './rng';
import type { Rng } from './rng';
import { difficultyFor } from './difficulty';
import { TASK_TYPES } from './taskTypes';
import type { TaskTypeMeta } from './taskTypes';
import type { ConfusionMap, MasteryMap, SessionBand, TaskInstance } from './types';

export interface BuildSessionArgs {
  sessionId: string;
  level: number;
  mastery: MasteryMap;
  confusions: ConfusionMap;
  now: number;
  config?: Partial<EngineConfig>;
  /**
   * Caps task difficulty. Set by the frustration guard when it abandons a task,
   * and applies to the current session only: the guard's state is never
   * persisted, so the next quest starts uncapped.
   */
  maxDifficulty?: number;
  /** Overrides session length. Set by the frustration guard on a bad day, for the current session only. */
  length?: number;
}

interface Pairing {
  targetId: TargetId;
  skill: Skill;
}

/**
 * Spec §5.4 invariant 7: with fewer than this many win-back candidates the
 * child is treated as brand-new and the anchors come from the current focus.
 * Fewer than two would otherwise cycle one sound across all three anchors.
 */
const MIN_WINBACK_TARGETS = 2;

/**
 * Whether this skill's targets are words rather than graphemes.
 *
 * Split from `needsTheLetters` below because `ORAL_BLEND` is both — its targets
 * are words, and it must NOT wait for the letters. One predicate meaning both
 * things is how a skill that precedes print would have been gated behind print.
 */
const targetsWord = (skill: Skill): boolean =>
  skill === 'BLEND_READ' || skill === 'SEGMENT_SPELL' || skill === 'ORAL_BLEND';

/**
 * Whether this skill may only be asked about words whose every grapheme the
 * child already knows (invariant 5a).
 *
 * `ORAL_BLEND` is exempt, and that is the whole point of it: hearing that
 * /m/-/a/-/p/ is "map" needs no letters at all, so gating it behind letter
 * knowledge would delay the one stage that is supposed to come first.
 */
const needsTheLetters = (skill: Skill): boolean => skill === 'BLEND_READ' || skill === 'SEGMENT_SPELL';

/**
 * Composes one quest.
 *
 * Shape: focus / review / anchor. Anchors occupy the first, middle-third and
 * last positions so the child opens confident, gets a breather, and leaves on
 * a success. Focus is the newest unmastered sounds plus the words that contain
 * them, which is what generates secondary mastery credit (see taskTypes.ts).
 * Review is the weakest and most overdue material.
 *
 * Invariants (spec §5.4), each with a test:
 *  1. The first task is an anchor.
 *  2. The last task is an anchor.
 *  3. No two adjacent tasks share a task type.
 *  4. There is an anchor in the middle third.
 *  5. Only graphemes and words the child has been introduced to appear, as
 *     targets and as wrong answers.
 *  5a. Sounds before words: a word task is eligible only once every grapheme in
 *      it has `config.wordReadinessCorrect` unscaffolded correct answers on
 *      SOUND_ID or LETTER_SOUND (see `knownGraphemes`). Words shown as wrong
 *      answers are held to the same rule.
 *  6. The length is `config.sessionLength`.
 *  7. With fewer than two win-back candidates, anchors come from the focus:
 *     the opening and middle anchors use the lowest-difficulty task type
 *     available and the closing anchor at most the second-lowest, on a target
 *     the quest has already asked about.
 *
 * Why invariant 7 is not "every anchor is the easiest type": whenever only two
 * task types are usable (a child under the frustration cap, or one whose focus
 * has only two skills available), invariant 3 forces them to alternate, and in
 * an even-length session the first and last slots then hold different types.
 * Invariant 3 wins: it is the one a child notices. (A brand-new
 * child is in this situation: invariant 5a leaves only sound tasks, so
 * sound-hunt and sound-singer alternate.) Adding a
 * second task type per skill (Plan 2) removes the conflict; revisit the rule then.
 *
 * "Already asked about" is all a plan can promise. Whether the child answered
 * correctly is only known at play time.
 */
export function buildSession(args: BuildSessionArgs): TaskInstance[] {
  const config = withDefaults(args.config);
  const length = Math.max(0, Math.floor(args.length ?? config.sessionLength));
  if (length === 0) return [];

  const baseSeed = seedFromString(args.sessionId);
  const rng = makeRng(baseSeed);
  const { level, mastery, confusions, now } = args;

  const usable = usableTaskTypes(args.maxDifficulty);
  const usableSkills = new Set(usable.map((t) => t.skill));

  const masteredPair = (p: Pairing): boolean =>
    isMastered(getRecord(mastery, p.targetId, p.skill, config), now, config);

  // What the child has MET decides what may appear. It is derived from the
  // whole level's state, before any restriction, because "met" is a property
  // of the child's progress, not of which task types happen to be allowed.
  const levelPairings = allPairings(level);
  const focusGraphemes = currentFocusGraphemes(level, levelPairings.filter((p) => !masteredPair(p)), config);
  const metGraphemeIds = graphemesMetAt(level, focusGraphemes);

  // Restrict everything to what this child has actually MET. A child on their
  // first day has been introduced to two letters, not all seven. Scheduling
  // "review" of a letter they have never seen is not review, it is a trick
  // question, and it is the fastest way to make a five-year-old give up.
  const { pairings, blendWordIds, oralWordIds } = teachable(level, metGraphemeIds, usableSkills, mastery, config);
  if (pairings.length === 0) throw new Error(`No teachable pairings at level ${level}`);

  // --- the lesson's shape: one new sound at a time (invariant 5e) ----------
  //
  // A quest is not a shuffle of everything in focus. It is a lesson: meet a
  // letter, practise it, meet the next, mix the two. So the focus GROWS across
  // the quest, and a letter the child has not met yet may not appear anywhere
  // before its teaching card — not as a target and not as a wrong answer.
  //
  // `pending` is every focus letter the child has not been shown. The quest
  // introduces as many as it has room for; the rest stay invisible until a
  // later quest, which is why the forbidden set below is sliced from `pending`
  // and not from the ones being introduced today. Slicing it from today's
  // introductions would have left the third letter of the group free to turn
  // up as a distractor in a quest that never taught it.
  const introduced = introducedGraphemes(focusGraphemes, mastery, config);
  const pending = focusGraphemes.filter((g) => !introduced.includes(g));
  // Each introduction costs its teaching card plus `introPracticeCount` slots
  // of practice. Two fit in a 14-task quest, which is the pace the config
  // argues for.
  const roomForIntroductions = Math.floor(length / (1 + config.introPracticeCount));
  // A child with no letter yet gets one however short the quest is. Without
  // this, a four-slot quest for a brand-new child had no room for an
  // introduction, every letter was therefore still untaught and so unusable,
  // and the only legal game was Robot Talk — four of them in a row. One letter
  // and two tasks on it is a lesson; four identical screens is not.
  // How many letters have to be taught before a letter QUESTION can be asked
  // at all. Every letter game is multiple choice, so one taught letter is not
  // a question: it is a card with a single answer on it.
  //
  // This is why a child's very first lesson introduces a PAIR. `s` and `a` are
  // the first two of the Australian sequence for exactly this reason — one
  // letter cannot be contrasted with anything, and `s a t` makes `sat`. After
  // the first pair, one at a time: by then the letters already taught supply
  // the wrong answers.
  const letterTypes = usable.filter((t) => t.skill === 'SOUND_ID' || t.skill === 'LETTER_SOUND');
  const lettersForAQuestion = letterTypes.length === 0 ? 0 : Math.min(...letterTypes.map((t) => t.minChoices));
  const lettersAfter = (taughtSoFar: number): number => {
    const hidden = new Set(pending.slice(taughtSoFar));
    return metGraphemeIds.filter((g) => !hidden.has(g)).length;
  };
  let opening = 0;
  while (opening < pending.length && lettersAfter(opening) < lettersForAQuestion) opening += 1;

  const mustIntroduce =
    introduced.length === 0 && pending.length > 0 ? Math.min(pending.length, Math.max(1, opening)) : 0;
  // No SECOND new sound while the frustration guard is capping difficulty. The
  // guard caps after a child has failed a task repeatedly and been shown the
  // answer, and the response to that is to go back to what they know. The
  // first letter is still given: a capped child who has met nothing has no
  // other legal work at all, so withholding it would leave them a quest of
  // Robot Talk and nothing else.
  //
  // A short session alone (`length`) is not the same signal as a cap: that is
  // a gentler day, and a teaching card is the gentlest screen there is.
  const wantedMeets = Math.min(
    pending.length,
    args.maxDifficulty === undefined ? Math.max(mustIntroduce, roomForIntroductions) : mustIntroduce,
  );
  // Slot 1, not slot 0: the first slot is the quest's opening anchor
  // (invariant 1) — a guaranteed success before anything new is asked of the
  // child. For a brand-new child that is Robot Talk, which has no letters on
  // screen at all, so it is the one task that can legally come before the very
  // first teaching card.
  //
  // Positions past the end are dropped, and at least one task slot is kept: a
  // one-slot quest is a task, not a card on its own, and a quest of nothing but
  // teaching cards would record no evidence and could never end.
  // The opening block sits back to back — "here is /s/", "here is /a/" — and
  // every introduction after it is spaced by its practice.
  const meetAt = Array.from({ length: wantedMeets }, (_, k) =>
    k < opening
      ? 1 + k
      : // Past the opening block, each introduction follows its predecessor's
        // practice. The `+ introPracticeCount` is what puts the practice
        // BEFORE the next card rather than after it: without it, an opening
        // block of one was followed immediately by a second card, and a child
        // met two letters in a row having practised neither.
        opening + 1 + config.introPracticeCount + (k - opening) * (1 + config.introPracticeCount),
  )
    .filter((position) => position < length)
    .slice(0, Math.max(0, length - 1));
  const meetCount = meetAt.length;
  const taskLength = length - meetCount;

  /**
   * Letters not yet taught at this point in the quest, by task slot index.
   *
   * Indexed by position in the TASK sequence, before the teaching cards are
   * spliced in: the search and the pairing picks all work in that space.
   */
  const forbiddenBySlot: ReadonlySet<GraphemeId>[] = Array.from({ length: taskLength }, (_, slot) => {
    let met = 0;
    let position = slot;
    for (const at of meetAt) {
      if (at <= position) {
        met += 1;
        position += 1;
      }
    }
    return new Set(pending.slice(met));
  });
  const emptySet: ReadonlySet<GraphemeId> = new Set();

  /** Does this pairing put a not-yet-taught letter on the screen? */
  const touchesForbidden = (p: Pairing, forbidden: ReadonlySet<GraphemeId>): boolean => {
    if (forbidden.size === 0) return false;
    // Oral blending shows no letters, so no letter it involves is on screen.
    // Gating it would stall the one stage that is meant to run from day one.
    if (p.skill === 'ORAL_BLEND') return false;
    if (!targetsWord(p.skill)) return forbidden.has(p.targetId as GraphemeId);
    return getWord(p.targetId).graphemes.some((g) => forbidden.has(g));
  };
  const allowedAt = (slot: number) => (p: Pairing) => !touchesForbidden(p, forbiddenBySlot[slot]);

  // Whether a task type can actually be built for a pairing. A skill match is
  // not enough for a game that only works for some targets (`canServeTarget`),
  // or that needs something of the child's state: Picture Start needs pictures
  // of OTHER met letters to be wrong answers.
  // The cap actually applied. `effectiveCap` raises a cap below every base rung
  // to the easiest rung; this raises it further to the easiest thing that can
  // really be built for THIS child, because a base rung is only a lower bound.
  // Without it a cap of 1 admitted Robot Talk by its rung and then rejected
  // every Robot Talk task by its exact difficulty, and the builder reported
  // that no arrangement exists.
  const cap = Math.max(
    effectiveCap(args.maxDifficulty),
    Math.min(
      ...pairings.flatMap((p) =>
        TASK_TYPES.filter((t) => t.skill === p.skill).map((t) => difficultyFor(t.id, p.targetId)),
      ),
    ),
  );
  const canBuild = (
    type: TaskTypeMeta,
    p: Pairing,
    forbidden: ReadonlySet<GraphemeId> = emptySet,
  ): boolean => {
    if (type.skill !== p.skill) return false;
    if (type.canServeTarget !== undefined && !type.canServeTarget(p.targetId)) return false;
    // The cap is exact here rather than at the type level, because difficulty
    // depends on the word: `word-builder` on `at` may be allowed where the same
    // game on `sat` is not.
    if (difficultyFor(type.id, p.targetId) > cap) return false;
    if (type.skill === 'SOUND_ID' || type.skill === 'LETTER_SOUND') {
      // The wrong answers must be letters the child has MET, which early in a
      // quest is fewer than the ones they have met overall: a child who has
      // just been shown `s` and nothing else cannot be offered a choice
      // between `s` and `a`. Without this, the first lesson asked "which one
      // says /s/?" over a single card.
      //
      // Picture Start draws each letter as one of its own start pictures, so
      // its wrong answers must also HAVE one.
      const wrong = metGraphemeIds.filter(
        (g) =>
          g !== p.targetId &&
          !forbidden.has(g) &&
          (type.id !== 'picture-start' || hasInitialPicture(g)),
      );
      return wrong.length >= type.minChoices - 1;
    }
    // Picture Match shows pictures and Word Pick shows written words, so both
    // need enough OTHER words the child may be shown in print. Sound It Out is
    // absent on purpose: its candidates are spoken and come from the whole
    // level, so it can always make a question (see `makeTask`).
    if (type.id === 'picture-match' || type.id === 'word-pick') {
      const others = blendWordIds.filter(
        (id) =>
          id !== p.targetId &&
          getWord(id).picturable &&
          // `forbidden` holds LETTERS, so a word is excluded when one of its
          // letters has not been taught yet — not by its own id.
          getWord(id).graphemes.every((g) => !forbidden.has(g)),
      );
      return others.length >= type.minChoices - 1;
    }
    return true;
  };
  const buildableIn = (pool: readonly Pairing[]): TaskTypeMeta[] =>
    usable.filter((type) => pool.some((p) => canBuild(type, p)));
  /** Which task types a given slot could hold, given what has been taught by then. */
  const buildableAt = (slot: number, pool: readonly Pairing[]): TaskTypeMeta[] => {
    const forbidden = forbiddenBySlot[slot];
    return usable.filter((type) => pool.some((p) => canBuild(type, p, forbidden) && allowedAt(slot)(p)));
  };

  const unmastered = pairings.filter((p) => !masteredPair(p));
  const mastered = pairings.filter(masteredPair);

  const focusPool = unmastered.filter((p) => touchesFocus(p, focusGraphemes));
  const reviewPool = rankByUrgency(
    unmastered.filter((p) => !touchesFocus(p, focusGraphemes)),
    mastery, now, config,
  );
  // A win-back must be a near-certain success, so high strength is not enough
  // on its own: require the child's most recent answer on it to have been
  // correct. Strength alone would admit a sound they failed moments ago,
  // because so little time has passed that it has barely decayed.
  const winbackPool = mastered
    .filter((p) => {
      const record = getRecord(mastery, p.targetId, p.skill, config);
      return strengthAt(record, now, config) >= config.winbackStrength && record.consecutiveCorrect >= 1;
    })
    .sort(
      (a, b) =>
        strengthAt(getRecord(mastery, b.targetId, b.skill, config), now, config) -
        strengthAt(getRecord(mastery, a.targetId, a.skill, config), now, config),
    );

  // Never let a pool be empty. A child who has mastered everything has no
  // "unmastered" material, but still deserves a full quest: it is drawn from
  // what they know, weakest first.
  const focusBase = shuffle(
    focusPool.length > 0 ? focusPool : unmastered.length > 0 ? unmastered : mastered,
    rng,
  );
  const reviewSource = reviewPool;

  // A pool can be too narrow to alternate task types. A child whose s and a are
  // mastered for hearing but not yet for singing has a focus of singing tasks
  // only, and singing tasks cannot sit side by side. So each band has a second
  // tier it draws from only when the first has no task of the type the
  // arrangement needs: mastered material on the focus sounds for focus, and
  // anything else the child has met for review. With nothing unmastered outside
  // the focus (day one), review is that second tier alone: the weakest and most
  // overdue material the child has met, so the slots revisit rather than vanish.
  const inFocusBase = new Set(focusBase);
  const focusTiers: Pairing[][] = [
    focusBase,
    shuffle(mastered.filter((p) => !inFocusBase.has(p) && touchesFocus(p, focusGraphemes)), rng),
  ];
  const inReviewSource = new Set(reviewSource);
  const reviewTiers: Pairing[][] = [
    reviewSource,
    rankByUrgency(pairings.filter((p) => !inReviewSource.has(p)), mastery, now, config),
  ];

  const anchorCount = Math.min(config.winbackCount, taskLength);
  const reviewCount = Math.min(config.reviewCount, taskLength - anchorCount);
  const fillerCount = taskLength - anchorCount;
  const focusCount = fillerCount - reviewCount;

  const winbackMode = winbackPool.length >= MIN_WINBACK_TARGETS;
  const anchorPool = winbackMode ? winbackPool : focusBase;

  const typesOf = buildableIn;
  const byDifficulty = (types: TaskTypeMeta[]) => [...types].sort((a, b) => a.baseDifficulty - b.baseDifficulty);
  const provenFor = (p: Pairing, type: TaskTypeMeta): boolean =>
    getRecord(mastery, p.targetId, p.skill, config).taskTypesSeen.includes(type.id);

  // Anchor type rules, in the order they are tried. Each is searched for a
  // no-adjacent-repeat arrangement; the first that has one is used.
  const anchorTypes = typesOf(anchorPool);
  const lowestTwo = (types: TaskTypeMeta[]) => byDifficulty(types).slice(0, 2);
  const easiest = lowestTwo(anchorTypes).slice(0, 1);
  const winbackTypes = [...anchorTypes].sort(
    (a, b) =>
      Number(!anchorPool.some((p) => canBuild(a, p) && provenFor(p, a))) -
        Number(!anchorPool.some((p) => canBuild(b, p) && provenFor(p, b))) ||
      a.baseDifficulty - b.baseDifficulty,
  );
  const ladder: AnchorRules[] = winbackMode
    ? [
        { open: winbackTypes, mid: winbackTypes, close: winbackTypes, closeOnPractised: false, strict: true },
        // Invariant 7's rule, applied when win-backs of one skill cannot be
        // arranged without a repeat.
        { open: winbackTypes, mid: winbackTypes, close: lowestTwo(typesOf(pairings)), closeOnPractised: true, strict: true },
        // Broaden the close AND drop "on a target already asked about" before
        // dropping "no two adjacent tasks share a type", for the reason given
        // in the brand-new ladder below. When a child's win-backs are all one
        // skill — two sounds mastered for Sound Hunt and nothing else — that
        // skill supplies exactly one task type, and a short quest opened and
        // closed on the same mini-game.
        { open: winbackTypes, mid: winbackTypes, close: lowestTwo(typesOf(pairings)), closeOnPractised: false, strict: true },
        // Broaden the OPEN too. A win-back's task types are judged against the
        // whole quest, but the opening slot comes before any teaching card, so
        // early in a lesson it may be able to hold none of them: a child with
        // one letter mastered and the next two not yet taught had an anchor
        // pool of letter games and an opening slot where no letter was legal,
        // and the builder reported that no arrangement exists. The pairing pick
        // already falls back from the win-back pool to the whole pairing set
        // and labels the band by what it actually got, so this rung is the
        // arrangement catching up with it.
        { open: lowestTwo(typesOf(pairings)), mid: lowestTwo(typesOf(pairings)), close: lowestTwo(typesOf(pairings)), closeOnPractised: false, strict: true },
        { open: winbackTypes, mid: winbackTypes, close: winbackTypes, closeOnPractised: false, strict: false },
      ]
    : [
        { open: easiest, mid: easiest, close: lowestTwo(anchorTypes), closeOnPractised: true, strict: true },
        // Give up "close on a target already asked about" BEFORE giving up
        // "no two adjacent tasks share a type". The spec settled that
        // precedence once already for invariants 3 and 7, and for the same
        // reason: back-to-back identical mini-games is what a child actually
        // notices and resents, while the closing target having appeared earlier
        // is a refinement they cannot see.
        //
        // Without this rung, a short quest for a brand-new child closed on a
        // second Robot Talk — the only game whose targets are words, so the
        // only one that could close on the word the quest opened with.
        { open: easiest, mid: easiest, close: lowestTwo(anchorTypes), closeOnPractised: false, strict: true },
        { open: easiest, mid: easiest, close: lowestTwo(anchorTypes), closeOnPractised: true, strict: false },
      ];

  // Which task types each band can supply, by id rather than by skill: two types
  // of one skill need not be able to serve the same targets.
  //
  // Per slot, not once for the quest. Early slots have fewer letters taught, so
  // they can hold fewer games: a slot before the first teaching card cannot
  // hold Sound Hunt at all for a brand-new child, because there is no letter it
  // would be allowed to ask about. Computing this once and reusing it is how
  // the search would come back with an arrangement the pairing picks then
  // cannot fill, and throw mid-quest.
  const typeIdsAt = (slot: number, tiers: readonly (readonly Pairing[])[]) =>
    new Set(buildableAt(slot, tiers.flat()).map((t) => t.id));
  const slotIndices = Array.from({ length: taskLength }, (_, i) => i);
  const focusIdsBySlot = slotIndices.map((slot) => typeIdsAt(slot, focusTiers));
  const reviewIdsBySlot = slotIndices.map((slot) => typeIdsAt(slot, reviewTiers));
  const fillerTypesBySlot = slotIndices.map((slot) =>
    usable.filter((t) => focusIdsBySlot[slot].has(t.id) || reviewIdsBySlot[slot].has(t.id)),
  );
  // Anchors may fall back to the whole pairing set (see the pick below), so
  // their availability is judged against it rather than against the anchor pool.
  const anchorIdsBySlot = slotIndices.map((slot) => new Set(buildableAt(slot, pairings).map((t) => t.id)));

  // Can the open anchor's skill be followed by a close of skill `close` on the
  // same target? That is what guarantees the closing target was asked earlier.
  const closeCompatible = (open: TaskTypeMeta, close: TaskTypeMeta, slot: number): boolean => {
    const openForbidden = forbiddenBySlot[0];
    const closeForbidden = forbiddenBySlot[slot];
    return anchorPool.some(
      (p) =>
        canBuild(open, p, openForbidden) &&
        !touchesForbidden(p, openForbidden) &&
        pairings.some(
          (q) =>
            q.targetId === p.targetId &&
            canBuild(close, q, closeForbidden) &&
            !touchesForbidden(q, closeForbidden),
        ),
    );
  };

  let skeleton: TaskTypeMeta[] | null = null;
  let rules: AnchorRules = ladder[0];
  let middle = -1;
  search: for (const attempt of ladder) {
    for (const mid of middleSlots(taskLength, anchorCount)) {
      skeleton = searchSkeleton({
        length: taskLength,
        anchors: anchorRulesBySlot(taskLength, anchorCount, mid, attempt),
        fillerTypesAt: (slot) => fillerTypesBySlot[slot],
        focusTypesAt: (slot) => focusIdsBySlot[slot],
        reviewTypesAt: (slot) => reviewIdsBySlot[slot],
        anchorAllowedAt: (slot, type) => anchorIdsBySlot[slot].has(type.id),
        focusSlots: focusCount,
        reviewSlots: reviewCount,
        strict: attempt.strict,
        closeCompatible: attempt.closeOnPractised ? closeCompatible : () => true,
        rng,
      });
      if (skeleton) {
        rules = attempt;
        middle = mid;
        break search;
      }
    }
  }
  if (!skeleton) throw new Error('No arrangement exists for this session');

  // --- assign a pairing to every slot -------------------------------------
  const usage = new Map<string, number>();
  const pick = (
    slot: number,
    tiers: readonly (readonly Pairing[])[],
    type: TaskTypeMeta,
    preferProven: boolean,
    only?: (p: Pairing) => boolean,
  ): Pairing => {
    const forbidden = forbiddenBySlot[slot];
    const candidates =
      tiers
        .map((tier) =>
          tier.filter(
            (p) => canBuild(type, p, forbidden) && !touchesForbidden(p, forbidden) && (only?.(p) ?? true),
          ),
        )
        .find((tier) => tier.length > 0) ?? [];
    if (candidates.length === 0) throw new Error(`No ${type.skill} pairing available for ${type.id}`);
    const used = (p: Pairing) => usage.get(`${p.targetId}::${p.skill}`) ?? 0;
    // Least-used first, so a small pool is spread rather than repeated; then the
    // proven-type preference; the pool's own order (strength, urgency or the
    // shuffle) breaks any remaining tie because the sort is stable.
    const best = [...candidates].sort(
      (a, b) =>
        used(a) - used(b) ||
        Number(provenFor(a, type) !== preferProven) - Number(provenFor(b, type) !== preferProven),
    )[0];
    usage.set(`${best.targetId}::${best.skill}`, used(best) + 1);
    return best;
  };

  interface Slot { pairing: Pairing; type: TaskTypeMeta; band: SessionBand; anchor: boolean }
  const slots: (Slot | undefined)[] = new Array(taskLength).fill(undefined);
  const anchorSlots = anchorRulesBySlot(taskLength, anchorCount, middle, rules);
  const closeSlot = taskLength - 1;
  const closeIsPractised = rules.closeOnPractised && anchorCount >= 2 && anchorSlots.has(closeSlot);
  const anchorBand: SessionBand = winbackMode ? 'winback' : 'focus';

  // Anchors other than a practised close. Unmastered or not, an anchor is
  // chosen to be proven for its task type: a guaranteed success.
  for (const slot of [...anchorSlots.keys()].sort((a, b) => a - b)) {
    if (slot === closeSlot && closeIsPractised) continue;
    const type = skeleton[slot];
    // The opening target must be one the close can come back to, which is what
    // guarantees the closing target was asked earlier in the quest.
    const closeType = skeleton[closeSlot];
    // Prefer a win-back, but fall back to any teachable pairing when this type
    // cannot be served by one. The close anchor's type may come from the whole
    // pairing set rather than the win-back pool (see the ladder above), and
    // restricting the pick to win-backs then left it with nothing: a quest for
    // a child whose only mastered material was two sounds crashed outright.
    const pairing = pick(
      slot,
      [anchorPool, pairings],
      type,
      true,
      closeIsPractised && slot === 0
        ? (p) =>
            pairings.some(
              (q) =>
                q.targetId === p.targetId &&
                canBuild(closeType, q, forbiddenBySlot[closeSlot]) &&
                !touchesForbidden(q, forbiddenBySlot[closeSlot]),
            )
        : undefined,
    );
    slots[slot] = {
      pairing,
      type,
      // Only call it a win-back if it really is one. A mislabelled band would
      // tell the parent report the child was given a guaranteed success when
      // they were given new material.
      band: anchorPool.includes(pairing) ? anchorBand : 'focus',
      anchor: true,
    };
  }

  // Fillers: which are focus and which are review. A slot whose task type only
  // one band can supply has no choice; the rest are shuffled.
  const fillerSlots = skeleton.map((_, i) => i).filter((i) => !anchorSlots.has(i));
  const bandOf = new Map<number, SessionBand>();
  const flexible: number[] = [];
  let reviewLeft = reviewCount;
  for (const i of fillerSlots) {
    const inFocus = focusIdsBySlot[i].has(skeleton[i].id);
    const inReview = reviewIdsBySlot[i].has(skeleton[i].id);
    if (inFocus && inReview) flexible.push(i);
    else if (inReview) { bandOf.set(i, 'review'); reviewLeft -= 1; } else bandOf.set(i, 'focus');
  }
  // Review is the weakest and most overdue material, so the review slots go to
  // the task types of the most urgent pairings first, not to chance.
  const review = new Set<number>();
  for (const p of reviewSource) {
    if (review.size >= reviewLeft) break;
    const slot = flexible.find(
      (i) =>
        !review.has(i) &&
        canBuild(skeleton[i], p, forbiddenBySlot[i]) &&
        !touchesForbidden(p, forbiddenBySlot[i]),
    );
    if (slot !== undefined) review.add(slot);
  }
  for (const i of shuffle(flexible.filter((j) => !review.has(j)), rng)) {
    if (review.size >= reviewLeft) break;
    review.add(i);
  }
  for (const i of flexible) bandOf.set(i, review.has(i) ? 'review' : 'focus');
  for (const i of fillerSlots) {
    const band = bandOf.get(i) as SessionBand;
    slots[i] = {
      pairing: pick(i, band === 'review' ? reviewTiers : focusTiers, skeleton[i], false),
      type: skeleton[i], band, anchor: false,
    };
  }

  if (closeIsPractised) {
    const type = skeleton[closeSlot];
    const asked = new Map<TargetId, number>();
    for (const slot of slots) if (slot) asked.set(slot.pairing.targetId, (asked.get(slot.pairing.targetId) ?? 0) + 1);
    // Most-asked target first: "practised a dozen times" is the whole
    // justification for letting the close be the second-easiest type.
    const pairing = pairings
      .filter(
        (p) =>
          canBuild(type, p, forbiddenBySlot[closeSlot]) &&
          !touchesForbidden(p, forbiddenBySlot[closeSlot]) &&
          asked.has(p.targetId),
      )
      .sort((a, b) => (asked.get(b.targetId) ?? 0) - (asked.get(a.targetId) ?? 0))[0];
    if (!pairing) throw new Error('No practised target available for the closing anchor');
    slots[closeSlot] = {
      pairing, type, anchor: true,
      // Only a pairing that met the win-back bar is a win-back. A close on mastered
      // material that has since faded is still just focus work.
      band: winbackPool.includes(pairing) ? 'winback' : 'focus',
    };
  }

  // --- the finished quest, teaching cards included -------------------------
  //
  // The tasks are built in their own coordinate space and the teaching cards
  // are spliced in afterwards, so the arrangement rules (no two adjacent tasks
  // of one type, anchors at the ends, the review count) are all about tasks and
  // are not thrown off by a card that is not one. A teaching card between two
  // Sound Hunts would still be two Sound Hunts in a row to the child, which is
  // why invariant 3 is enforced over the task sequence and not over the final
  // positions.
  //
  // The seed is derived from the FINAL position. A task must not change because
  // a teaching card appeared earlier in the quest.
  const levelWordIds = wordsForLevel(level).map((w) => w.id);
  const quest: TaskInstance[] = [];
  let taskIndex = 0;
  for (let position = 0; position < length; position += 1) {
    const meet = meetAt.indexOf(position);
    if (meet >= 0) {
      quest.push(meetCard(pending[meet], position, deriveSeed(baseSeed, position)));
      continue;
    }
    const slot = (slots as Slot[])[taskIndex];
    const allowed = metGraphemeIds.filter((g) => !forbiddenBySlot[taskIndex].has(g));
    quest.push(
      makeTask({
        ...slot,
        position,
        level,
        confusions,
        // What the child has met BY THIS POINT, which is what the choice count
        // should grow with. Using the whole level's met letters here would give
        // a four-way choice on a letter introduced one slot earlier.
        graphemesMet: allowed.length,
        allowedGraphemes: allowed,
        // Wrong answers must not contain a letter the child has not been
        // taught yet, in a written word any more than on a letter card.
        allowedWords: blendWordIds.filter((id) =>
          getWord(id).graphemes.every((g) => !forbiddenBySlot[taskIndex].has(g)),
        ),
        oralWords: oralWordIds,
        spokenWords: levelWordIds,
        seed: deriveSeed(baseSeed, position),
      }),
    );
    taskIndex += 1;
  }
  return quest;
}

/**
 * A teaching card: this letter, its sound, its mnemonic. Not a task.
 *
 * It carries no choices and no difficulty, and `recordTaskResult` throws if one
 * is ever scored (see taskOutcome.ts), so it cannot put anything into a child's
 * mastery data. `correctChoice` repeats the target only because the field is
 * not optional; nothing reads it.
 *
 * `taskTypeId` is `meet-the-sound`, which is deliberately NOT a registered task
 * type: this is not a mini-game, it has no difficulty rung, and the session
 * builder must never schedule it as one. What renders it is `kind`, which the
 * quest screen checks before it looks at the type at all.
 */
function meetCard(grapheme: GraphemeId, position: number, seed: number): TaskInstance {
  return {
    id: `${position}-meet-${grapheme}`,
    kind: 'meet',
    taskTypeId: 'meet-the-sound',
    // The card shows a letter and says its sound, which is LETTER_SOUND's
    // direction. It proves nothing in that skill — nothing is recorded — but
    // the field should not misdescribe what is on the screen.
    skill: 'LETTER_SOUND',
    primaryTarget: grapheme,
    secondaryTargets: [],
    choices: [],
    correctChoice: grapheme,
    band: 'focus',
    anchor: false,
    difficulty: 0,
    seed,
  };
}

// --- pools ----------------------------------------------------------------

/**
 * The cap actually applied, which is not always the cap asked for.
 *
 * A cap below every rung must still leave something to teach with, so it is
 * raised to the easiest rung rather than emptying the pool. Both the type
 * filter and the exact per-target check in `canBuild` read this same number —
 * if they disagreed, the fallback type would be offered and then rejected, and
 * the builder would report that no arrangement exists.
 */
function effectiveCap(maxDifficulty: number | undefined): number {
  if (maxDifficulty === undefined) return Number.POSITIVE_INFINITY;
  const easiest = Math.min(...TASK_TYPES.map((t) => t.baseDifficulty));
  return Math.max(maxDifficulty, easiest);
}

function usableTaskTypes(maxDifficulty: number | undefined): readonly TaskTypeMeta[] {
  // The base rung is a LOWER bound on what any target of this type can cost,
  // so a type above the cap can never qualify for any word. The exact check is
  // per (type, target) and lives in `canBuild`.
  return TASK_TYPES.filter((t) => t.baseDifficulty <= effectiveCap(maxDifficulty));
}

/** Every (target, skill) pairing teachable at this level, before the child's progress narrows it. */
function allPairings(level: number): Pairing[] {
  const pairings: Pairing[] = [];
  for (const grapheme of graphemesForLevel(level)) {
    pairings.push({ targetId: grapheme.id, skill: 'SOUND_ID' });
    pairings.push({ targetId: grapheme.id, skill: 'LETTER_SOUND' });
  }
  for (const word of picturableWordsForLevel(level)) {
    pairings.push({ targetId: word.id, skill: 'ORAL_BLEND' });
  }
  // Every decodable word, not only the picturable ones. Sound It Out's
  // candidates are spoken, so a word without a picture is readable; the games
  // that do need a picture say so with `canServeTarget`.
  for (const word of wordsForLevel(level)) pairings.push({ targetId: word.id, skill: 'BLEND_READ' });
  for (const word of wordsForLevel(level)) pairings.push({ targetId: word.id, skill: 'SEGMENT_SPELL' });
  return pairings;
}

/**
 * The pairings this child may be given: graphemes they have met, and words
 * built only from those graphemes. Filtered per skill rather than through one
 * shared id set, so a grapheme and a word can never be confused for each other.
 */
function teachable(
  level: number,
  metGraphemeIds: readonly GraphemeId[],
  usableSkills: ReadonlySet<Skill>,
  mastery: MasteryMap,
  config: EngineConfig,
): { pairings: Pairing[]; blendWordIds: WordId[]; oralWordIds: WordId[] } {
  const met = new Set(metGraphemeIds);
  // Invariant 5a: met is not enough for a word, the sounds must be KNOWN.
  const known = knownGraphemes(metGraphemeIds, mastery, config);
  const decodable = new Set(
    wordsDecodableFrom(level, metGraphemeIds).filter((id) => getWord(id).graphemes.every((g) => known.has(g))),
  );
  const allPicturable = picturableWordsForLevel(level).map((w) => w.id);
  // A choice between one picture is not a question.
  const oralWordIds = allPicturable.length >= 2 ? allPicturable : [];
  // Every decodable word is readable. It used to be only the picturable ones,
  // which is the single line that put spelling before reading: after quest 1 a
  // child can decode `at` and `sat`, neither has a picture, so reading had no
  // eligible task while spelling had two.
  //
  // This is the pool of WRITTEN or PICTURED wrong answers, and it is
  // deliberately not narrowed by invariant 5c below. A child who may only be
  // ASKED to read `at` can still have `sat` among the candidates: the two
  // reading games that show words in print both need a picture, so a two-sound
  // target can only be a Sound It Out, whose candidates are spoken. Rejecting
  // a heard "sat" needs no ability to decode three letters.
  //
  // There is no "at least two of them" rule here, and there used to be. It
  // deadlocked the whole teaching sequence: a child who knew `a` and `t` but
  // not `s` had exactly one decodable word, so reading had no question to ask,
  // so invariant 5b never let them spell it either. Spelling-without-reading
  // was what had been papering over it. Sound It Out draws its spoken
  // candidates from the level instead (see `makeTask`), and the two games that
  // need a picture declare their own minimum in `canBuild`.
  const blendWordIds = [...decodable];
  const blend = decodable;

  const twoSoundsOnly = (skill: Skill): boolean => !readyForThreeSounds(skill, mastery, config);
  const rightLength = (id: WordId, skill: Skill): boolean =>
    getWord(id).graphemes.length === 2 || !twoSoundsOnly(skill);

  const pairings = allPairings(level).filter((p) => {
    if (!usableSkills.has(p.skill)) return false;
    // Oral blending needs no letters, so it is gated on nothing but having
    // enough pictures to make a question. A child on their first day can hear
    // that /m/-/a/-/p/ is "map" without having met m, a or p, and that is the
    // stage this skill exists to cover.
    if (p.skill === 'ORAL_BLEND') return oralWordIds.includes(p.targetId);
    // Invariant 5c: VC before CVC, per skill.
    if (p.skill === 'BLEND_READ') return blend.has(p.targetId) && rightLength(p.targetId, p.skill);
    // Invariants 5b and 5c: this exact word must have been read, and two sounds
    // must have been spelt before three are asked for.
    if (p.skill === 'SEGMENT_SPELL') {
      return (
        decodable.has(p.targetId) &&
        readyToSpell(p.targetId, mastery, config) &&
        rightLength(p.targetId, p.skill)
      );
    }
    return met.has(p.targetId);
  });
  return { pairings, blendWordIds, oralWordIds };
}

/**
 * Graphemes with at least `config.wordReadinessCorrect` unscaffolded correct
 * answers in total across SOUND_ID and LETTER_SOUND.
 *
 * Counts `primaryCorrectCount`: answers to the grapheme itself, at full weight.
 * That excludes by construction every answer the child was shown (scaffolded
 * attempts return before touching it), wrong answers, and half-weight evidence:
 * secondary credit from a word task, and a correct answer given only after the
 * choices were narrowed. It is a count, not a strength, so it does not decay:
 * a child who learned /s/ and returns after a month is still ready to blend it.
 */
function knownGraphemes(
  graphemeIds: readonly GraphemeId[],
  mastery: MasteryMap,
  config: EngineConfig,
): Set<GraphemeId> {
  const known = new Set<GraphemeId>();
  for (const id of graphemeIds) {
    const correct =
      getRecord(mastery, id, 'SOUND_ID', config).primaryCorrectCount +
      getRecord(mastery, id, 'LETTER_SOUND', config).primaryCorrectCount;
    if (correct >= config.wordReadinessCorrect) known.add(id);
  }
  return known;
}

/**
 * The graphemes the child is currently learning: the earliest introduction
 * groups that still contain something unmastered, capped at
 * `focusTargetCount` graphemes so the front stays small and finishable.
 *
 * Whole groups, never part of one (invariant 5e). This used to slice the flat
 * teaching order by `focusTargetCount` and ignore where the groups fell, which
 * is why a child's third quest opened on `p i m f`: a front of four letters
 * spanning two introduction groups, with `p` from one and `m f` from the next
 * while `i` was left behind. The groups are the curriculum's own statement of
 * what belongs together — `s a t` because they make `sat` — and a front that
 * cuts across them is a front with no pedagogical shape.
 *
 * The cap is applied by group: groups are added while the total stays within
 * `focusTargetCount`, and the earliest group is always included even if it is
 * alone larger than the cap. A cap that could return nothing would be worse
 * than a front one letter too wide.
 */
function currentFocusGraphemes(level: number, unmastered: Pairing[], config: EngineConfig): GraphemeId[] {
  const unmasteredGraphemes = graphemesForLevel(level)
    .filter((g) => unmastered.some((p) => !targetsWord(p.skill) && p.targetId === g.id))
    .sort(
      (a, b) =>
        introductionGroupIndex(level, a.id) - introductionGroupIndex(level, b.id) ||
        a.sequenceIndex - b.sequenceIndex,
    );

  if (unmasteredGraphemes.length === 0) return getLevel(level).graphemeIds;

  // Group index -1 means "taught at an earlier level". Those share one bucket,
  // which sorts first: they are all equally old news, and splitting them by
  // level would make a front out of material the child has already finished.
  const byGroup = new Map<number, GraphemeId[]>();
  for (const grapheme of unmasteredGraphemes) {
    const group = introductionGroupIndex(level, grapheme.id);
    byGroup.set(group, [...(byGroup.get(group) ?? []), grapheme.id]);
  }

  const focus: GraphemeId[] = [];
  for (const group of [...byGroup.keys()].sort((a, b) => a - b)) {
    const members = byGroup.get(group) as GraphemeId[];
    if (focus.length > 0 && focus.length + members.length > config.focusTargetCount) break;
    focus.push(...members);
  }
  return focus;
}

/**
 * The focus graphemes the child has already been shown, in teaching order.
 *
 * "Shown" is any attempt at all on either sound skill — right, wrong or
 * scaffolded. This is not a claim about ability, it is a record of having been
 * introduced, and it is what stops a letter being taught twice.
 */
function introducedGraphemes(
  focusGraphemes: readonly GraphemeId[],
  mastery: MasteryMap,
  config: EngineConfig,
): GraphemeId[] {
  return focusGraphemes.filter(
    (id) =>
      getRecord(mastery, id, 'SOUND_ID', config).attemptCount > 0 ||
      getRecord(mastery, id, 'LETTER_SOUND', config).attemptCount > 0,
  );
}

/** True when this pairing exercises one of the focus graphemes. */
function touchesFocus(pairing: Pairing, focusGraphemes: readonly GraphemeId[]): boolean {
  // Oral blending is never "review": it is the stage below the letters, so it
  // is current work from day one until it is mastered, and it is not tied to
  // which graphemes happen to be in focus.
  if (pairing.skill === 'ORAL_BLEND') return true;
  if (!targetsWord(pairing.skill)) return focusGraphemes.includes(pairing.targetId);
  return getWord(pairing.targetId).graphemes.some((g) => focusGraphemes.includes(g));
}

/** Weakest and most overdue first. */
function rankByUrgency(pairings: Pairing[], mastery: MasteryMap, now: number, config: EngineConfig): Pairing[] {
  const urgency = (pairing: Pairing): number => {
    const record = getRecord(mastery, pairing.targetId, pairing.skill, config);
    const strength = strengthAt(record, now, config);
    // Test "never attempted" with attemptCount, NOT `lastSeenAt === 0`. A
    // simulation (or a test) whose clock starts at 0 would otherwise read
    // every freshly attempted record as never seen.
    const unseen = record.attemptCount === 0;
    const elapsedHours = unseen ? 0 : (now - record.lastSeenAt) / 3_600_000;
    const overdue = unseen ? 0 : elapsedHours / record.halfLifeHours;
    return (1 - strength) * (1 + overdue);
  };
  return [...pairings].sort((a, b) => urgency(b) - urgency(a));
}

// --- arrangement ----------------------------------------------------------

/** Which task types each anchor may use, and how strictly the plan must alternate. */
interface AnchorRules {
  open: TaskTypeMeta[];
  mid: TaskTypeMeta[];
  close: TaskTypeMeta[];
  /** The closing anchor must sit on a target the quest has already asked about. */
  closeOnPractised: boolean;
  /** False only as a last resort, when no arrangement without a repeat exists. */
  strict: boolean;
}

interface AnchorSlotRule {
  allowed: TaskTypeMeta[];
  isClose: boolean;
}

/**
 * Slots the middle anchor may take: the middle third, nearest the centre first.
 * `[-1]` (no middle anchor) when there are fewer than three anchors.
 */
function middleSlots(length: number, anchorCount: number): number[] {
  if (anchorCount < 3) return [-1];
  const start = Math.floor(length / 3);
  const end = Math.ceil((2 * length) / 3);
  const slots: number[] = [];
  for (let i = Math.max(1, start); i < Math.min(end, length - 1); i += 1) slots.push(i);
  if (slots.length === 0) slots.push(Math.floor(length / 2));
  return slots.sort((a, b) => Math.abs(a - length / 2) - Math.abs(b - length / 2) || a - b);
}

/** The anchors' slots and the task types each may take. */
function anchorRulesBySlot(
  length: number,
  anchorCount: number,
  mid: number,
  rules: AnchorRules,
): Map<number, AnchorSlotRule> {
  const map = new Map<number, AnchorSlotRule>();
  if (anchorCount >= 1) map.set(0, { allowed: rules.open, isClose: false });
  if (anchorCount >= 2) map.set(length - 1, { allowed: rules.close, isClose: true });
  if (anchorCount >= 3) map.set(mid, { allowed: rules.mid, isClose: false });
  // Any further anchors go wherever they are farthest from the others.
  while (map.size < anchorCount) {
    let best = -1;
    let bestDistance = -1;
    for (let i = 0; i < length; i += 1) {
      if (map.has(i)) continue;
      const distance = Math.min(...[...map.keys()].map((k) => Math.abs(k - i)));
      if (distance > bestDistance) {
        best = i;
        bestDistance = distance;
      }
    }
    map.set(best, { allowed: rules.mid, isClose: false });
  }
  return map;
}

interface SkeletonSpec {
  length: number;
  anchors: Map<number, AnchorSlotRule>;
  /**
   * The filler task types this slot could hold. Per slot, because the focus
   * grows across the quest: a slot before the first teaching card may have
   * only the games that need no letter.
   */
  fillerTypesAt: (slot: number) => readonly TaskTypeMeta[];
  /** Ids of the task types the focus band can supply a pairing for, at this slot. */
  focusTypesAt: (slot: number) => ReadonlySet<string>;
  /** Ids of the task types the review band can supply a pairing for, at this slot. */
  reviewTypesAt: (slot: number) => ReadonlySet<string>;
  /** Whether an anchor at this slot could be filled with this type. */
  anchorAllowedAt: (slot: number, type: TaskTypeMeta) => boolean;
  focusSlots: number;
  reviewSlots: number;
  strict: boolean;
  closeCompatible: (open: TaskTypeMeta, close: TaskTypeMeta, slot: number) => boolean;
  rng: Rng;
}

/**
 * Chooses a task type for every slot. This is decided BEFORE any target, so
 * the no-adjacent rule is satisfied by construction rather than repaired by
 * swapping afterwards (a swap pass moves anchors and gives up on hard cases).
 *
 * Depth-first search, so it finds an arrangement whenever one exists, and
 * terminates because it is finite and remembers dead ends. A dead end depends
 * only on (slot, previous type, opening type, how many filler slots only one
 * band can supply), which is the memo key.
 *
 * Filler slots try the least-used type first, which spreads the mini-games
 * evenly. When `strict` is false adjacent repeats are tolerated but still
 * tried last: the only way to reach that is a pool with a single usable type,
 * where a repeat is unavoidable and a thrown error mid-quest would be worse.
 */
function searchSkeleton(spec: SkeletonSpec): TaskTypeMeta[] | null {
  const { length, anchors } = spec;
  const sequence: TaskTypeMeta[] = new Array(length);
  const used = new Map<string, number>();
  // The tie-break order is drawn once for the whole quest, from the union of
  // what every slot can hold: a per-slot shuffle would consume the rng a
  // different number of times depending on the search path, and the same seed
  // would stop producing the same quest.
  const everyFillerType = [...new Map(
    Array.from({ length }, (_, slot) => spec.fillerTypesAt(slot)).flat().map((t) => [t.id, t]),
  ).values()];
  const tieOrder = new Map(shuffle(everyFillerType, spec.rng).map((t, i) => [t.id, i]));
  const deadEnds = new Set<string>();

  const go = (i: number, focusOnly: number, reviewOnly: number): boolean => {
    if (i === length) return true;
    const previous = i > 0 ? sequence[i - 1] : undefined;
    const key = `${i}|${previous?.id}|${sequence[0]?.id}|${focusOnly}|${reviewOnly}`;
    if (deadEnds.has(key)) return false;

    const rule = anchors.get(i);
    let options = rule
      ? rule.allowed.filter(
          (t) =>
            spec.anchorAllowedAt(i, t) &&
            (!rule.isClose || i === 0 || spec.closeCompatible(sequence[0], t, i)),
        )
      : [...spec.fillerTypesAt(i)].sort(
          (a, b) =>
            (used.get(a.id) ?? 0) - (used.get(b.id) ?? 0) || (tieOrder.get(a.id) ?? 0) - (tieOrder.get(b.id) ?? 0),
        );
    const repeats = (t: TaskTypeMeta) => previous !== undefined && t.id === previous.id;
    options = spec.strict
      ? options.filter((t) => !repeats(t))
      : [...options.filter((t) => !repeats(t)), ...options.filter(repeats)];

    for (const type of options) {
      let f = focusOnly;
      let r = reviewOnly;
      if (!rule) {
        const inFocus = spec.focusTypesAt(i).has(type.id);
        const inReview = spec.reviewTypesAt(i).has(type.id);
        if (inFocus && !inReview) f += 1;
        else if (!inFocus && inReview) r += 1;
        if (f > spec.focusSlots || r > spec.reviewSlots) continue;
      }
      sequence[i] = type;
      // Only filler slots count towards "least used". An anchor is placed on a
      // task type for its own reasons, and counting it made the type the
      // anchors favour (sound-hunt) the last choice for every filler, so with
      // six types it vanished from the fillers and the review slots could no
      // longer be given to the most urgent sound.
      if (!rule) used.set(type.id, (used.get(type.id) ?? 0) + 1);
      if (go(i + 1, f, r)) return true;
      if (!rule) used.set(type.id, (used.get(type.id) ?? 0) - 1);
    }
    deadEnds.add(key);
    return false;
  };

  return go(0, 0, 0) ? sequence : null;
}

// --- one task -------------------------------------------------------------

interface MakeTaskArgs {
  pairing: Pairing;
  type: TaskTypeMeta;
  band: SessionBand;
  anchor: boolean;
  position: number;
  level: number;
  confusions: ConfusionMap;
  /** How many graphemes the child has met. Drives how many choices to show. */
  graphemesMet: number;
  allowedGraphemes: GraphemeId[];
  allowedWords: WordId[];
  /**
   * The words Robot Talk may offer. Kept apart from `allowedWords` because the
   * two pools answer different questions: one is "what can this child read",
   * the other is "what can this child hear and name a picture of". A child on
   * day one can do the second for every word at the level and the first for
   * none of them.
   */
  oralWords: WordId[];
  /**
   * Every word at the level, for Sound It Out's candidates.
   *
   * A third pool, because it answers a third question. `allowedWords` is "what
   * may this child be shown in print"; `oralWords` is "what can they hear and
   * name a picture of"; this is "what may they hear SAID". Nothing is written
   * and nothing is pictured, so a word the child could neither read nor
   * recognise a drawing of is still a perfectly good wrong answer — they only
   * have to notice it is not the word they just blended.
   */
  spokenWords: WordId[];
  seed: number;
}

function makeTask(args: MakeTaskArgs): TaskInstance {
  const { pairing, type, band, anchor, position, level, confusions, graphemesMet, seed } = args;
  const { allowedGraphemes, allowedWords, oralWords, spokenWords } = args;
  const rng = makeRng(seed);

  // Choice count grows with how much the child has met, so a first session is
  // a two-way choice and a late one is a four-way choice.
  //
  // Note the pickers take a count of DISTRACTORS, while minChoices/maxChoices
  // count CHOICES, hence `choiceCount - 1` at the call sites below. They also
  // return RANKED order and may return fewer than asked when the pool is small,
  // so every call is followed by a shuffle of the whole choice set (correct
  // answer included) and nothing assumes the requested length.
  const choiceCount = Math.min(type.maxChoices, Math.max(type.minChoices, graphemesMet - 1));

  let choices: TargetId[];
  let secondaryTargets: TargetId[] = [];
  let blankIndex: number | undefined;

  if (type.skill === 'SOUND_ID' || type.skill === 'LETTER_SOUND') {
    // Picture Start shows one of the letter's own start pictures for each choice,
    // so a wrong letter must have one. Every Level 1 letter does; the pool is
    // narrowed anyway so a letter without any can never become a blank card. The
    // ranking by what the child has confused still applies within it.
    const allowed =
      type.id === 'picture-start'
        ? allowedGraphemes.filter((g) => g === pairing.targetId || hasInitialPicture(g))
        : allowedGraphemes;
    const distractors = pickGraphemeDistractors({
      target: pairing.targetId,
      count: choiceCount - 1,
      level,
      confusions,
      allowed,
      rng,
    });
    choices = shuffle([pairing.targetId, ...distractors], rng);
  } else if (type.skill === 'ORAL_BLEND') {
    // Pictures of whole words, chosen like Picture Match's: no letter is on
    // screen, so sharing a first grapheme would be a distinction the child
    // cannot see. The pool is every picturable word at the level, NOT only the
    // decodable ones — the child is listening, not reading.
    const distractors = pickWordDistractors({
      target: pairing.targetId,
      count: choiceCount - 1,
      level,
      confusions,
      allowedWords: oralWords,
      // No `metGraphemes`: that filter exists to stop a child being shown a word
      // containing a letter they have not met, which is a trick question when
      // the word is written down. Here nothing is written down. Applying it
      // would empty the pool on day one and leave a "choice" of one picture.
      metGraphemes: undefined,
      sharedFirstGrapheme: false,
      rng,
    });
    choices = shuffle([pairing.targetId, ...distractors], rng);
  } else if (type.skill === 'BLEND_READ') {
    // Sound It Out's candidates are SPOKEN, so they are drawn from the level
    // rather than from what the child can read, and the met-letter filter does
    // not apply: that filter stops a child being shown a word containing a
    // letter they have not met, which is a trick question only when the word
    // is written down. Narrowing it to decodable words is what left `at` as
    // its own only candidate and deadlocked reading entirely.
    const spoken = type.id === 'sound-it-out';
    const distractors = pickWordDistractors({
      target: pairing.targetId,
      count: choiceCount - 1,
      level,
      confusions,
      allowedWords: spoken ? spokenWords : allowedWords,
      metGraphemes: spoken ? undefined : allowedGraphemes,
      // Word Pick shows written words, so its wrong answers share the target's
      // first letter and the child has to read to the end. Picture Match shows
      // pictures, where that is no shortcut.
      sharedFirstGrapheme: type.id === 'word-pick',
      // Sound It Out's candidates are spoken, so a picture-less word is a
      // perfectly good wrong answer. Leaving this on filtered `sat` out of
      // `at`'s candidates and produced a reading question with one choice.
      requirePicture: type.id !== 'sound-it-out',
      rng,
    });
    choices = shuffle([pairing.targetId, ...distractors], rng);
    secondaryTargets = [...new Set(getWord(pairing.targetId).graphemes)];
  } else if (type.id === 'missing-letter') {
    // One position of the word is blanked and the choices are LETTERS for that
    // gap: the right one plus wrong ones ranked like Sound Hunt's, so a letter
    // the child keeps mixing up with it is on the screen. The position is decided
    // here, not by the component, so a resumed quest asks about the same gap.
    // `correctChoice` stays the word id; the component reports the word with the
    // child's letter in the gap and the runner compares that.
    const word = getWord(pairing.targetId);
    blankIndex = blankPositionFor(word.graphemes, rng);
    const letter = word.graphemes[blankIndex];
    const distractors = pickGraphemeDistractors({
      target: letter,
      count: choiceCount - 1,
      level,
      confusions,
      allowed: allowedGraphemes,
      rng,
    });
    choices = shuffle([letter, ...distractors], rng);
    // Credit the letter the child CHOSE and no other. The rest of the word is on
    // the screen, handed to them: crediting m and t for `m _ t` would count
    // letters we showed as sounds they know.
    secondaryTargets = [letter];
  } else {
    // SEGMENT_SPELL (Word Builder): choices are letter tiles, the word's own letters as a
    // MULTISET (`pip` needs two p tiles) plus one or two extras, shuffled so
    // the correct order is never the tile order. `correctChoice` stays the
    // word id; the quest runner compares the assembled word to it.
    const word = getWord(pairing.targetId);
    const extras = pickTileDistractors({
      target: pairing.targetId,
      count: Math.max(1, choiceCount - word.graphemes.length),
      level,
      confusions,
      allowed: allowedGraphemes,
      rng,
    });
    choices = shuffle([...word.graphemes, ...extras], rng);
    secondaryTargets = [...new Set(word.graphemes)];
  }

  return {
    id: `${position}-${type.id}-${pairing.targetId}`,
    kind: 'task',
    taskTypeId: type.id,
    skill: type.skill,
    primaryTarget: pairing.targetId,
    secondaryTargets: type.secondaryTargets === 'graphemes' ? secondaryTargets : [],
    choices,
    correctChoice: pairing.targetId,
    band,
    anchor,
    difficulty: difficultyFor(type.id, pairing.targetId),
    seed,
    ...(blankIndex === undefined ? {} : { blankIndex }),
  };
}
