import { describe, expect, it } from 'vitest';
import { getWord, graphemesForLevel } from '@soundlings/curriculum';
import type { Skill } from '@soundlings/curriculum';
import { DEFAULT_CONFIG } from './config';
import { applyAttempt, emptyRecord, getRecord, isMastered, strengthAt } from './mastery';
import { buildSession } from './sessionBuilder';
import { taskTypeById } from './taskTypes';
import type { BuildSessionArgs } from './sessionBuilder';
import { masteryKey } from './types';
import type { Attempt, MasteryMap, TaskInstance } from './types';

const HOUR = 3_600_000;
const NOW = 1000 * HOUR;

type Pair = readonly [id: string, skill: Skill];

/**
 * A mastery map in which the given pairings are mastered: three clean answers
 * across three sessions and three task types, `agoHours` before NOW.
 */
function masteredPairs(
  pairs: readonly Pair[],
  options: { agoHours?: number; types?: readonly string[] } = {},
): MasteryMap {
  const at = NOW - (options.agoHours ?? 0) * HOUR;
  const types = options.types ?? ['sound-hunt', 'word-builder', 'picture-match'];
  const map: MasteryMap = {};
  for (const [id, skill] of pairs) {
    let record = emptyRecord(id, skill, DEFAULT_CONFIG);
    for (let i = 0; i < 3; i += 1) {
      const attempt: Attempt = {
        sessionId: `s${i}`, targetId: id, skill, taskTypeId: types[i % types.length],
        correct: true, scaffolded: false, latencyMs: 900, weight: 1, at,
      };
      record = applyAttempt(record, attempt, DEFAULT_CONFIG);
    }
    map[masteryKey(id, skill)] = record;
  }
  return map;
}

/** s, a, t mastered plus the spellings that do not touch p, i or m: only f is left outside the focus. */
function reviewBase(): MasteryMap {
  return {
    ...masteredGraphemes(['s', 'a', 't']),
    ...masteredPairs([['at', 'SEGMENT_SPELL'], ['sat', 'SEGMENT_SPELL'], ['fat', 'SEGMENT_SPELL']]),
  };
}

/** Both sound skills mastered for each grapheme. */
function masteredGraphemes(ids: readonly string[]): MasteryMap {
  return masteredPairs(ids.flatMap((id): Pair[] => [[id, 'SOUND_ID'], [id, 'LETTER_SOUND']]));
}

function args(mastery: MasteryMap, sessionId: string, extra: Partial<BuildSessionArgs> = {}): BuildSessionArgs {
  return { sessionId, level: 1, mastery, confusions: {}, now: NOW, ...extra };
}

function build(mastery: MasteryMap, sessionId = 'test-session', extra: Partial<BuildSessionArgs> = {}) {
  return buildSession(args(mastery, sessionId, extra));
}

/**
 * Hours since mastery at which strength has slipped below the win-back bar (0.9) but
 * not the mastery bar (0.8). Tied to the shipped half-life (three correct answers give
 * 24 * 4^3 = 1536h); tests that use it assert the window, so retuning fails loudly.
 */
const MID_STRENGTH_AGO_HOURS = 300;

const SEEDS = Array.from({ length: 40 }, (_, i) => `seed-${i}`);

/** Hand-picked states spanning the child's whole first week, including the two-task-type ones. */
const STATES: Record<string, MasteryMap> = {
  'brand new': {},
  'day two: s and a heard but not yet sung': masteredPairs([['s', 'SOUND_ID'], ['a', 'SOUND_ID']]),
  's and a mastered': masteredGraphemes(['s', 'a']),
  's a t mastered': masteredGraphemes(['s', 'a', 't']),
  's a t p mastered': masteredGraphemes(['s', 'a', 't', 'p']),
  's a t p i mastered': masteredGraphemes(['s', 'a', 't', 'p', 'i']),
  'six mastered': masteredGraphemes(['s', 'a', 't', 'p', 'i', 'm']),
};

const isSpelling = (task: TaskInstance) => task.skill === 'SEGMENT_SPELL';
/** Word Builder's tasks: choices are the word's own letter TILES plus extras. Missing Letter's are not. */
const isTileSpelling = (task: TaskInstance) => task.taskTypeId === 'word-builder';

function difficulties(plan: TaskInstance[]): number[] {
  return plan.map((t) => t.difficulty);
}

describe('buildSession invariants', () => {
  it('returns exactly config.sessionLength tasks, whatever the child knows', () => {
    for (const [name, mastery] of Object.entries(STATES)) {
      expect(build(mastery).length, name).toBe(DEFAULT_CONFIG.sessionLength);
    }
  });

  it('honours an explicit length, including short ones, and returns nothing for zero', () => {
    for (const length of [1, 2, 3, 5, 8, 20]) {
      expect(build(masteredGraphemes(['s', 'a']), 'len', { length }).length, `length ${length}`).toBe(length);
    }
    expect(build({}, 'len', { length: 0 })).toEqual([]);
  });

  it('opens on an anchor task so the child starts on a success', () => {
    for (const [name, mastery] of Object.entries(STATES)) {
      expect(build(mastery)[0].anchor, name).toBe(true);
    }
  });

  it('closes on an anchor task so the child leaves on a success', () => {
    for (const [name, mastery] of Object.entries(STATES)) {
      const plan = build(mastery);
      expect(plan[plan.length - 1].anchor, name).toBe(true);
    }
  });

  it('places an anchor in the middle third as a breather, at every session length', () => {
    for (const length of [8, 9, 10, 13, 14, 15, 20]) {
      for (const [name, mastery] of Object.entries(STATES)) {
        const plan = build(mastery, 'mid', { length });
        const start = Math.floor(plan.length / 3);
        const end = Math.ceil((2 * plan.length) / 3);
        expect(plan.slice(start, end).some((t) => t.anchor), `${name}, length ${length}`).toBe(true);
      }
    }
  });

  it('marks exactly winbackCount tasks as anchors, and only at the three positions', () => {
    for (const [name, mastery] of Object.entries(STATES)) {
      const plan = build(mastery);
      const anchored = plan.map((t, i) => (t.anchor ? i : -1)).filter((i) => i >= 0);
      expect(anchored.length, name).toBe(DEFAULT_CONFIG.winbackCount);
      expect(anchored[0], name).toBe(0);
      expect(anchored[anchored.length - 1], name).toBe(plan.length - 1);
    }
  });

  it('never places two of the same mini-game back to back, for any seed or any stage of learning', () => {
    for (const [name, mastery] of Object.entries(STATES)) {
      for (const seed of SEEDS) {
        const plan = build(mastery, seed);
        for (let i = 1; i < plan.length; i += 1) {
          expect(
            plan[i].taskTypeId === plan[i - 1].taskTypeId,
            `${name}, ${seed}: ${plan[i - 1].taskTypeId} repeated at ${i}`,
          ).toBe(false);
        }
      }
    }
  });

  it('never places two of the same mini-game back to back in a short session either', () => {
    // Not 3: with three anchors in three slots and two task types, the middle anchor
    // would have to be the same type as one of its neighbours. No real session is that short.
    for (const length of [2, 4, 5, 8, 9]) {
      for (const [name, mastery] of Object.entries(STATES)) {
        for (const seed of SEEDS.slice(0, 10)) {
          const plan = build(mastery, seed, { length });
          for (let i = 1; i < plan.length; i += 1) {
            expect(plan[i].taskTypeId, `${name}, ${seed}, length ${length}, slot ${i}`).not.toBe(plan[i - 1].taskTypeId);
          }
        }
      }
    }
  });

  it('never targets a grapheme from a later level', () => {
    const taught = new Set(graphemesForLevel(1).map((g) => g.id));
    for (const [name, mastery] of Object.entries(STATES)) {
      for (const task of build(mastery)) {
        for (const choice of task.choices) {
          if (choice.length === 1) expect(taught.has(choice), `${name}: ${choice}`).toBe(true);
        }
      }
    }
  });

  it('shows only what the child has met: targets, wrong answers, picture words and spelling tiles', () => {
    // The introduction groups are [s a t] [p i] [m f]; focus decides how far the child has got.
    const level1 = ['s', 'a', 't', 'p', 'i', 'm', 'f'];
    const met: Record<string, string[]> = {
      'brand new': ['s', 'a', 't'],
      'day two: s and a heard but not yet sung': ['s', 'a', 't'],
      's and a mastered': ['s', 'a', 't', 'p', 'i'],
      's a t mastered': level1,
      's a t p mastered': level1,
      's a t p i mastered': level1,
      'six mastered': level1,
    };
    for (const [name, mastery] of Object.entries(STATES)) {
      for (const seed of SEEDS.slice(0, 15)) {
        for (const task of build(mastery, seed)) {
          const label = `${name}, ${seed}, ${task.id}`;
          const lettersOf = (id: string) =>
            task.skill === 'SOUND_ID' || task.skill === 'LETTER_SOUND' ? [id] : getWord(id).graphemes;
          for (const g of lettersOf(task.primaryTarget)) expect(met[name], `${label}: target needs ${g}`).toContain(g);
          for (const choice of task.choices) {
            const letters = task.skill === 'BLEND_READ' ? getWord(choice).graphemes : [choice];
            for (const g of letters) expect(met[name], `${label}: choice ${choice} shows ${g}`).toContain(g);
          }
        }
      }
    }
  });

  it('always includes the correct answer, or for spelling every letter the word needs', () => {
    for (const [name, mastery] of Object.entries(STATES)) {
      for (const task of build(mastery)) {
        if (task.taskTypeId === 'missing-letter') {
          // choices are LETTERS for one gap; the right one must be among them.
          expect(task.choices, name).toContain(getWord(task.correctChoice).graphemes[task.blankIndex as number]);
        } else if (isSpelling(task)) {
          // choices are letter TILES; correctChoice is the word id. `pip` needs two p tiles.
          const tiles = [...task.choices];
          for (const grapheme of getWord(task.correctChoice).graphemes) {
            const at = tiles.indexOf(grapheme);
            expect(at, `${name}: ${task.correctChoice} is missing a ${grapheme} tile`).toBeGreaterThanOrEqual(0);
            tiles.splice(at, 1);
          }
        } else {
          expect(task.choices, name).toContain(task.correctChoice);
        }
      }
    }
  });

  it('offers no duplicate choices, except the repeated tiles a spelling word really needs', () => {
    for (const [name, mastery] of Object.entries(STATES)) {
      for (const task of build(mastery)) {
        if (isTileSpelling(task)) {
          const needed = getWord(task.correctChoice).graphemes;
          const extras = [...task.choices];
          for (const grapheme of needed) extras.splice(extras.indexOf(grapheme), 1);
          // Tiles beyond the word's own are distinct and are not letters the word already uses.
          expect(new Set(extras).size, `${name}: ${task.correctChoice}`).toBe(extras.length);
          for (const extra of extras) expect(needed, `${name}: ${task.correctChoice}`).not.toContain(extra);
        } else {
          expect(new Set(task.choices).size, name).toBe(task.choices.length);
        }
      }
    }
  });

  it('supplies two tiles for a word that repeats a letter', () => {
    // pip = p-i-p. Find one by sweeping seeds over a state where it is in play: p is mastered
    // and i, the focus, has been answered twice, so every sound in pip is known (invariant 5a).
    const mastery = { ...masteredGraphemes(['s', 'a', 't', 'p']), ...heard({ i: 2 }) };
    const pip = SEEDS.flatMap((seed) => build(mastery, seed)).find(
      (t) => t.taskTypeId === 'word-builder' && t.correctChoice === 'pip',
    );
    expect(pip, 'no pip spelling task came up in 40 seeds').toBeDefined();
    expect(pip!.choices.filter((c) => c === 'p').length).toBeGreaterThanOrEqual(2);
  });

  it('gives every task a unique id', () => {
    for (const [name, mastery] of Object.entries(STATES)) {
      const plan = build(mastery);
      expect(new Set(plan.map((t) => t.id)).size, name).toBe(plan.length);
    }
  });

  it('is deterministic for the same session id and mastery state', () => {
    const mastery = masteredGraphemes(['s', 'a']);
    expect(build(mastery, 'same')).toEqual(build(mastery, 'same'));
  });

  it('produces a different plan for a different session id', () => {
    const mastery = masteredGraphemes(['s', 'a']);
    expect(build(mastery, 'one')).not.toEqual(build(mastery, 'two'));
  });

  it('does not mutate the mastery map it is given', () => {
    const mastery = masteredGraphemes(['s', 'a']);
    const before = JSON.stringify(mastery);
    build(mastery);
    expect(JSON.stringify(mastery)).toBe(before);
  });
});

describe('buildSession for a brand-new child', () => {
  it('opens and takes its breather on the easiest task type, so the first screen is the gentlest', () => {
    const plan = build({});
    const min = Math.min(...difficulties(plan));
    expect(plan[0].difficulty).toBe(min);
    const mid = plan.findIndex((t, i) => i > 0 && i < plan.length - 1 && t.anchor);
    expect(mid).toBeGreaterThan(0);
    expect(plan[mid].difficulty).toBe(min);
  });

  it('closes on at most the second-easiest task type', () => {
    for (const seed of SEEDS) {
      const plan = build({}, seed);
      const distinct = [...new Set(difficulties(plan))].sort((a, b) => a - b);
      expect(plan[plan.length - 1].difficulty, seed).toBeLessThanOrEqual(distinct[1]);
    }
  });

  it('closes on a sound it has already asked about earlier in the quest', () => {
    for (const seed of SEEDS) {
      const plan = build({}, seed);
      const closing = plan[plan.length - 1];
      const earlier = plan.slice(0, -1).filter((t) => t.primaryTarget === closing.primaryTarget);
      expect(earlier.length, seed).toBeGreaterThanOrEqual(1);
    }
  });

  it('closes on the sound it has asked about most, not merely one it asked about once', () => {
    for (const seed of SEEDS) {
      const plan = build({}, seed, { config: { focusTargetCount: 5 } });
      const closing = plan[plan.length - 1];
      const counts = new Map<string, number>();
      // Sound tasks only: the close is a sound task, so compare like with like.
      for (const task of plan.slice(0, -1).filter((t) => t.skill === 'SOUND_ID' || t.skill === 'LETTER_SOUND')) {
        counts.set(task.primaryTarget, (counts.get(task.primaryTarget) ?? 0) + 1);
      }
      expect(counts.get(closing.primaryTarget), `${seed}: closed on ${closing.primaryTarget}`).toBe(Math.max(...counts.values()));
    }
  });

  it('closes on a practised target even when the first target in the level is not in play', () => {
    // s is mastered but has decayed below the win-back bar, so there are no win-backs
    // and focus has moved on to a and t. A close that merely took the first available
    // singer would land on s, which this quest never asked about.
    const mastery = masteredPairs([['s', 'SOUND_ID'], ['s', 'LETTER_SOUND']], { agoHours: MID_STRENGTH_AGO_HOURS });
    for (const skill of ['SOUND_ID', 'LETTER_SOUND'] as const) {
      const strength = strengthAt(getRecord(mastery, 's', skill, DEFAULT_CONFIG), NOW, DEFAULT_CONFIG);
      expect(strength).toBeGreaterThanOrEqual(DEFAULT_CONFIG.masteryStrength);
      expect(strength).toBeLessThan(DEFAULT_CONFIG.winbackStrength);
    }
    for (const seed of SEEDS) {
      const plan = build(mastery, seed);
      expect(plan.some((t) => t.band === 'winback'), seed).toBe(false);
      const closing = plan[plan.length - 1];
      const earlier = plan.slice(0, -1).filter((t) => t.primaryTarget === closing.primaryTarget);
      expect(earlier.length, `${seed}: closed on ${closing.primaryTarget}`).toBeGreaterThanOrEqual(1);
    }
  });

  it('closes on a practised target when the focus is wide enough that not every target is asked', () => {
    // Five focus letters: a quest of 14 cannot give each one a turn in every game, so a close
    // that took whichever target was least used could land on one it never asked about.
    for (const seed of SEEDS) {
      const plan = build({}, seed, { config: { focusTargetCount: 5 } });
      const closing = plan[plan.length - 1];
      const earlier = plan.slice(0, -1).filter((t) => t.primaryTarget === closing.primaryTarget);
      expect(earlier.length, `${seed}: closed on ${closing.primaryTarget}`).toBeGreaterThanOrEqual(1);
    }
  });

  it('has two task types on day one, because words wait until the sounds are known', () => {
    // Before invariant 5a this asserted three, with spelling credited for s, a and t. See
    // 'sounds before words' below, which also holds the anti-deadlock property.
    for (const seed of SEEDS) {
      const plan = build({}, seed);
      expect(new Set(plan.map((t) => t.taskTypeId)), seed).toEqual(new Set(['sound-hunt', 'sound-singer']));
      expect(plan[0].taskTypeId, seed).toBe('sound-hunt');
    }
  });

  it('once s, a and t are known, spelling credits all three, giving each a second task type to be proven by', () => {
    // The anti-deadlock property. SOUND_ID mastery needs two task types, and sound-hunt is the only
    // direct one, so word tasks must supply the second. Invariant 5a delays them until s, a and t
    // have been answered twice; it must not prevent them. (This used to assert it on day one.)
    const mastery = heard({ s: 2, a: 2, t: 2 });
    const spelled = SEEDS.flatMap((seed) => build(mastery, seed)).filter((t) => t.skill === 'SEGMENT_SPELL');
    expect(spelled.length).toBeGreaterThan(0);
    const credited = new Set(spelled.flatMap((t) => t.secondaryTargets));
    expect(credited).toEqual(new Set(['s', 'a', 't']));
  });

  it('alternates strictly between two task types when the frustration cap leaves only two', () => {
    // maxDifficulty 2 rules out spelling. Only sound-hunt and sound-singer remain, so
    // the no-adjacent-repeat rule forces strict alternation, which is why the closing
    // anchor may be the second-easiest type.
    for (const seed of SEEDS) {
      const plan = build({}, seed, { maxDifficulty: 2 });
      expect(new Set(plan.map((t) => t.taskTypeId)), seed).toEqual(new Set(['sound-hunt', 'sound-singer']));
      expect(plan[0].taskTypeId, seed).toBe('sound-hunt');
      expect(plan[plan.length - 1].taskTypeId, seed).toBe('sound-singer');
      for (let i = 1; i < plan.length; i += 1) {
        expect(plan[i].taskTypeId, `${seed} slot ${i}`).not.toBe(plan[i - 1].taskTypeId);
      }
    }
  });

  it('fills every anchor from the current focus, not from the win-back pool', () => {
    const plan = build({});
    const anchors = plan.filter((t) => t.anchor);
    expect(anchors.length).toBe(DEFAULT_CONFIG.winbackCount);
    for (const anchor of anchors) {
      expect(anchor.band).toBe('focus');
      expect(['s', 'a', 't']).toContain(anchor.primaryTarget);
    }
  });

  it('treats a single mastered target as still brand-new, not as three win-backs on that one sound', () => {
    const mastery = masteredPairs([['s', 'SOUND_ID']]);
    expect(isMastered(getRecord(mastery, 's', 'SOUND_ID', DEFAULT_CONFIG), NOW, DEFAULT_CONFIG)).toBe(true);
    for (const seed of SEEDS) {
      const plan = build(mastery, seed);
      // The opening and breather anchors cannot be win-backs: there is only one candidate.
      // The close may be, if it lands on that sound, because it did meet the win-back bar.
      const winbackSlots = plan.map((t, i) => (t.band === 'winback' ? i : -1)).filter((i) => i >= 0);
      expect(winbackSlots.every((i) => i === plan.length - 1), `${seed}: win-backs at ${winbackSlots}`).toBe(true);
    }
  });

  it('focuses only on the first introduction group', () => {
    const lettersOf = (t: TaskInstance) =>
      t.skill === 'SOUND_ID' || t.skill === 'LETTER_SOUND' ? [t.primaryTarget] : getWord(t.primaryTarget).graphemes;
    for (const seed of SEEDS) {
      for (const task of build({}, seed)) {
        for (const letter of lettersOf(task)) expect(['s', 'a', 't'], `${seed}: ${task.id}`).toContain(letter);
      }
    }
  });

  it('never offers a letter the child has not been introduced to, even as a wrong answer', () => {
    // Day one: the child has met s, a and t. Showing them f as a distractor is
    // not a challenge, it is a trick question.
    for (const seed of SEEDS) {
      for (const task of build({}, seed)) {
        for (const choice of task.choices) expect(['s', 'a', 't'], `${seed}: saw ${choice}`).toContain(choice);
      }
    }
  });

  it('asks only sound tasks, whatever the seed', () => {
    // Was "spells only at and sat". Spelling is no longer possible on day one.
    for (const seed of SEEDS) {
      for (const task of build({}, seed)) expect(['SOUND_ID', 'LETTER_SOUND'], seed).toContain(task.skill);
    }
  });

  it('once s, a and t are known, spells only at and sat and never reads, since no picture word is buildable', () => {
    const mastery = heard({ s: 2, a: 2, t: 2 });
    for (const seed of SEEDS) {
      for (const task of build(mastery, seed)) {
        expect(['SOUND_ID', 'LETTER_SOUND', 'SEGMENT_SPELL'], seed).toContain(task.skill);
        if (task.skill === 'SEGMENT_SPELL') expect(['at', 'sat'], seed).toContain(task.primaryTarget);
      }
    }
  });

  it('starts every task at the fewest choices its mini-game allows, so a first screen is winnable', () => {
    for (const task of build({})) {
      expect(task.choices.length, task.id).toBe(taskTypeById(task.taskTypeId).minChoices);
    }
  });

  it('shows both focus sounds across the session, not just one', () => {
    const sounds = build({})
      .filter((t) => t.skill === 'SOUND_ID' || t.skill === 'LETTER_SOUND')
      .map((t) => t.primaryTarget);
    expect(sounds).toContain('s');
    expect(sounds).toContain('a');
    for (const sound of sounds) expect(['s', 'a', 't']).toContain(sound);
  });
});

describe('buildSession when only two task types are available but win-backs exist', () => {
  // s and a heard but not yet sung: two win-backs, both sound-hunt. The frustration cap
  // (difficulty 2) rules spelling out, so only two task types remain.
  const mastery = STATES['day two: s and a heard but not yet sung'];
  const capped = { maxDifficulty: DEFAULT_CONFIG.cappedDifficulty };

  it('really has win-backs and really has only two task types', () => {
    const plan = build(mastery, 'test-session', capped);
    expect(plan.some((t) => t.band === 'winback')).toBe(true);
    expect(new Set(plan.map((t) => t.taskTypeId)).size).toBe(2);
  });

  it('opens and breathes on win-backs, and closes on a sound it already asked about', () => {
    for (const seed of SEEDS) {
      const plan = build(mastery, seed, capped);
      expect(plan[0].band, seed).toBe('winback');
      const mid = plan.findIndex((t, i) => i > 0 && i < plan.length - 1 && t.anchor);
      expect(plan[mid].band, seed).toBe('winback');
      const closing = plan[plan.length - 1];
      expect(plan.slice(0, -1).some((t) => t.primaryTarget === closing.primaryTarget), seed).toBe(true);
    }
  });
});

describe('buildSession composition', () => {
  it('splits the quest exactly into focus, review and anchors', () => {
    for (const [name, mastery] of Object.entries(STATES)) {
      const plan = build(mastery);
      const anchors = plan.filter((t) => t.anchor).length;
      const review = plan.filter((t) => t.band === 'review' && !t.anchor).length;
      const focus = plan.filter((t) => t.band === 'focus' && !t.anchor).length;
      expect(anchors, name).toBe(DEFAULT_CONFIG.winbackCount);
      expect(review, name).toBe(DEFAULT_CONFIG.reviewCount);
      expect(focus, name).toBe(DEFAULT_CONFIG.sessionLength - DEFAULT_CONFIG.winbackCount - DEFAULT_CONFIG.reviewCount);
    }
  });

  it('follows config for the split rather than hard-coding it', () => {
    const plan = build(masteredGraphemes(['s', 'a']), 'cfg', {
      config: { winbackCount: 2, reviewCount: 5 },
    });
    expect(plan.filter((t) => t.anchor).length).toBe(2);
    expect(plan.filter((t) => t.band === 'review').length).toBe(5);
    expect(plan.filter((t) => t.band === 'focus').length).toBe(7);
  });

  it('weights the plan toward current focus', () => {
    const plan = build(masteredGraphemes(['s', 'a']));
    const focus = plan.filter((t) => t.band === 'focus').length;
    expect(focus).toBeGreaterThanOrEqual(plan.length / 2);
  });

  it('draws focus from the newest unmastered sounds and the words that contain them', () => {
    // s and a mastered, so focus moves to t, p and i.
    const plan = build(masteredGraphemes(['s', 'a']));
    for (const task of plan.filter((t) => t.band === 'focus' && !t.anchor)) {
      const graphemes = task.skill === 'BLEND_READ' || task.skill === 'SEGMENT_SPELL'
        ? getWord(task.primaryTarget).graphemes
        : [task.primaryTarget];
      expect(graphemes.some((g) => g === 't' || g === 'p' || g === 'i'), `${task.id}`).toBe(true);
    }
  });

  it('draws win-backs only from mastered targets once some exist', () => {
    const plan = build(masteredGraphemes(['s', 'a']));
    const winbacks = plan.filter((t) => t.band === 'winback');
    expect(winbacks.length).toBe(DEFAULT_CONFIG.winbackCount);
    for (const task of winbacks) {
      expect(['s', 'a']).toContain(task.primaryTarget);
    }
  });

  it('keeps a sound the child has just failed out of the win-back slots', () => {
    // s was mastered, then answered wrongly: it is unmastered and must not be a guaranteed win.
    const base = masteredGraphemes(['s', 'a']);
    const failed = applyAttempt(
      getRecord(base, 's', 'SOUND_ID', DEFAULT_CONFIG),
      {
        sessionId: 'later', targetId: 's', skill: 'SOUND_ID', taskTypeId: 'sound-hunt',
        correct: false, scaffolded: false, latencyMs: 900, weight: 1, at: NOW,
      },
      DEFAULT_CONFIG,
    );
    const mastery = { ...base, [masteryKey('s', 'SOUND_ID')]: failed };
    for (const seed of SEEDS) {
      const plan = build(mastery, seed);
      for (const task of plan.filter((t) => t.band === 'winback')) {
        expect(`${task.primaryTarget}/${task.skill}`, seed).not.toBe('s/SOUND_ID');
      }
    }
  });

  it('prefers, for a win-back, a task type the child has already proven for that target', () => {
    // Both sounds are mastered, but only `a` was proven on sound-hunt. s comes first in
    // teaching order, so only a real preference for the proven type can put `a` first.
    const mastery = {
      ...masteredPairs([['s', 'SOUND_ID']], { types: ['word-builder', 'picture-match'] }),
      ...masteredPairs([['a', 'SOUND_ID']], { types: ['sound-hunt', 'word-builder'] }),
    };
    for (const seed of SEEDS) {
      const plan = build(mastery, seed);
      expect(plan[0].band, seed).toBe('winback');
      expect(plan[0].taskTypeId, seed).toBe('sound-hunt');
      expect(plan[0].primaryTarget, seed).toBe('a');
    }
  });

  it('widens the choice count as the child meets more graphemes', () => {
    const early = build({});
    const later = build(masteredGraphemes(['s', 'a', 't', 'p', 'i']));
    const earlyMax = Math.max(...early.filter((t) => t.taskTypeId === 'sound-hunt').map((t) => t.choices.length));
    const laterMax = Math.max(...later.filter((t) => t.taskTypeId === 'sound-hunt').map((t) => t.choices.length));
    expect(laterMax).toBeGreaterThan(earlyMax);
  });

  it('credits the distinct graphemes of a word task as secondary targets', () => {
    const plan = build(masteredGraphemes(['s', 'a', 't']));
    const wordTasks = plan.filter((t) => t.skill === 'BLEND_READ' || t.skill === 'SEGMENT_SPELL');
    expect(wordTasks.length).toBeGreaterThan(0);
    for (const task of wordTasks) {
      expect(task.secondaryTargets, task.id).toEqual([...new Set(getWord(task.primaryTarget).graphemes)]);
    }
  });

  it('gives sound tasks no secondary targets', () => {
    const plan = build(masteredGraphemes(['s', 'a']));
    const soundTasks = plan.filter((t) => t.skill === 'SOUND_ID' || t.skill === 'LETTER_SOUND');
    expect(soundTasks.length).toBeGreaterThan(0);
    for (const task of soundTasks) expect(task.secondaryTargets).toEqual([]);
  });

  it('uses only words buildable from the letters met so far, whether read or spelled', () => {
    const met = ['s', 'a', 't', 'p', 'i'];
    for (const seed of SEEDS) {
      for (const task of build(masteredGraphemes(['s', 'a']), seed)) {
        if (task.skill === 'SOUND_ID' || task.skill === 'LETTER_SOUND') continue;
        for (const grapheme of getWord(task.primaryTarget).graphemes) {
          expect(met, `${seed}: ${task.primaryTarget} needs ${grapheme}`).toContain(grapheme);
        }
        if (task.skill === 'BLEND_READ') {
          for (const choice of task.choices) {
            for (const grapheme of getWord(choice).graphemes) {
              expect(met, `${seed}: picture choice ${choice} needs ${grapheme}`).toContain(grapheme);
            }
          }
        }
      }
    }
  });

  it('only shows pictures for words that have one', () => {
    for (const seed of SEEDS) {
      for (const task of build(masteredGraphemes(['s', 'a', 't', 'p']), seed)) {
        if (task.skill !== 'BLEND_READ') continue;
        for (const choice of task.choices) expect(getWord(choice).picture, `${seed}: ${choice}`).toBeDefined();
      }
    }
  });

  it('shuffles the choices, so the right answer is not always in the same place', () => {
    const mastery = masteredGraphemes(['s', 'a', 't', 'p']);
    const positions = new Set<number>();
    for (const seed of SEEDS) {
      for (const task of build(mastery, seed)) {
        if (task.skill === 'SOUND_ID') positions.add(task.choices.indexOf(task.correctChoice));
      }
    }
    // Six letters met, so a hunt has four choices and the answer can land in any of them.
    expect([...positions].sort()).toEqual([0, 1, 2, 3]);
  });

  it('shuffles the spelling tiles, so they never arrive in the word\'s own order', () => {
    const mastery = masteredGraphemes(['s', 'a', 't', 'p']);
    const spelled = SEEDS.flatMap((seed) => build(mastery, seed)).filter(isTileSpelling);
    expect(spelled.length).toBeGreaterThan(0);
    const inOrder = spelled.filter((t) => t.choices.slice(0, 3).join('') === getWord(t.correctChoice).graphemes.join(''));
    expect(inOrder.length).toBeLessThan(spelled.length / 2);
  });

  it('shows a letter the child keeps confusing with the target, ahead of the rest', () => {
    // Seven letters met, so a hunt has several wrong answers to choose from. m is not on t's
    // generic confusable list, so only the child's own history can put it on the screen.
    const mastery = masteredGraphemes(['s', 'a', 't', 'p', 'i']);
    const confusions = { 't>m': 5 };
    const hunts = SEEDS.flatMap((seed) => build(mastery, seed, { confusions }))
      .filter((t) => t.skill === 'SOUND_ID' && t.correctChoice === 't');
    expect(hunts.length).toBeGreaterThan(0);
    for (const task of hunts) expect(task.choices, task.id).toContain('m');
    const without = SEEDS.flatMap((seed) => build(mastery, seed))
      .filter((t) => t.skill === 'SOUND_ID' && t.correctChoice === 't');
    expect(without.some((t) => !t.choices.includes('m'))).toBe(true);
  });

  it('shows a picture the child keeps mistaking for the target, even when it is not a close match', () => {
    // sip is two letters from mat, behind the minimal pairs map and pat, so only history ranks it first.
    // m has been answered twice, so mat is a word the child is ready for (invariant 5a).
    const mastery = { ...masteredGraphemes(['s', 'a', 't', 'p', 'i']), ...heard({ m: 2 }) };
    const confusions = { 'mat>sip': 5 };
    const reads = SEEDS.flatMap((seed) => build(mastery, seed, { confusions }))
      .filter((t) => t.skill === 'BLEND_READ' && t.correctChoice === 'mat');
    expect(reads.length).toBeGreaterThan(0);
    for (const task of reads) expect(task.choices, task.id).toContain('sip');
  });

  it('offers a letter the child keeps confusing as an extra spelling tile', () => {
    // i and m have been answered twice, so sit and sam are ready words that hold s but not p.
    const mastery = { ...masteredGraphemes(['s', 'a', 't', 'p']), ...heard({ i: 2, m: 2 }) };
    const confusions = { 's>p': 5 };
    const spelled = SEEDS.flatMap((seed) => build(mastery, seed, { confusions })).filter((t) => {
      const letters = isTileSpelling(t) ? getWord(t.correctChoice).graphemes : [];
      return letters.includes('s') && !letters.includes('p');
    });
    expect(spelled.length).toBeGreaterThan(0);
    for (const task of spelled) expect(task.choices, task.id).toContain('p');
  });

  it('gives each task its own seed', () => {
    const plan = build(masteredGraphemes(['s', 'a', 't', 'p']));
    expect(new Set(plan.map((t) => t.seed)).size).toBe(plan.length);
  });

  it('shuffles the pictures in a reading task too', () => {
    // t, p and i are the focus and have each been answered twice: the picture words are ready (invariant 5a).
    const mastery = { ...masteredGraphemes(['s', 'a']), ...heard({ t: 2, p: 2, i: 2 }) };
    const positions = new Set<number>();
    for (const seed of SEEDS) {
      for (const task of build(mastery, seed)) {
        if (task.skill === 'BLEND_READ') positions.add(task.choices.indexOf(task.correctChoice));
      }
    }
    // Three pictures per reading task, so the answer can land in any of three places.
    expect([...positions].sort()).toEqual([0, 1, 2]);
  });

  it('credits a repeated letter once: pip is p and i, not p, i and p', () => {
    const mastery = { ...masteredGraphemes(['s', 'a', 't', 'p']), ...heard({ i: 2 }) };
    const pips = SEEDS.flatMap((seed) => build(mastery, seed)).filter((t) => t.correctChoice === 'pip');
    expect(pips.length).toBeGreaterThan(0);
    for (const task of pips) expect(task.secondaryTargets).toEqual(['p', 'i']);
  });

  it('opens on the strongest win-back, which is the surest success', () => {
    const mastery = {
      ...masteredPairs([['a', 'SOUND_ID']], { agoHours: 4 }),
      ...masteredPairs([['s', 'SOUND_ID']], { agoHours: 1 }),
    };
    for (const seed of SEEDS) {
      const plan = build(mastery, seed);
      expect(plan[0].band, seed).toBe('winback');
      expect(plan[0].primaryTarget, seed).toBe('s');
    }
  });

  it('reviews the weakest material first', () => {
    // s, a and t are mastered, and so are the spellings that do not touch the focus. p, i
    // and m are the focus; f is met but outside it, so it is the only review.
    // f/SOUND_ID has just been failed, f/LETTER_SOUND is nearly known.
    // p, i and m, the focus, have been answered twice, so the focus has words in it as it did before
    // invariant 5a, and the review slot is a real choice between sounds rather than a forced spelling.
    const base = { ...reviewBase(), ...heard({ p: 2, i: 2, m: 2 }) };
    const answer = (skill: Skill, correct: boolean, at: number, id: string): Attempt => ({
      sessionId: id, targetId: 'f', skill, taskTypeId: 'sound-hunt', correct, scaffolded: false, latencyMs: 900, weight: 1, at,
    });
    let weak = emptyRecord('f', 'SOUND_ID', DEFAULT_CONFIG);
    weak = applyAttempt(weak, answer('SOUND_ID', false, NOW - HOUR, 'w1'), DEFAULT_CONFIG);
    let nearly = emptyRecord('f', 'LETTER_SOUND', DEFAULT_CONFIG);
    nearly = applyAttempt(nearly, answer('LETTER_SOUND', true, NOW - HOUR, 'n1'), DEFAULT_CONFIG);
    nearly = applyAttempt(nearly, answer('LETTER_SOUND', true, NOW - HOUR, 'n2'), DEFAULT_CONFIG);
    const mastery = { ...base, [masteryKey('f', 'SOUND_ID')]: weak, [masteryKey('f', 'LETTER_SOUND')]: nearly };
    for (const seed of SEEDS) {
      const review = build(mastery, seed, { config: { reviewCount: 1 } }).filter((t) => t.band === 'review');
      expect(review.length, seed).toBe(1);
      expect(`${review[0].primaryTarget}/${review[0].skill}`, seed).toBe('f/SOUND_ID');
    }
  });

  it('counts how overdue a target is as well as how weak, when reviewing', () => {
    // Equal strength: both were last answered correctly two hours ago. f/SOUND_ID was then
    // seen again with a hint a moment ago, which moves lastSeenAt but proves nothing, while
    // f/LETTER_SOUND has gone untouched. Only the overdue term separates them, and
    // f/SOUND_ID would win a tie because it comes first in teaching order.
    // p, i and m, the focus, have been answered twice, so the focus has words in it as it did before
    // invariant 5a, and the review slot is a real choice between sounds rather than a forced spelling.
    const base = { ...reviewBase(), ...heard({ p: 2, i: 2, m: 2 }) };
    const correct = (skill: Skill, id: string): Attempt => ({
      sessionId: id, targetId: 'f', skill, taskTypeId: 'sound-hunt', correct: true, scaffolded: false, latencyMs: 900, weight: 1, at: NOW - 2 * HOUR,
    });
    let sid = applyAttempt(emptyRecord('f', 'SOUND_ID', DEFAULT_CONFIG), correct('SOUND_ID', 'a'), DEFAULT_CONFIG);
    sid = applyAttempt(sid, { ...correct('SOUND_ID', 'b'), scaffolded: true, at: NOW - 60_000 }, DEFAULT_CONFIG);
    const ls = applyAttempt(emptyRecord('f', 'LETTER_SOUND', DEFAULT_CONFIG), correct('LETTER_SOUND', 'a'), DEFAULT_CONFIG);
    const mastery = { ...base, [masteryKey('f', 'SOUND_ID')]: sid, [masteryKey('f', 'LETTER_SOUND')]: ls };
    expect(strengthAt(sid, NOW, DEFAULT_CONFIG)).toBeCloseTo(strengthAt(ls, NOW, DEFAULT_CONFIG), 10);
    expect(sid.lastSeenAt).toBeGreaterThan(ls.lastSeenAt);
    for (const seed of SEEDS) {
      const review = build(mastery, seed, { config: { reviewCount: 1 } }).filter((t) => t.band === 'review');
      expect(`${review[0].primaryTarget}/${review[0].skill}`, seed).toBe('f/LETTER_SOUND');
    }
  });

});

describe('buildSession under a difficulty cap and a short session (the frustration guard)', () => {
  const mastery = masteredGraphemes(['s', 'a', 't']);

  it('never schedules a task type above the cap, and keeps the other invariants', () => {
    for (const cap of [2, 3]) {
      for (const seed of SEEDS) {
        const plan = build(mastery, seed, { maxDifficulty: cap, length: 8 });
        expect(plan.length).toBe(8);
        for (const task of plan) expect(task.difficulty, `cap ${cap}, ${seed}`).toBeLessThanOrEqual(cap);
        expect(plan[0].anchor).toBe(true);
        expect(plan[7].anchor).toBe(true);
        expect(plan.slice(2, 6).some((t) => t.anchor)).toBe(true);
        for (let i = 1; i < plan.length; i += 1) {
          expect(plan[i].taskTypeId, `cap ${cap}, ${seed}, slot ${i}`).not.toBe(plan[i - 1].taskTypeId);
        }
      }
    }
  });

  it('applies the same relaxed anchor rule when the cap leaves only two task types', () => {
    // The 8-task bad-day session is even, so strict alternation puts different types
    // at the first and last slots. Win-backs here are all sound-hunt.
    const hunts = masteredPairs([['s', 'SOUND_ID'], ['a', 'SOUND_ID'], ['t', 'SOUND_ID']]);
    for (const seed of SEEDS) {
      const plan = build(hunts, seed, { maxDifficulty: 2, length: 8 });
      expect(plan[0].taskTypeId, seed).toBe('sound-hunt');
      const closing = plan[7];
      expect(closing.difficulty, seed).toBeLessThanOrEqual(2);
      expect(plan.slice(0, 7).some((t) => t.primaryTarget === closing.primaryTarget), seed).toBe(true);
    }
  });

  it('stays within the cap by not scheduling a skill whose every task type is above it', () => {
    for (const seed of SEEDS) {
      for (const task of build(mastery, seed, { maxDifficulty: 1 })) {
        expect(task.taskTypeId).toBe('sound-hunt');
        expect(task.skill).toBe('SOUND_ID');
      }
    }
  });

  it('terminates with a full-length plan when one task type is all that is allowed', () => {
    // With a single usable type, repeats are unavoidable: there is nothing to alternate with.
    // The builder must still finish and fill the session rather than throw mid-quest.
    for (const [name, state] of Object.entries(STATES)) {
      const plan = build(state, 'one-type', { maxDifficulty: 1 });
      expect(plan.length, name).toBe(DEFAULT_CONFIG.sessionLength);
      expect(plan[0].anchor, name).toBe(true);
      expect(plan[plan.length - 1].anchor, name).toBe(true);
    }
  });

  it('ignores win-backs of a skill the cap rules out, rather than finding it has nothing to open with', () => {
    // s and a are mastered only for singing (difficulty 2). Under a cap of 1 those are not
    // usable win-backs, so this child is treated as brand-new, not left with no anchors at all.
    const singing = masteredPairs([['s', 'LETTER_SOUND'], ['a', 'LETTER_SOUND']]);
    for (const seed of SEEDS) {
      const plan = build(singing, seed, { maxDifficulty: 1 });
      expect(plan.length, seed).toBe(DEFAULT_CONFIG.sessionLength);
      for (const task of plan) expect(task.taskTypeId, seed).toBe('sound-hunt');
    }
  });

  it('falls back to the easiest task type when the cap is below every difficulty', () => {
    const plan = build(mastery, 'zero-cap', { maxDifficulty: 0 });
    expect(plan.length).toBe(DEFAULT_CONFIG.sessionLength);
    expect(new Set(plan.map((t) => t.taskTypeId))).toEqual(new Set(['sound-hunt']));
  });
});

describe('buildSession for a child who has mastered everything', () => {
  /** Every Level 1 pairing mastered, by walking the plans a session would offer. */
  function everything(): MasteryMap {
    const ids = graphemesForLevel(1).map((g) => g.id);
    const words = ['at', 'am', 'if', 'it', 'pat', 'tap', 'pit', 'sit', 'sip', 'pip', 'fit', 'mat', 'map', 'fat', 'sat', 'tip', 'sap', 'sam', 'pam'];
    const pictured = ['pat', 'tap', 'pit', 'sit', 'sip', 'pip', 'fit', 'mat', 'map'];
    return masteredPairs([
      ...ids.flatMap((id): Pair[] => [[id, 'SOUND_ID'], [id, 'LETTER_SOUND']]),
      ...pictured.map((w): Pair => [w, 'BLEND_READ']),
      ...words.map((w): Pair => [w, 'SEGMENT_SPELL']),
    ]);
  }

  it('still builds a full, well-formed quest rather than crashing on an empty pool', () => {
    const mastery = everything();
    for (const seed of SEEDS) {
      const plan = build(mastery, seed);
      expect(plan.length, seed).toBe(DEFAULT_CONFIG.sessionLength);
      expect(plan[0].anchor).toBe(true);
      expect(plan[plan.length - 1].anchor).toBe(true);
      for (let i = 1; i < plan.length; i += 1) {
        expect(plan[i].taskTypeId, `${seed} slot ${i}`).not.toBe(plan[i - 1].taskTypeId);
      }
    }
  });

  it('still builds a full quest when it has mastered everything but is returning after a gap', () => {
    // Some time on, strength has slipped below the win-back bar but not the mastery bar:
    // everything is mastered and nothing qualifies as a win-back.
    const decayed = masteredPairs(
      Object.keys(everything()).map((key): Pair => {
        const [id, skill] = key.split('::');
        return [id, skill as Skill];
      }),
      { agoHours: MID_STRENGTH_AGO_HOURS },
    );
    for (const seed of SEEDS) {
      const plan = build(decayed, seed);
      expect(plan.some((t) => t.band === 'winback'), seed).toBe(false);
      expect(plan.length, seed).toBe(DEFAULT_CONFIG.sessionLength);
      expect(plan[0].anchor).toBe(true);
      expect(plan[plan.length - 1].anchor).toBe(true);
      for (let i = 1; i < plan.length; i += 1) expect(plan[i].taskTypeId, `${seed} slot ${i}`).not.toBe(plan[i - 1].taskTypeId);
    }
  });

  it('is built entirely from material the child has mastered', () => {
    const mastery = everything();
    for (const task of build(mastery)) {
      expect(isMastered(getRecord(mastery, task.primaryTarget, task.skill, DEFAULT_CONFIG), NOW, DEFAULT_CONFIG)).toBe(true);
    }
  });
});

describe('buildSession across a whole first week', () => {
  it('holds every invariant across lengths and seeds', () => {
    for (const [name, mastery] of Object.entries(STATES)) {
      for (const length of [8, 14]) {
        for (const seed of SEEDS.slice(0, 15)) {
          const plan = build(mastery, seed, { length });
          const label = `${name}, length ${length}, ${seed}`;
          expect(plan.length, label).toBe(length);
          expect(plan[0].anchor, label).toBe(true);
          expect(plan[length - 1].anchor, label).toBe(true);
          expect(plan.slice(Math.floor(length / 3), Math.ceil((2 * length) / 3)).some((t) => t.anchor), label).toBe(true);
          for (let i = 1; i < length; i += 1) {
            expect(plan[i].taskTypeId, `${label}, slot ${i}`).not.toBe(plan[i - 1].taskTypeId);
          }
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Spec invariant 5a: sounds before words. A word task (BLEND_READ or
// SEGMENT_SPELL) is eligible only once every grapheme in it has at least
// `wordReadinessCorrect` unscaffolded correct answers on SOUND_ID or LETTER_SOUND.
// ---------------------------------------------------------------------------

/** One attempt on a sound skill, in a single session, with the given flags. */
function soundAttempts(
  id: string,
  count: number,
  options: { skill?: Skill; scaffolded?: boolean; correct?: boolean; weight?: number } = {},
): MasteryMap {
  const skill = options.skill ?? 'SOUND_ID';
  let record = emptyRecord(id, skill, DEFAULT_CONFIG);
  for (let i = 0; i < count; i += 1) {
    record = applyAttempt(
      record,
      {
        sessionId: 'earlier', targetId: id, skill, taskTypeId: skill === 'SOUND_ID' ? 'sound-hunt' : 'sound-singer',
        correct: options.correct ?? true, scaffolded: options.scaffolded ?? false,
        latencyMs: 900, weight: options.weight ?? 1, at: NOW - HOUR,
      },
      DEFAULT_CONFIG,
    );
  }
  return { [masteryKey(id, skill)]: record };
}

/** `count` unscaffolded correct answers on each grapheme: known, but nowhere near mastered. */
function heard(counts: Record<string, number>): MasteryMap {
  return Object.assign({}, ...Object.entries(counts).map(([id, n]) => soundAttempts(id, n)));
}

const isWordTask = (t: TaskInstance) => t.skill === 'BLEND_READ' || t.skill === 'SEGMENT_SPELL';
const wordTasks = (plan: TaskInstance[]) => plan.filter(isWordTask);
const wordsAcross = (mastery: MasteryMap, extra: Partial<BuildSessionArgs> = {}) =>
  new Set(SEEDS.flatMap((seed) => wordTasks(build(mastery, seed, extra)).map((t) => t.primaryTarget)));

describe('buildSession: sounds before words (invariant 5a)', () => {
  it('asks a brand-new child no word task at all, across many seeds', () => {
    for (const seed of SEEDS) {
      const plan = build({}, seed);
      expect(wordTasks(plan).map((t) => t.id), seed).toEqual([]);
      for (const task of plan) expect(['SOUND_ID', 'LETTER_SOUND'], `${seed}: ${task.id}`).toContain(task.skill);
    }
  });

  it('gives a brand-new child a quest of sound tasks across all three graphemes of the first group', () => {
    const asked = new Set(SEEDS.flatMap((seed) => build({}, seed).map((t) => t.primaryTarget)));
    expect(asked).toEqual(new Set(['s', 'a', 't']));
  });

  it('still arranges a brand-new quest: two types alternating, open on the easiest, close on the second-easiest', () => {
    // With words excluded only sound-hunt and sound-singer remain, so the no-adjacent-repeat
    // rule forces strict alternation. This is the situation amended invariant 7 exists for.
    for (const seed of SEEDS) {
      const plan = build({}, seed);
      expect(plan.length, seed).toBe(DEFAULT_CONFIG.sessionLength);
      expect(new Set(plan.map((t) => t.taskTypeId)), seed).toEqual(new Set(['sound-hunt', 'sound-singer']));
      expect(plan[0].taskTypeId, seed).toBe('sound-hunt');
      expect(plan[plan.length - 1].taskTypeId, seed).toBe('sound-singer');
      expect(plan.filter((t) => t.anchor).length, seed).toBe(DEFAULT_CONFIG.winbackCount);
      for (let i = 1; i < plan.length; i += 1) {
        expect(plan[i].taskTypeId, `${seed} slot ${i}`).not.toBe(plan[i - 1].taskTypeId);
      }
      const closing = plan[plan.length - 1];
      expect(plan.slice(0, -1).some((t) => t.primaryTarget === closing.primaryTarget), seed).toBe(true);
    }
  });

  it('gives word tasks to a child with the required correct answers on each of s, a and t', () => {
    const mastery = heard({ s: 2, a: 2, t: 2 });
    for (const seed of SEEDS) {
      expect(wordTasks(build(mastery, seed)).length, seed).toBeGreaterThan(0);
    }
    // and only the words those three sounds make
    expect([...wordsAcross(mastery)].sort()).toEqual(['at', 'sat']);
  });

  it('gives no word task while a sound every available word needs is short of the threshold', () => {
    // at and sat both need a and t; sat also needs s. Short of either a or t: nothing.
    for (const mastery of [heard({ s: 2, a: 2, t: 1 }), heard({ s: 2, a: 1, t: 2 }), heard({ s: 2, a: 0, t: 2 })]) {
      for (const seed of SEEDS) expect(wordTasks(build(mastery, seed)).map((t) => t.id), seed).toEqual([]);
    }
  });

  it('with a and t known but not s, asks for at but never for sat: every grapheme must be known, not some', () => {
    const mastery = heard({ s: 1, a: 2, t: 2 });
    expect(wordsAcross(mastery)).toEqual(new Set(['at']));
  });

  it('with s and a known but not t, asks no word at all: at and sat both need t', () => {
    const mastery = heard({ s: 2, a: 2 });
    expect(wordsAcross(mastery)).toEqual(new Set());
  });

  it('asks only for words whose every grapheme is known, when some of a later group are', () => {
    // s, a, t are mastered, so focus is p and i. p has been answered twice; i not at all.
    // Of the words the child has met, pat, tap and sap need only s, a, t, p. Anything with i must wait.
    const mastery = { ...masteredGraphemes(['s', 'a', 't']), ...heard({ p: 2 }) };
    const words = wordsAcross(mastery);
    expect(words.size).toBeGreaterThan(0);
    for (const word of words) {
      for (const g of getWord(word).graphemes) expect(['s', 'a', 't', 'p'], `${word} needs ${g}`).toContain(g);
    }
    expect([...words].some((w) => getWord(w).graphemes.includes('p')), 'a word using the known p never came up').toBe(true);
    for (const waiting of ['pit', 'sip', 'pip', 'sit', 'tip']) expect(words).not.toContain(waiting);
  });

  it('does not offer a word as a wrong answer if it holds a sound the child is not ready for', () => {
    const mastery = { ...masteredGraphemes(['s', 'a', 't']), ...heard({ p: 2 }) };
    for (const seed of SEEDS) {
      for (const task of build(mastery, seed).filter((t) => t.skill === 'BLEND_READ')) {
        for (const choice of task.choices) {
          for (const g of getWord(choice).graphemes) expect(['s', 'a', 't', 'p'], `${seed}: ${choice}`).toContain(g);
        }
      }
    }
  });

  it('counts a LETTER_SOUND answer as readiness as well as a SOUND_ID one', () => {
    const mastery = {
      ...soundAttempts('s', 1), ...soundAttempts('s', 1, { skill: 'LETTER_SOUND' }),
      ...soundAttempts('a', 2, { skill: 'LETTER_SOUND' }),
      ...soundAttempts('t', 2),
    };
    expect(wordsAcross(mastery).size).toBeGreaterThan(0);
  });

  it('does not count answers the child was shown, however many', () => {
    const mastery = {
      ...soundAttempts('s', 9, { scaffolded: true }),
      ...soundAttempts('a', 9, { scaffolded: true }),
      ...soundAttempts('t', 9, { scaffolded: true }),
    };
    expect(wordsAcross(mastery)).toEqual(new Set());
  });

  it('does not let shown answers top up a child who is one honest answer short', () => {
    // One real correct answer on each sound, then five more that were shown: 1 + 5 must not reach 2.
    const mastery: MasteryMap = {};
    for (const id of ['s', 'a', 't']) {
      let record = soundAttempts(id, 1)[masteryKey(id, 'SOUND_ID')];
      for (let i = 0; i < 5; i += 1) {
        record = applyAttempt(
          record,
          { sessionId: 'earlier', targetId: id, skill: 'SOUND_ID', taskTypeId: 'sound-hunt', correct: true, scaffolded: true, latencyMs: 900, weight: 1, at: NOW - HOUR },
          DEFAULT_CONFIG,
        );
      }
      mastery[masteryKey(id, 'SOUND_ID')] = record;
    }
    expect(wordsAcross(mastery)).toEqual(new Set());
  });

  it('does not count wrong answers', () => {
    const mastery = {
      ...soundAttempts('s', 9, { correct: false }),
      ...soundAttempts('a', 9, { correct: false }),
      ...soundAttempts('t', 9, { correct: false }),
    };
    expect(wordsAcross(mastery)).toEqual(new Set());
  });

  it('does not count secondary credit or aided answers: only a direct, unaided answer shows the sound is known', () => {
    // Half-weight evidence is what a word task, or an answer given after the choices were narrowed, earns.
    const mastery = {
      ...soundAttempts('s', 9, { weight: 0.5 }),
      ...soundAttempts('a', 9, { weight: 0.5 }),
      ...soundAttempts('t', 9, { weight: 0.5 }),
    };
    expect(wordsAcross(mastery)).toEqual(new Set());
  });

  it('reads the threshold from config, not a literal', () => {
    const oneEach = heard({ s: 1, a: 1, t: 1 });
    const threeEach = heard({ s: 3, a: 3, t: 3 });
    // Default is 2: one each is not enough.
    expect(wordsAcross(oneEach)).toEqual(new Set());
    // Lower it and the same child is ready.
    expect(wordsAcross(oneEach, { config: { wordReadinessCorrect: 1 } }).size).toBeGreaterThan(0);
    // Raise it and a child with three each, who is ready by default, is not.
    expect(wordsAcross(threeEach).size).toBeGreaterThan(0);
    expect(wordsAcross(threeEach, { config: { wordReadinessCorrect: 4 } })).toEqual(new Set());
  });

  it('ships a threshold of two', () => {
    expect(DEFAULT_CONFIG.wordReadinessCorrect).toBe(2);
  });

  it('holds the other invariants for a child who is partly ready', () => {
    const mastery = heard({ s: 2, a: 2, t: 1 });
    for (const seed of SEEDS) {
      const plan = build(mastery, seed);
      expect(plan.length).toBe(DEFAULT_CONFIG.sessionLength);
      expect(plan[0].anchor && plan[plan.length - 1].anchor, seed).toBe(true);
      for (let i = 1; i < plan.length; i += 1) expect(plan[i].taskTypeId).not.toBe(plan[i - 1].taskTypeId);
    }
  });
});

// ---------------------------------------------------------------------------
// Plan 3 Task 3: Word Pick. Picture Match leaves the wrong answers to the
// closest-word ranking; Word Pick puts words sharing the first letter first,
// so a child cannot pass by matching the first letter and guessing.
// ---------------------------------------------------------------------------

describe('buildSession: Word Pick', () => {
  // p, i and m have been answered twice, so the picture words are ready (invariant 5a).
  const ready = { ...masteredGraphemes(['s', 'a', 't']), ...heard({ p: 2, i: 2, m: 2 }) };
  const wordPicks = (mastery: MasteryMap, extra: Partial<BuildSessionArgs> = {}) =>
    SEEDS.flatMap((seed) => build(mastery, seed, extra)).filter((t) => t.taskTypeId === 'word-pick');

  it('is scheduled once reading is possible', () => {
    expect(wordPicks(ready).length).toBeGreaterThan(0);
  });

  it('is a reading task: words in, a word out, graphemes credited like Picture Match', () => {
    for (const task of wordPicks(ready)) {
      expect(task.skill, task.id).toBe('BLEND_READ');
      expect(task.secondaryTargets, task.id).toEqual([...new Set(getWord(task.primaryTarget).graphemes)]);
      for (const choice of task.choices) expect(getWord(choice).picture, choice).toBeDefined();
    }
  });

  it('offers the word that shares the first letter: mat is always met by map', () => {
    const mats = wordPicks(ready).filter((t) => t.correctChoice === 'mat');
    expect(mats.length).toBeGreaterThan(0);
    for (const task of mats) expect(task.choices, task.id).toContain('map');
  });

  it('puts first-letter siblings ahead of closer words that start differently', () => {
    // pat is one grapheme from mat, but pit and pip start with p, so they must win.
    const pats = wordPicks(ready).filter((t) => t.correctChoice === 'pat' && t.choices.length === 3);
    expect(pats.length).toBeGreaterThan(0);
    for (const task of pats) {
      const wrong = task.choices.filter((c) => c !== 'pat');
      for (const id of wrong) expect(getWord(id).graphemes[0], `${task.id}: ${id}`).toBe('p');
    }
  });

  it('every wrong word shares the first letter whenever enough siblings exist', () => {
    for (const task of wordPicks(ready)) {
      const target = getWord(task.correctChoice);
      const wrong = task.choices.filter((c) => c !== task.correctChoice);
      const siblings = ['pat', 'pit', 'pip', 'mat', 'map', 'sit', 'sip', 'tap', 'fit']
        .filter((id) => id !== target.id && getWord(id).graphemes[0] === target.graphemes[0]);
      const expected = Math.min(wrong.length, siblings.length);
      const shared = wrong.filter((id) => getWord(id).graphemes[0] === target.graphemes[0]).length;
      expect(shared, task.id).toBeGreaterThanOrEqual(expected);
    }
  });

  it('leaves Picture Match alone: it does not insist on the first letter', () => {
    const matches = SEEDS.flatMap((seed) => build(ready, seed)).filter((t) => t.taskTypeId === 'picture-match');
    expect(matches.length).toBeGreaterThan(0);
    const mixed = matches.some((task) =>
      task.choices.some((c) => c !== task.correctChoice && getWord(c).graphemes[0] !== getWord(task.correctChoice).graphemes[0]),
    );
    expect(mixed).toBe(true);
  });

  it('still shows a mix-up the child has made, ahead of the first-letter rule', () => {
    const confusions = { 'mat>sip': 5 };
    const mats = SEEDS.flatMap((seed) => build(ready, seed, { confusions }))
      .filter((t) => t.taskTypeId === 'word-pick' && t.correctChoice === 'mat');
    expect(mats.length).toBeGreaterThan(0);
    for (const task of mats) expect(task.choices, task.id).toContain('sip');
  });

  it('keeps the invariants with it in the mix', () => {
    for (const seed of SEEDS) {
      const plan = build(ready, seed);
      expect(plan).toHaveLength(DEFAULT_CONFIG.sessionLength);
      for (let i = 1; i < plan.length; i += 1) expect(plan[i].taskTypeId, seed).not.toBe(plan[i - 1].taskTypeId);
    }
  });
});

// ---------------------------------------------------------------------------
// Plan 3 Task 4: Missing Letter. One position of a spelled word is blanked and
// the child picks the letter for it; the medial vowel is asked for most.
// ---------------------------------------------------------------------------

describe('buildSession: Missing Letter', () => {
  // s, a, t are mastered and p, i, m have been answered twice, so spelling is open.
  const ready = { ...masteredGraphemes(['s', 'a', 't']), ...heard({ p: 2, i: 2, m: 2 }) };
  const gaps = (mastery: MasteryMap = ready, extra: Partial<BuildSessionArgs> = {}) =>
    SEEDS.flatMap((seed) => build(mastery, seed, extra)).filter((t) => t.taskTypeId === 'missing-letter');

  it('is scheduled once spelling is possible', () => {
    expect(gaps().length).toBeGreaterThan(0);
  });

  it('is a spelling task whose answer is the word, like Word Builder', () => {
    for (const task of gaps()) {
      expect(task.skill, task.id).toBe('SEGMENT_SPELL');
      expect(task.correctChoice, task.id).toBe(task.primaryTarget);
      expect(getWord(task.primaryTarget), task.id).toBeDefined();
    }
  });

  it('records which position is blank, inside the word', () => {
    for (const task of gaps()) {
      const length = getWord(task.primaryTarget).graphemes.length;
      expect(Number.isInteger(task.blankIndex), task.id).toBe(true);
      expect(task.blankIndex as number, task.id).toBeGreaterThanOrEqual(0);
      expect(task.blankIndex as number, task.id).toBeLessThan(length);
    }
  });

  it('offers the letter that belongs in the gap, once, among the choices', () => {
    for (const task of gaps()) {
      const letter = getWord(task.primaryTarget).graphemes[task.blankIndex as number];
      expect(task.choices.filter((c) => c === letter), task.id).toHaveLength(1);
      expect(new Set(task.choices).size, task.id).toBe(task.choices.length);
    }
  });

  it('offers between two and four letters', () => {
    for (const task of gaps()) {
      expect(task.choices.length, task.id).toBeGreaterThanOrEqual(2);
      expect(task.choices.length, task.id).toBeLessThanOrEqual(4);
    }
  });

  it('offers only letters the child has met', () => {
    // s, a and t are mastered, so every level-1 letter has been met (see the introduction groups).
    const met = ['s', 'a', 't', 'p', 'i', 'm', 'f'];
    for (const task of gaps()) for (const choice of task.choices) expect(met, `${task.id}: ${choice}`).toContain(choice);
  });

  it('asks for the medial vowel more often than either consonant', () => {
    const tasks = gaps().filter((t) => getWord(t.primaryTarget).graphemes.length === 3);
    expect(tasks.length).toBeGreaterThan(20);
    const middle = tasks.filter((t) => t.blankIndex === 1).length;
    expect(middle / tasks.length).toBeGreaterThan(0.5);
    // And it is a vowel: every Level 1 CVC word has its vowel in the middle.
    for (const t of tasks.filter((x) => x.blankIndex === 1)) {
      expect(['a', 'i'], t.id).toContain(getWord(t.primaryTarget).graphemes[1]);
    }
  });

  it('does not always blank the middle', () => {
    const positions = new Set(gaps().filter((t) => getWord(t.primaryTarget).graphemes.length === 3).map((t) => t.blankIndex));
    expect(positions.has(0) && positions.has(1) && positions.has(2)).toBe(true);
  });

  it('is deterministic: the same session asks about the same gap', () => {
    const a = build(ready, 'seed-3').filter((t) => t.taskTypeId === 'missing-letter');
    const b = build(ready, 'seed-3').filter((t) => t.taskTypeId === 'missing-letter');
    expect(a.map((t) => [t.id, t.blankIndex])).toEqual(b.map((t) => [t.id, t.blankIndex]));
  });

  it('offers a letter the child keeps confusing with the one in the gap', () => {
    // m and a are in 'mat'. The child has mixed up a with p, which is not on a's generic list.
    const confusions = { 'a>p': 5 };
    const asked = SEEDS.flatMap((seed) => build(ready, seed, { confusions }))
      .filter((t) => t.taskTypeId === 'missing-letter' && getWord(t.primaryTarget).graphemes[t.blankIndex as number] === 'a');
    expect(asked.length).toBeGreaterThan(0);
    for (const task of asked) expect(task.choices, task.id).toContain('p');
  });

  it('never sets a blank position on any other task type', () => {
    for (const seed of SEEDS) {
      for (const task of build(ready, seed)) {
        if (task.taskTypeId !== 'missing-letter') expect(task.blankIndex, task.id).toBeUndefined();
      }
    }
  });

  it('keeps the invariants with it in the mix', () => {
    for (const seed of SEEDS) {
      const plan = build(ready, seed);
      expect(plan).toHaveLength(DEFAULT_CONFIG.sessionLength);
      for (let i = 1; i < plan.length; i += 1) expect(plan[i].taskTypeId, seed).not.toBe(plan[i - 1].taskTypeId);
    }
  });
});
