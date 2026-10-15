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

const isWordSkill = (skill: Skill): boolean => skill === 'BLEND_READ' || skill === 'SEGMENT_SPELL';

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
  const { pairings, blendWordIds } = teachable(level, metGraphemeIds, usableSkills, mastery, config);
  if (pairings.length === 0) throw new Error(`No teachable pairings at level ${level}`);

  // Whether a task type can actually be built for a pairing. A skill match is
  // not enough for a game that only works for some targets (`canServeTarget`),
  // or that needs something of the child's state: Picture Start needs pictures
  // of OTHER met letters to be wrong answers.
  const cap = effectiveCap(args.maxDifficulty);
  const canBuild = (type: TaskTypeMeta, p: Pairing): boolean => {
    if (type.skill !== p.skill) return false;
    if (type.canServeTarget !== undefined && !type.canServeTarget(p.targetId)) return false;
    // The cap is exact here rather than at the type level, because difficulty
    // depends on the word: `word-builder` on `at` may be allowed where the same
    // game on `sat` is not.
    if (difficultyFor(type.id, p.targetId) > cap) return false;
    if (type.id === 'picture-start') {
      const wrong = metGraphemeIds.filter((g) => g !== p.targetId && hasInitialPicture(g));
      return wrong.length >= type.minChoices - 1;
    }
    return true;
  };
  const buildableIn = (pool: readonly Pairing[]): TaskTypeMeta[] =>
    usable.filter((type) => pool.some((p) => canBuild(type, p)));

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

  const anchorCount = Math.min(config.winbackCount, length);
  const reviewCount = Math.min(config.reviewCount, length - anchorCount);
  const fillerCount = length - anchorCount;
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
        { open: winbackTypes, mid: winbackTypes, close: winbackTypes, closeOnPractised: false, strict: false },
      ]
    : [
        { open: easiest, mid: easiest, close: lowestTwo(anchorTypes), closeOnPractised: true, strict: true },
        { open: easiest, mid: easiest, close: lowestTwo(anchorTypes), closeOnPractised: true, strict: false },
      ];

  // Which task types each band can supply, by id rather than by skill: two types
  // of one skill need not be able to serve the same targets.
  const typeIdsOf = (tiers: readonly (readonly Pairing[])[]) => new Set(buildableIn(tiers.flat()).map((t) => t.id));
  const focusTypes = typeIdsOf(focusTiers);
  const reviewTypes = typeIdsOf(reviewTiers);
  const fillerTypes = usable.filter((t) => focusTypes.has(t.id) || reviewTypes.has(t.id));

  // Can the open anchor's skill be followed by a close of skill `close` on the
  // same target? That is what guarantees the closing target was asked earlier.
  const closeCompatible = (open: TaskTypeMeta, close: TaskTypeMeta): boolean =>
    anchorPool.some(
      (p) => canBuild(open, p) && pairings.some((q) => q.targetId === p.targetId && canBuild(close, q)),
    );

  let skeleton: TaskTypeMeta[] | null = null;
  let rules: AnchorRules = ladder[0];
  let middle = -1;
  search: for (const attempt of ladder) {
    for (const mid of middleSlots(length, anchorCount)) {
      skeleton = searchSkeleton({
        length,
        anchors: anchorRulesBySlot(length, anchorCount, mid, attempt),
        fillerTypes,
        focusTypes,
        reviewTypes,
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
    tiers: readonly (readonly Pairing[])[],
    type: TaskTypeMeta,
    preferProven: boolean,
    only?: (p: Pairing) => boolean,
  ): Pairing => {
    const candidates =
      tiers
        .map((tier) => tier.filter((p) => canBuild(type, p) && (only?.(p) ?? true)))
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
  const slots: (Slot | undefined)[] = new Array(length).fill(undefined);
  const anchorSlots = anchorRulesBySlot(length, anchorCount, middle, rules);
  const closeSlot = length - 1;
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
    slots[slot] = {
      pairing: pick(
        [anchorPool],
        type,
        true,
        closeIsPractised && slot === 0
          ? (p) => pairings.some((q) => q.targetId === p.targetId && canBuild(closeType, q))
          : undefined,
      ),
      type, band: anchorBand, anchor: true,
    };
  }

  // Fillers: which are focus and which are review. A slot whose task type only
  // one band can supply has no choice; the rest are shuffled.
  const fillerSlots = skeleton.map((_, i) => i).filter((i) => !anchorSlots.has(i));
  const bandOf = new Map<number, SessionBand>();
  const flexible: number[] = [];
  let reviewLeft = reviewCount;
  for (const i of fillerSlots) {
    const inFocus = focusTypes.has(skeleton[i].id);
    const inReview = reviewTypes.has(skeleton[i].id);
    if (inFocus && inReview) flexible.push(i);
    else if (inReview) { bandOf.set(i, 'review'); reviewLeft -= 1; } else bandOf.set(i, 'focus');
  }
  // Review is the weakest and most overdue material, so the review slots go to
  // the task types of the most urgent pairings first, not to chance.
  const review = new Set<number>();
  for (const p of reviewSource) {
    if (review.size >= reviewLeft) break;
    const slot = flexible.find((i) => !review.has(i) && canBuild(skeleton[i], p));
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
      pairing: pick(band === 'review' ? reviewTiers : focusTiers, skeleton[i], false),
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
      .filter((p) => canBuild(type, p) && asked.has(p.targetId))
      .sort((a, b) => (asked.get(b.targetId) ?? 0) - (asked.get(a.targetId) ?? 0))[0];
    if (!pairing) throw new Error('No practised target available for the closing anchor');
    slots[closeSlot] = {
      pairing, type, anchor: true,
      // Only a pairing that met the win-back bar is a win-back. A close on mastered
      // material that has since faded is still just focus work.
      band: winbackPool.includes(pairing) ? 'winback' : 'focus',
    };
  }

  const metGraphemeCount = metGraphemeIds.length;
  return (slots as Slot[]).map((slot, position) =>
    makeTask({
      ...slot,
      position,
      level,
      confusions,
      graphemesMet: metGraphemeCount,
      allowedGraphemes: metGraphemeIds,
      allowedWords: blendWordIds,
      seed: deriveSeed(baseSeed, position),
    }),
  );
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
  for (const word of picturableWordsForLevel(level)) pairings.push({ targetId: word.id, skill: 'BLEND_READ' });
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
): { pairings: Pairing[]; blendWordIds: WordId[] } {
  const met = new Set(metGraphemeIds);
  // Invariant 5a: met is not enough for a word, the sounds must be KNOWN.
  const known = knownGraphemes(metGraphemeIds, mastery, config);
  const decodable = new Set(
    wordsDecodableFrom(level, metGraphemeIds).filter((id) => getWord(id).graphemes.every((g) => known.has(g))),
  );
  const picturable = picturableWordsForLevel(level).filter((w) => decodable.has(w.id)).map((w) => w.id);
  // A picture-matching question needs a wrong answer to be a question at all.
  const blendWordIds = picturable.length >= 2 ? picturable : [];
  const blend = new Set(blendWordIds);

  const pairings = allPairings(level).filter((p) => {
    if (!usableSkills.has(p.skill)) return false;
    if (p.skill === 'BLEND_READ') return blend.has(p.targetId);
    if (p.skill === 'SEGMENT_SPELL') return decodable.has(p.targetId);
    return met.has(p.targetId);
  });
  return { pairings, blendWordIds };
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
 */
function currentFocusGraphemes(level: number, unmastered: Pairing[], config: EngineConfig): GraphemeId[] {
  const unmasteredGraphemes = graphemesForLevel(level)
    .filter((g) => unmastered.some((p) => !isWordSkill(p.skill) && p.targetId === g.id))
    .sort(
      (a, b) =>
        introductionGroupIndex(level, a.id) - introductionGroupIndex(level, b.id) ||
        a.sequenceIndex - b.sequenceIndex,
    );

  if (unmasteredGraphemes.length === 0) return getLevel(level).graphemeIds;
  return unmasteredGraphemes.slice(0, config.focusTargetCount).map((g) => g.id);
}

/** True when this pairing exercises one of the focus graphemes. */
function touchesFocus(pairing: Pairing, focusGraphemes: readonly GraphemeId[]): boolean {
  if (!isWordSkill(pairing.skill)) return focusGraphemes.includes(pairing.targetId);
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
  fillerTypes: readonly TaskTypeMeta[];
  /** Ids of the task types the focus band can supply a pairing for. */
  focusTypes: ReadonlySet<string>;
  /** Ids of the task types the review band can supply a pairing for. */
  reviewTypes: ReadonlySet<string>;
  focusSlots: number;
  reviewSlots: number;
  strict: boolean;
  closeCompatible: (open: TaskTypeMeta, close: TaskTypeMeta) => boolean;
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
  const tieOrder = new Map(shuffle([...spec.fillerTypes], spec.rng).map((t, i) => [t.id, i]));
  const deadEnds = new Set<string>();

  const go = (i: number, focusOnly: number, reviewOnly: number): boolean => {
    if (i === length) return true;
    const previous = i > 0 ? sequence[i - 1] : undefined;
    const key = `${i}|${previous?.id}|${sequence[0]?.id}|${focusOnly}|${reviewOnly}`;
    if (deadEnds.has(key)) return false;

    const rule = anchors.get(i);
    let options = rule
      ? rule.allowed.filter((t) => !rule.isClose || i === 0 || spec.closeCompatible(sequence[0], t))
      : [...spec.fillerTypes].sort(
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
        const inFocus = spec.focusTypes.has(type.id);
        const inReview = spec.reviewTypes.has(type.id);
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
  seed: number;
}

function makeTask(args: MakeTaskArgs): TaskInstance {
  const { pairing, type, band, anchor, position, level, confusions, graphemesMet, seed } = args;
  const { allowedGraphemes, allowedWords } = args;
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
  } else if (type.skill === 'BLEND_READ') {
    const distractors = pickWordDistractors({
      target: pairing.targetId,
      count: choiceCount - 1,
      level,
      confusions,
      allowedWords,
      metGraphemes: allowedGraphemes,
      // Word Pick shows written words, so its wrong answers share the target's
      // first letter and the child has to read to the end. Picture Match shows
      // pictures, where that is no shortcut.
      sharedFirstGrapheme: type.id === 'word-pick',
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
