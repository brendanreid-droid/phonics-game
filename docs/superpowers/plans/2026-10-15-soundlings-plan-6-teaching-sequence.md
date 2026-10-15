# Teaching Sequence Rebuild — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the game teach phonics in the order phonics is taught — oral blending, then explicit instruction, then letter-sound, then reading, then spelling — instead of in the order the available artwork allowed.

**Architecture:** Two new mini-games (Robot Talk, Sound It Out), one non-scored teaching card (Meet the Sound), four new session-builder invariants, and difficulty re-rated per task *and* word pattern. The engine stays pure; everything new is data and pure functions plus React components.

**Tech Stack:** TypeScript, Vitest, Expo / expo-router, existing `@soundlings/curriculum` · `engine` · `ui` · `audio` packages.

---

## Why this plan exists

A trace of the first ten quests, for a child who answers everything correctly, produced this as quest 2:

```
 4. missing-letter  SEGMENT_SPELL  at
 6. word-builder    SEGMENT_SPELL  sat
```

The first reading task appears in **quest 4**. The child spells words two days before being asked to read one.

Nobody chose that. After quest 1 the child knows `s a t`, which decodes only `at` and `sat`; neither has a picture; both reading games require one. Reading had zero eligible tasks and spelling had two, so **a gap in the artwork set the teaching order**. Every one of 1,787 tests passed throughout.

Read spec §4.2 (`ORAL_BLEND`), §4.3 (difficulty), §5.4 invariants 5b–5e, §7.3 (Meet the Sound) and §11.0 before starting.

---

## File structure

| File | Responsibility |
|---|---|
| `packages/curriculum/src/types.ts` | Add `ORAL_BLEND` to `SKILLS`. |
| `packages/curriculum/src/words.ts` | Add `pattern`-derived helpers; no new words. |
| `packages/engine/src/difficulty.ts` | **New.** `difficultyFor(taskTypeId, targetId)`. Pure. |
| `packages/engine/src/taskTypes.ts` | Register Robot Talk and Sound It Out; base rungs only. |
| `packages/engine/src/readiness.ts` | **New.** Invariants 5b and 5c as pure predicates. |
| `packages/engine/src/sessionBuilder.ts` | Apply 5b–5e; grow focus through the lesson; emit Meet cards. |
| `packages/engine/src/config.ts` | `introPracticeCount`, `oralBlendRequired`, re-based `cappedDifficulty`. |
| `packages/engine/src/types.ts` | `TaskInstance.kind: 'task' \| 'meet'`. |
| `packages/engine/src/trace.test.ts` | **New.** Prints the first ten quests; asserts teaching order. |
| `apps/game/src/tasks/RobotTalk.tsx` | Oral blending. No letters. |
| `apps/game/src/tasks/SoundItOut.tsx` | Tap each letter in order, push together, pick the spoken word. |
| `apps/game/src/tasks/soundItOutLogic.ts` | Tap-order and completion rules. Pure, tested apart from React. |
| `apps/game/src/quest/MeetTheSound.tsx` | The teaching card. |

---

## Task 1: The trace, first — so the order is visible before anything moves

**Files:**
- Create: `packages/engine/src/trace.test.ts`

Nothing else in this plan can be judged without this. Build it first, let it print today's wrong order, and keep it as the thing that proves the order changed.

- [ ] **Step 1: Write the trace**

```ts
import { describe, expect, it } from 'vitest';
import { buildSession } from './sessionBuilder';
import { recordTaskResult } from './taskOutcome';
import { DEFAULT_CONFIG } from './config';
import type { MasteryMap } from './types';

/**
 * Prints the first ten quests a flawless child is actually asked, and asserts
 * the teaching order holds across them.
 *
 * This exists because the sequence was wrong for weeks while every test passed.
 * Each unit test was checking a rule; none was looking at the shape of the
 * lesson. See spec §11.0.
 */
function traceQuests(count: number) {
  let mastery: MasteryMap = {};
  let now = Date.UTC(2026, 0, 1, 9, 0, 0);
  const quests: { quest: number; tasks: ReturnType<typeof buildSession> }[] = [];

  for (let q = 1; q <= count; q++) {
    const tasks = buildSession({ sessionId: `q${q}`, level: 1, mastery, confusions: {}, now });
    quests.push({ quest: q, tasks });
    for (const t of tasks) {
      if (t.kind === 'meet') continue;
      mastery = recordTaskResult(
        mastery,
        t,
        { sessionId: `q${q}`, correct: true, scaffolded: false, latencyMs: 2000, at: now },
        DEFAULT_CONFIG,
      );
    }
    now += 24 * 3600_000;
  }
  return quests;
}

function render(quests: ReturnType<typeof traceQuests>): string {
  return quests
    .map(({ quest, tasks }) =>
      [
        `=== QUEST ${quest} ===`,
        ...tasks.map((t, i) =>
          `${String(i + 1).padStart(2)}. ${t.taskTypeId.padEnd(14)} ${t.skill.padEnd(14)} ` +
          `${String(t.primaryTarget).padEnd(10)} ${t.band}${t.anchor ? ' ANCHOR' : ''}`,
        ),
      ].join('\n'),
    )
    .join('\n\n');
}
```

- [ ] **Step 2: Assert the teaching order**

Four assertions, each a sentence a teacher would recognise. **Write them now and expect three to fail** — that failure is the bug, stated as a test.

```ts
describe('the order a child is actually taught in', () => {
  const quests = traceQuests(10);
  const flat = quests.flatMap(({ quest, tasks }) => tasks.map((t) => ({ quest, ...t })));

  it('prints the trace', () => {
    console.log(render(quests));
  });

  it('asks a child to read a word before it asks them to spell one', () => {
    const firstRead = flat.findIndex((t) => t.skill === 'BLEND_READ');
    const firstSpell = flat.findIndex((t) => t.skill === 'SEGMENT_SPELL');
    expect(firstRead).toBeGreaterThanOrEqual(0);
    expect(firstRead).toBeLessThan(firstSpell);
  });

  it('never asks for a word to be spelt before that same word has been read', () => {
    const read = new Set<string>();
    for (const t of flat) {
      if (t.skill === 'SEGMENT_SPELL') expect(read.has(String(t.primaryTarget))).toBe(true);
      if (t.skill === 'BLEND_READ') read.add(String(t.primaryTarget));
    }
  });

  it('blends two sounds before three, on each skill', () => {
    for (const skill of ['BLEND_READ', 'SEGMENT_SPELL'] as const) {
      const words = flat.filter((t) => t.skill === skill).map((t) => getWord(t.primaryTarget));
      const firstThree = words.findIndex((w) => w.graphemes.length === 3);
      const firstTwo = words.findIndex((w) => w.graphemes.length === 2);
      if (firstThree >= 0) expect(firstTwo).toBeGreaterThanOrEqual(0);
      if (firstThree >= 0) expect(firstTwo).toBeLessThan(firstThree);
    }
  });

  it('teaches every sound before testing it', () => {
    for (const { tasks } of quests) {
      const met = new Set<string>();
      for (const t of tasks) {
        if (t.kind === 'meet') { met.add(String(t.primaryTarget)); continue; }
        if (t.skill === 'SOUND_ID' || t.skill === 'LETTER_SOUND') {
          // Only a grapheme being introduced in this quest needs a Meet card here.
          if (t.band === 'focus' && t.firstEverAppearance) expect(met.has(String(t.primaryTarget))).toBe(true);
        }
      }
    }
  });
});
```

- [ ] **Step 3: Run it. Record what fails.**

```bash
npx vitest run packages/engine/src/trace.test.ts
```

Expected: the trace prints; "read before spell" and "never spell before read" **fail**; "two before three" fails. Paste the printed trace into the commit message — it is the evidence this plan was needed.

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/trace.test.ts
git commit -m "test(engine): print the first ten quests and assert the teaching order"
```

---

## Task 2: Difficulty becomes a property of the task and the word

**Files:**
- Create: `packages/engine/src/difficulty.ts`, `packages/engine/src/difficulty.test.ts`
- Modify: `packages/engine/src/taskTypes.ts`, `packages/engine/src/config.ts`

A single number per mini-game rated spelling (`missing-letter`, 3) exactly as hard as reading (`word-pick`, 3). That rating is *why* an inverted order survived review: nothing in the engine believed reading came first.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { difficultyFor } from './difficulty';

describe('difficultyFor', () => {
  it('rates reading below spelling for the same word', () => {
    expect(difficultyFor('word-pick', 'sat')).toBeLessThan(difficultyFor('missing-letter', 'sat'));
    expect(difficultyFor('sound-it-out', 'sat')).toBeLessThan(difficultyFor('word-builder', 'sat'));
  });

  it('rates two sounds below three, for the same game', () => {
    expect(difficultyFor('sound-it-out', 'at')).toBeLessThan(difficultyFor('sound-it-out', 'sat'));
    expect(difficultyFor('word-builder', 'at')).toBeLessThan(difficultyFor('word-builder', 'sat'));
  });

  it('rates the scaffolded blend below the unscaffolded one', () => {
    // Sound It Out hands the child the sounds; Word Pick does not.
    expect(difficultyFor('sound-it-out', 'sat')).toBeLessThan(difficultyFor('word-pick', 'sat'));
  });

  it('puts oral blending at the bottom of the ladder', () => {
    expect(difficultyFor('robot-talk', 'map')).toBeLessThan(difficultyFor('sound-it-out', 'at'));
  });

  it('is defined for every registered task type', () => {
    for (const type of TASK_TYPES) {
      const target = type.skill === 'SOUND_ID' || type.skill === 'LETTER_SOUND' ? 's' : 'sat';
      expect(Number.isFinite(difficultyFor(type.id, target))).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Implement**

```ts
/**
 * How hard this mini-game is on this particular target.
 *
 * Difficulty was one number per mini-game, and that is how an inverted teaching
 * order survived review: `missing-letter` (spelling) and `word-pick` (reading)
 * were both 3, so nothing in the engine believed reading came first, and
 * nothing objected when it did not.
 *
 * Two claims are encoded here. Reading is easier than spelling: blending is
 * receptive and every piece of the answer is on screen, while segmenting is
 * productive and the child must hold the word, pull it apart, and retrieve
 * letter shapes from nothing. And two sounds are easier than three: a VC word
 * is one blend, a CVC word is two.
 */
export function difficultyFor(taskTypeId: string, targetId: TargetId): number;
```

Base rungs from spec §4.3's table. A word target adds `graphemes.length - 2` to the base. Graphemes have no pattern bonus.

- [ ] **Step 3: Re-base `cappedDifficulty`**

It is `2` against the old 1–4 scale. The new scale runs 1–7. Set it so the frustration guard still leaves a struggling child at least **three** usable task types across at least two skills — assert that in `config.test.ts` rather than picking a number and hoping:

```ts
it('leaves a struggling child enough variety to avoid a quest of one game', () => {
  const usable = TASK_TYPES.filter((t) => baseDifficulty(t.id) <= DEFAULT_CONFIG.cappedDifficulty);
  expect(usable.length).toBeGreaterThanOrEqual(3);
  expect(new Set(usable.map((t) => t.skill)).size).toBeGreaterThanOrEqual(2);
});
```

- [ ] **Step 4: Point the frustration guard and session builder at `difficultyFor`**

Search for every read of `TaskTypeMeta.difficulty` and replace it. Leave the field only as the base rung, renamed `baseDifficulty`, so a stale read fails to compile rather than silently using the old number.

- [ ] **Step 5: Run and commit**

```bash
npm test
git commit -m "feat(engine): rate difficulty by task and word, not task alone"
```

---

## Task 3: `ORAL_BLEND` and Robot Talk

**Files:**
- Modify: `packages/curriculum/src/types.ts` (`SKILLS`)
- Modify: `packages/engine/src/taskTypes.ts`
- Create: `apps/game/src/tasks/RobotTalk.tsx`, `RobotTalk.test.tsx`
- Modify: `apps/game/src/tasks/registry.ts`

Phonemic awareness with no print. It is the strongest predictor of later reading and the game has none.

- [ ] **Step 1: Add the skill**

`ORAL_BLEND` goes **first** in `SKILLS`, before `SOUND_ID`. The purity tests and any exhaustive `switch` will tell you everywhere that needs a case; add them all rather than a `default`.

- [ ] **Step 2: Register the task type**

```ts
{
  id: 'robot-talk',
  skill: 'ORAL_BLEND',
  baseDifficulty: 1,
  minChoices: 2,
  maxChoices: 3,
  secondaryTargets: 'none',
  // Pictures are the only possible answer when no letter may appear, so this
  // needs a picturable word. Unlike the reading games, that is a real
  // constraint rather than an artwork gap: the child has nothing to read.
  canServeTarget: (id) => getWord(id).picture !== undefined,
}
```

`secondaryTargets: 'none'` is deliberate. Blending `/m/-/a/-/p/` aloud is **not** evidence the child knows the letter `m`. Granting grapheme credit here would let a child master letters they have never seen.

- [ ] **Step 3: Write the component test first**

```tsx
it('shows no letters anywhere', () => {
  const { queryByText } = render(<RobotTalk task={task} ... />);
  for (const letter of ['s', 'a', 't', 'm', 'p', 'i', 'f']) {
    expect(queryByText(letter)).toBeNull();
  }
});

it('says the word sound by sound on arrival, never as a whole word', () => {
  expect(audio.spoken).toEqual(['ui.robot_listen', 'ph.m', 'ph.a', 'ph.p']);
  expect(audio.spoken).not.toContain('wd.map');
});

it('says the whole word only after a correct answer', () => { ... });
```

The second test is the one that matters. Speaking the word turns the task into picture vocabulary, which is exactly the failure mode Picture Match already documents.

- [ ] **Step 4: Build the component**

Creature says the word in robot talk — each phoneme with a gap. Child taps one of 2–3 pictures. Hint tiers: 1 replays with the same gaps; 2 replays with the gaps **shortened**, which is the actual teaching move a teacher makes; 3 (errors only) shimmers the right picture.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(game): add oral blending with no letters on screen"
```

---

## Task 4: Sound It Out — the game that teaches blending

**Files:**
- Create: `apps/game/src/tasks/soundItOutLogic.ts`, `soundItOutLogic.test.ts`
- Create: `apps/game/src/tasks/SoundItOut.tsx`, `SoundItOut.test.tsx`
- Modify: `packages/engine/src/taskTypes.ts`, `apps/game/src/tasks/registry.ts`

The centre of this plan. Every other reading game is a matching game on which blending is one available strategy; sounding out existed only as a tier-2 hint, so a child who never struggled was never shown the skill the method rests on.

- [ ] **Step 1: Write the logic tests first — the rules live apart from React**

```ts
describe('soundItOut', () => {
  it('plays a letter sound when tapped in order', () => {
    const s0 = start(['s', 'a', 't']);
    expect(tap(s0, 0).play).toBe('ph.s');
  });

  it('does nothing when tapped out of order', () => {
    // Gently: left to right IS the lesson. An out-of-order tap must not
    // scold, but it must not reward either.
    const s0 = start(['s', 'a', 't']);
    expect(tap(s0, 2).play).toBeNull();
    expect(tap(s0, 2).sounded).toEqual([]);
  });

  it('allows re-tapping a letter already sounded', () => { ... });

  it('offers the push-together only once every letter has been sounded', () => {
    let s = start(['s', 'a', 't']);
    expect(canPushTogether(s)).toBe(false);
    s = tap(s, 0).state; s = tap(s, 1).state;
    expect(canPushTogether(s)).toBe(false);
    s = tap(s, 2).state;
    expect(canPushTogether(s)).toBe(true);
  });

  it('never speaks the whole word before the child has answered', () => { ... });
});
```

- [ ] **Step 2: Implement the logic, run, confirm green**

- [ ] **Step 3: Register the task type**

```ts
{
  id: 'sound-it-out',
  skill: 'BLEND_READ',
  baseDifficulty: 3,
  minChoices: 2,
  maxChoices: 3,
  secondaryTargets: 'graphemes',
  // No canServeTarget: the choices are SPOKEN, not pictured. This is the point
  // of the game — `at` and `sat` are readable on the day they are decodable,
  // instead of waiting for artwork that does not exist. See spec §5.4 5b.
}
```

- [ ] **Step 4: Build the component**

Letters spaced apart in Andika. Tap left to right; each plays its phoneme and stays lit. Once all are lit, a push-together control slides them into the whole word and plays 2–3 **spoken** candidate buttons. The child picks the one the letters say.

Candidates are near neighbours — `sat` against `sit` and `sap` — so a child who blends only the first sound cannot win. Reuse `pickWordDistractors`.

- [ ] **Step 5: Component tests**

```tsx
it('never speaks the target word before the child answers', () => { ... });
it('lights letters only in order', () => { ... });
it('offers the push-together only after every letter is sounded', () => { ... });
```

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(game): teach blending as a mechanic rather than as a hint"
```

---

## Task 5: Meet the Sound

**Files:**
- Modify: `packages/engine/src/types.ts` (`TaskInstance.kind`)
- Create: `apps/game/src/quest/MeetTheSound.tsx`, `MeetTheSound.test.tsx`
- Modify: `apps/game/app/quest.tsx`
- Modify: `apps/game/src/tasks/SoundHunt.tsx`, `SoundSinger.tsx`

A child currently meets `s` for the first time *as a quiz*, and the mnemonic (`tier >= 2`) is the consolation prize for failing it.

- [ ] **Step 1: Add `kind` to `TaskInstance`**

```ts
/**
 * 'meet' is a teaching card, not a task: no choices, no right answer, no
 * attempt recorded. It cannot be gamed and cannot pollute the mastery data.
 */
kind: 'task' | 'meet';
```

Make it required, not optional. Every construction site should have to say which it is.

- [ ] **Step 2: Assert a Meet card produces no attempt**

```ts
it('records nothing for a teaching card', () => {
  expect(() => attemptsForTask(meetCard, outcome, DEFAULT_CONFIG)).toThrow();
});
```

Throwing beats returning `[]`: a caller that tries to score a teaching card has a bug, and silence would hide it.

- [ ] **Step 3: Build the card**

Letter large in Andika. Creature says the sound three times with a beat between. Mnemonic emoji and word present **from the start**. A tap-to-hear-again that costs nothing. One "Got it" control. No score, no wrong answer.

Not skippable the first time it is shown for a grapheme; skippable on every later showing.

- [ ] **Step 4: Stop treating teaching as a hint**

In `SoundHunt` and `SoundSinger`, the tier-2 mnemonic stays — a reminder after a wrong answer is right — but it is no longer the child's **first** sight of it. Add a test asserting the grapheme's mnemonic was shown by a Meet card earlier in the same quest.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(game): teach each sound before testing it"
```

---

## Task 6: The gates — invariants 5b, 5c, 5d, 5e

**Files:**
- Create: `packages/engine/src/readiness.ts`, `readiness.test.ts`
- Modify: `packages/engine/src/sessionBuilder.ts`, `sessionBuilder.test.ts`, `config.ts`

- [ ] **Step 1: Write 5b and 5c as pure predicates, tested alone**

```ts
/** Invariant 5b: a word may not be spelt until it has been read. */
export function readyToSpell(wordId: WordId, mastery: MasteryMap, config: EngineConfig): boolean;

/** Invariant 5c: three sounds only after two have been done on this skill. */
export function readyForThreeSounds(skill: Skill, mastery: MasteryMap, config: EngineConfig): boolean;
```

Tests:
- A word read once, unaided and correctly, becomes spellable; **a scaffolded read does not** — a shown answer proves nothing, exactly as everywhere else in this engine.
- Reading `sat` does not make `map` spellable. Per word, not per skill.
- A wrong read does not unlock spelling.
- `readyForThreeSounds` is per skill: reading three sounds does not unlock spelling three sounds.

- [ ] **Step 2: Add config**

```ts
/** Tasks on a newly-introduced grapheme before a second one joins the focus. */
introPracticeCount: 4,
/** Words that must be blended orally for Level 1 (spec §5.7). */
oralBlendRequired: 4,
```

- [ ] **Step 3: Grow the focus through the lesson (5e)**

A quest is planned as segments, not a shuffle: segment A opens with one new grapheme's Meet card and `introPracticeCount` tasks on it alone; segment B meets the next and mixes the two; the close reviews both. Planned up front, so `buildSession` stays pure and a resumed quest is identical.

Focus must never span a partial introduction group. `currentFocusGraphemes` slices the flat list by `focusTargetCount` and ignores group boundaries — that is why quest 3 opened `p i m f`. Clamp to the group.

- [ ] **Step 4: Prove the old invariants still hold**

1–7 all still apply and some now conflict more tightly — 5e's "practise alone" pushes against 3's "no two adjacent tasks share a type". **If they are unsatisfiable, say so and weaken one deliberately, in the spec, with the reasoning** — as was done for invariant 7. Do not quietly relax a test.

A brute-force search over arrangements, as used for invariant 7, is the way to find out rather than guess.

- [ ] **Step 5: Run the trace from Task 1**

It should now pass all four order assertions. Paste the new trace into the commit message beside the old one.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(engine): read before spell, two sounds before three, teach before test"
```

---

## Task 7: Re-measure pacing. Do not estimate it.

**Files:**
- Modify: `packages/engine/src/simulate.ts`, `simulate.test.ts`
- Modify: `docs/superpowers/specs/...§5.7.1`, `README.md`

This spec has twice published hand-derived pacing figures that were wrong. Both were optimistic. Do not make it three.

- [ ] **Step 1: Teach the simulated child the new stages**

`simulateChild` must handle `ORAL_BLEND`, `sound-it-out` and Meet cards (which consume a slot and produce no attempt).

- [ ] **Step 2: Run the harness, 30 seeds per profile**

```bash
npx vitest run packages/engine/src/simulate.test.ts
```

- [ ] **Step 3: Write down what it says**

Update §5.7.1 and the README table with the measured figures and the config that produced them. **Quest counts will rise. Record the rise and say why it is correct** — the old counts were bought by skipping the teaching. Do not tune the config to recover the old numbers; that would be re-introducing the bug to protect a published figure.

If a profile now fails to complete Level 1 at all, that is a finding, not a failure to hide. Report it.

- [ ] **Step 4: Consider a shorter first quest**

Four of quest 1's slots are now teaching. A 14-task first session may be long for a five-year-old who should finish wanting more. Measure, then decide; if you shorten it, it is `config.firstSessionLength`, not a magic number in the builder.

- [ ] **Step 5: Commit**

```bash
git commit -m "docs: re-measure pacing after the teaching sequence rebuild"
```

---

## Task 8: Review gate 6

**Files:**
- Modify: `docs/REVIEW-GATE.md`, `README.md`

- [ ] **Step 1: Play it, as a child would, start to finish**

Not a screenshot. Quest 1 end to end, then quest 2, on the web build. Write down what you actually saw at each step, including anything that felt wrong but passed.

Specifically check: does quest 1 feel like a lesson or a shuffle? Does Sound It Out teach blending, or does it just look like it? Is the Meet card dull enough to skip but useful enough to keep?

- [ ] **Step 2: Update the docs**

Keep every existing caveat. **"No child has played it" remains true**, and remains the most important sentence in the README.

Add the new mini-games to the README's table. Mark the pacing figures as re-measured, with the date.

- [ ] **Step 3: Run everything**

```bash
npm test
npm run typecheck
./scripts/check-no-secrets.sh
git commit -m "docs: update the review gate for the teaching sequence rebuild"
```

---

## Out of scope

Levels 2–6 · real voice · illustrated artwork replacing emoji · `SAY_IT` voice tasks · first-sound isolation with no letter present (Picture Start covers it *with* support, which is defensible; without is a separate game and a separate argument) · tricky words · the win-back pacing lever.

## Self-review notes

**Spec coverage:** §4.2's `ORAL_BLEND` (Task 3) · §4.3's per-target difficulty (Task 2) · §5.4's 5b and 5c (Task 6) · 5d (Tasks 5, 6) · 5e (Task 6) · §5.7's oral quota (Task 6 config, Task 7 measurement) · §6.1's two new games (Tasks 3, 4) · §7.3's Meet card (Task 5) · §11.0's trace (Task 1).

**The risk this plan carries.** Invariant 5e ("practise one sound alone") and invariant 3 ("no two adjacent tasks share a type") pull against each other, and invariants 3 and 7 were already found mutually unsatisfiable once, by brute force, after both had been written confidently into a spec. Task 6 Step 4 exists because that will probably happen again. The honest move when it does is to weaken one **in the spec, with the reasoning written down** — not to quietly relax a test until it goes green.

**The thing most likely to be got wrong.** Sound It Out can be built so that it *looks* like blending while still being a matching game — if the candidate words are far apart, a child wins on the first sound alone and the tapping is decoration. The distractors are the game. Near neighbours (`sat` / `sit` / `sap`), every time.
