# Soundlings Plan 3: More Ways to Prove It — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give three of the four skills a second mini-game, so the promise that a child cannot master a sound by learning one game's pattern becomes true rather than nominal.

**Architecture:** Three new task types in the existing registry, plus one engine change making the mastery bar per-sound rather than per-skill. No new screens, no new storage, no backend.

**Tech Stack:** Unchanged.

**Spec:** `docs/superpowers/specs/2026-10-10-soundlings-phonics-game-design.md` §5.3

---

## Why this, and why now

Spec §5.3 requires mastery to be proven across two different task types, so a child cannot pass by memorising one game's answer pattern. Today only **one** game can prove `LETTER_SOUND`, `BLEND_READ` or `SEGMENT_SPELL`, so the condition is capped to 1 for those and the guarantee is **vacuous**. The spec says so in writing and calls this the honest interim.

A second game per skill:

1. Makes the anti-memorisation guarantee real for three of four skills.
2. Removes the day-one task-type scarcity that forced Level 1's regrouping and made invariant 7 unsatisfiable in its original form.
3. Adds variety, which is the thing we claim over a competitor whose 40 fixed games are a grind.

## What is being built

| New game | Skill | Pairs with | What the child does |
|---|---|---|---|
| **Word Pick** | `BLEND_READ` | Picture Match | Sees a **picture**, taps the matching **written word** from three |
| **Missing Letter** | `SEGMENT_SPELL` | Word Builder | Hears "mat", sees `m _ t`, taps the missing letter |
| **Picture Start** | `LETTER_SOUND` | Sound Singer | Sees the letter `m`, taps which of three **pictures starts with that sound** |

### The design reasoning, which is the part not to lose

**Word Pick runs the opposite direction to Picture Match**, and that is the whole point. Its distractors can share a first letter — `mat` against `map` against `man` — so a child cannot succeed by matching the initial letter and guessing, which is the commonest beginner shortcut and one Picture Match does not punish.

**Missing Letter isolates one position**, and should favour the **medial vowel**. The middle of a CVC word is the hardest slot for a beginner, and Word Builder lets them reach it by elimination: place the two consonants they are sure of and the vowel falls into the last gap without ever being chosen. Missing Letter removes that escape.

**Picture Start must never use the grapheme's own mnemonic as the answer.** `m`'s mnemonic is the moon, so the answer is a mat or a map. If the moon were the answer, a child could respond from the memorised letter-picture pairing taught alongside the sound — which is precisely the memorisation this whole plan exists to rule out. A second game that can be passed by the same memorised association is not a second proof; it is decoration.

### The vowel gap, stated rather than hidden

Picture Start can only be built for graphemes that have a picturable word beginning with that sound. From the Level 1 data:

| Grapheme | Picturable words starting with it | Picture Start possible? |
|---|---|---|
| `s` | sip 🥤, sit 🪑 | yes |
| `p` | pat 🐶, pip 🌰, pit 🕳️ | yes |
| `m` | map 🗺️, mat 🧘 | yes |
| `t` | tap 🚰 | yes |
| `f` | fit 💪 | yes |
| `a` | — | **no** |
| `i` | — | **no** |

The two vowels have no picturable word starting with them: `at`, `am`, `if` and `it` are function words that cannot be drawn. So `a` and `i` keep a single proving game for `LETTER_SOUND`, and the guarantee stays vacuous for exactly the two sounds that are hardest in phonics.

That is not fixed here, and pretending otherwise would be worse than saying it. The real answer is `SAY_IT` — a child saying the sound aloud — which is a different plan. What this plan does instead is make the engine **honest about it**, by counting proving games per sound rather than per skill.

---

## The engine change: proving games are counted per sound

`provingTaskTypeCount(skill)` currently answers "how many task types can prove this skill?". After this plan that is the wrong question, because `m` can be proved two ways for `LETTER_SOUND` and `a` only one.

It becomes `provingTaskTypeCount(skill, targetId)`: **how many task types can prove this particular sound or word?** A task type counts only if it could actually be scheduled for that target.

Consequences, all intended:
- `m`/`LETTER_SOUND` requires evidence from 2 games. `a`/`LETTER_SOUND` requires 1, because 1 is all that exists.
- No deadlock is possible, because the cap can never exceed what is schedulable.
- When `SAY_IT` ships, the vowels lift to 2 automatically with no further change.

---

## File structure

### `packages/curriculum`
| File | Change |
|---|---|
| `src/lookups.ts` | Add `picturableWordsStartingWith(graphemeId, level)` |

### `packages/engine`
| File | Change |
|---|---|
| `src/taskTypes.ts` | Three new entries; `provingTaskTypeCount` becomes per-target |
| `src/mastery.ts` | `isMastered` passes the target to `provingTaskTypeCount` |
| `src/sessionBuilder.ts` | Eligibility rules for the three new types |

### `apps/game/src/tasks`
| File | Responsibility |
|---|---|
| `WordPick.tsx` | Picture shown, three written words |
| `MissingLetter.tsx` | Word heard, one gap to fill |
| `missingLetterLogic.ts` | Pure: which position to blank, and judging |
| `PictureStart.tsx` | Letter shown, three pictures |
| `pictureStartLogic.ts` | Pure: choosing answer and distractors, excluding the mnemonic |
| `registry.ts` | Register all three |

---

## Task 1: Curriculum lookup for initial-sound words

**Files:**
- Modify: `packages/curriculum/src/lookups.ts`
- Test: `packages/curriculum/src/lookups.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `lookups.test.ts`:

```ts
describe('picturableWordsStartingWith', () => {
  it('finds the picturable words beginning with a sound', () => {
    const ids = picturableWordsStartingWith('m', 1).map((w) => w.id);
    expect(ids.sort()).toEqual(['map', 'mat']);
  });

  it('returns nothing for a vowel with no picturable word', () => {
    // `at`, `am`, `if` and `it` exist but are function words with no picture.
    // This is why Picture Start cannot be built for the vowels — see the plan.
    expect(picturableWordsStartingWith('a', 1)).toEqual([]);
    expect(picturableWordsStartingWith('i', 1)).toEqual([]);
  });

  it('only returns words whose FIRST grapheme is the one asked for', () => {
    // `map` starts with m; `sam` merely contains it.
    const ids = picturableWordsStartingWith('m', 1).map((w) => w.id);
    expect(ids).not.toContain('sam');
  });

  it('only returns words with a picture', () => {
    for (const word of picturableWordsStartingWith('s', 1)) {
      expect(word.picture).toBeDefined();
    }
  });

  it('respects the level cutoff', () => {
    expect(picturableWordsStartingWith('m', 0)).toEqual([]);
  });

  it('throws for an unknown grapheme', () => {
    expect(() => picturableWordsStartingWith('zz', 1)).toThrow(/unknown grapheme/i);
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `npx vitest run packages/curriculum/src/lookups.test.ts`
Expected: FAIL — `picturableWordsStartingWith is not a function`.

- [ ] **Step 3: Implement**

Add to `lookups.ts`:

```ts
/**
 * Picturable words whose FIRST grapheme is the one given.
 *
 * Used by the Picture Start mini-game, which asks a child to pick the picture
 * beginning with a letter's sound. Note this is empty for `a` and `i` at Level
 * 1 — their only words are function words with no picture — which is why that
 * game cannot cover the vowels. See the plan's "vowel gap" section.
 */
export function picturableWordsStartingWith(graphemeId: GraphemeId, levelNumber: number): Word[] {
  getGrapheme(graphemeId); // throws on an unknown grapheme
  return picturableWordsForLevel(levelNumber).filter((w) => w.graphemes[0] === graphemeId);
}
```

- [ ] **Step 4: Run, confirm pass, commit**

```bash
git add packages/curriculum/src/lookups.ts packages/curriculum/src/lookups.test.ts
git commit -m "feat(curriculum): add lookup for picturable words by initial sound"
```

---

## Task 2: Per-target proving counts

**Files:**
- Modify: `packages/engine/src/taskTypes.ts`
- Modify: `packages/engine/src/mastery.ts`
- Test: `packages/engine/src/taskTypes.test.ts`

This is the engine change described above, done **before** the new task types exist, so its effect is visible in isolation.

- [ ] **Step 1: Write the failing test**

```ts
describe('provingTaskTypeCount, per target', () => {
  it('counts the task types that could actually be scheduled for this target', () => {
    // SOUND_ID is provable directly by sound-hunt and indirectly by the two
    // word games' secondary credit.
    expect(provingTaskTypeCount('SOUND_ID', 's')).toBeGreaterThanOrEqual(2);
  });

  it('never exceeds what is schedulable, so mastery can never deadlock', () => {
    for (const skill of ['SOUND_ID', 'LETTER_SOUND', 'BLEND_READ', 'SEGMENT_SPELL'] as const) {
      for (const target of ['s', 'a', 't', 'p', 'i', 'm', 'f', 'mat', 'at']) {
        expect(provingTaskTypeCount(skill, target)).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('is at least 1 even for a target nothing can prove, so nothing is unmasterable', () => {
    expect(provingTaskTypeCount('SENTENCE_READ', 'sat')).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Change the signature**

`provingTaskTypeCount(skill: Skill, targetId: TargetId, pool = TASK_TYPES): number`

A task type counts toward a target when it serves that skill **and** could be scheduled for that target. For now every existing type can serve any target of its skill, so behaviour is unchanged; Task 5 adds the real constraint for Picture Start.

Floor the result at 1. A target nothing can prove must still be masterable on the other five conditions, or it becomes permanently stuck — which is the deadlock this engine has already had once.

- [ ] **Step 3: Update `isMastered`**

```ts
record.taskTypesSeen.length >= Math.min(config.masteryTaskTypes, provingTaskTypeCount(record.skill, record.targetId))
```

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: all green. Nothing should change yet — this is a refactor with the constraint added later. If something fails, understand why before changing it.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/taskTypes.ts packages/engine/src/mastery.ts packages/engine/src/taskTypes.test.ts
git commit -m "refactor(engine): count proving task types per target, not per skill"
```

---
## Task 3: Word Pick — reading, in the other direction

**Files:**
- Modify: `packages/engine/src/taskTypes.ts`
- Modify: `packages/engine/src/sessionBuilder.ts`
- Create: `apps/game/src/tasks/WordPick.tsx`
- Modify: `apps/game/src/tasks/registry.ts`

The child sees a picture and taps the matching written word from three.

**Why it is not just Picture Match backwards.** Picture Match shows one word and three pictures, so a child can succeed by recognising the word's shape or its first letter and finding the obvious picture. Word Pick shows one picture and three *words*, and its distractors can share a first letter — `mat`, `map` — so the only way through is to read to the end. That is the shortcut this game exists to close.

- [ ] **Step 1: Add the task-type metadata**

```ts
  {
    id: 'word-pick',
    skill: 'BLEND_READ',
    difficulty: 3,
    minChoices: 2,
    maxChoices: 3,
    secondaryTargets: 'graphemes',
  },
```

Same difficulty as Picture Match: it is the same skill at the same stage, and the frustration guard's cap should treat them alike.

- [ ] **Step 2: Distractors must prefer words sharing a first grapheme**

In the session builder, when generating a `word-pick` task, rank candidate distractors so that words sharing the target's **first** grapheme come first, then minimal pairs, then the rest.

Write the test before the code, and make it fail: with target `mat`, the chosen distractors must include `map` when it is available.

- [ ] **Step 3: Build the component**

`WordPick.tsx`, modelled on `PictureMatch.tsx`:

- The picture is shown large and alone at the top.
- Three word cards below, each rendering its graphemes in the letter font, as Picture Match renders its word.
- **The word is never spoken**, by the prompt or by any hint tier below 3. Reading it is the task; speaking it turns this into listening.
- Tier 2 hint: sound out the **target word's** graphemes in order, exactly as Picture Match does, and narrow to two cards.
- Tier 3: the correct card shimmers.

- [ ] **Step 4: Register it, check it in a browser, commit**

Look at it: three word cards must be readable at a glance and must not overflow at 1024×768. Report what you saw.

```bash
git add packages/engine/src/taskTypes.ts packages/engine/src/sessionBuilder.ts apps/game/src/tasks/WordPick.tsx apps/game/src/tasks/registry.ts
git commit -m "feat(game): add Word Pick, reading from picture to written word"
```

---

## Task 4: Missing Letter — spelling, one position at a time

**Files:**
- Create: `apps/game/src/tasks/missingLetterLogic.ts`
- Create: `apps/game/src/tasks/MissingLetter.tsx`
- Test: `apps/game/src/tasks/missingLetterLogic.test.ts`
- Modify: `packages/engine/src/taskTypes.ts`, `registry.ts`

The child hears a word, sees it with one letter missing, and taps the letter that belongs in the gap.

**Why it is not a weaker Word Builder.** Word Builder lets a child reach the vowel by elimination: place the two consonants they are confident about and the vowel drops into the only remaining gap, never actually chosen. Missing Letter removes that escape by blanking one position and asking for it directly — and it should favour the **medial vowel**, which is the hardest slot for a beginner and the one Word Builder most often lets them dodge.

- [ ] **Step 1: Write the failing logic test**

```ts
import { describe, expect, it } from 'vitest';
import { makeRng } from '@soundlings/engine';
import { blankPositionFor, judgeMissingLetter } from './missingLetterLogic';

describe('blankPositionFor', () => {
  it('blanks the medial vowel in a CVC word most of the time', () => {
    // The middle of a CVC word is the hardest position for a beginner, and
    // the one Word Builder lets them reach by elimination. This game exists
    // to ask for it directly.
    const picks = Array.from({ length: 200 }, (_, i) => blankPositionFor(['m', 'a', 't'], makeRng(i)));
    const middle = picks.filter((p) => p === 1).length;
    expect(middle / picks.length).toBeGreaterThan(0.5);
  });

  it('still blanks other positions sometimes, so it is not memorisable', () => {
    const picks = new Set(Array.from({ length: 200 }, (_, i) => blankPositionFor(['m', 'a', 't'], makeRng(i))));
    expect(picks.size).toBeGreaterThan(1);
  });

  it('always returns a position inside the word', () => {
    for (let i = 0; i < 100; i += 1) {
      const p = blankPositionFor(['a', 't'], makeRng(i));
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(2);
    }
  });

  it('is deterministic for a seed', () => {
    expect(blankPositionFor(['m', 'a', 't'], makeRng(7))).toBe(blankPositionFor(['m', 'a', 't'], makeRng(7)));
  });
});

describe('judgeMissingLetter', () => {
  it('accepts the letter that belongs in the gap', () => {
    expect(judgeMissingLetter(['m', 'a', 't'], 1, 'a')).toBe(true);
  });

  it('rejects a letter that belongs elsewhere in the same word', () => {
    // `pip` has p at both ends; choosing p for the middle is still wrong.
    expect(judgeMissingLetter(['p', 'i', 'p'], 1, 'p')).toBe(false);
  });

  it('accepts a repeated letter in a position where it does belong', () => {
    expect(judgeMissingLetter(['p', 'i', 'p'], 2, 'p')).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, confirm it fails, then implement**

`blankPositionFor` weights the medial position of a 3-grapheme word at roughly 70%, splitting the rest between first and last. For a 2-grapheme word, split evenly. Take an injected `Rng` — never `Math.random`.

- [ ] **Step 3: Task-type metadata**

```ts
  {
    id: 'missing-letter',
    skill: 'SEGMENT_SPELL',
    difficulty: 3,
    minChoices: 2,
    maxChoices: 4,
    secondaryTargets: 'graphemes',
  },
```

Difficulty 3, one below Word Builder's 4: filling one gap is genuinely easier than assembling a whole word, and the frustration guard should be able to fall back to it.

- [ ] **Step 4: Build the component**

- The word is shown with the blank as an empty slot, in the same visual language as Word Builder's slots.
- The word is **spoken** on mount — the child must hear what they are spelling.
- Letter choices below: the correct letter plus distractors from `pickGraphemeDistractors`.
- Tier 2: narrow to two and replay the word, sounding out the graphemes.
- Tier 3: the correct letter shimmers in place.

- [ ] **Step 5: Register, look at it, commit**

```bash
git commit -m "feat(game): add Missing Letter, favouring the medial vowel"
```

---

## Task 5: Picture Start — the letter's sound, without the mnemonic

**Files:**
- Create: `apps/game/src/tasks/pictureStartLogic.ts`
- Create: `apps/game/src/tasks/PictureStart.tsx`
- Test: `apps/game/src/tasks/pictureStartLogic.test.ts`
- Modify: `packages/engine/src/taskTypes.ts`, `sessionBuilder.ts`, `registry.ts`

The child sees a letter and taps which of three pictures **starts with that letter's sound**.

**The rule that makes this a real second proof:** the answer is never the grapheme's own mnemonic. `m`'s mnemonic is the moon, so the answer must be a mat or a map. If the moon could be the answer, a child could respond from the memorised letter-picture pairing they were taught alongside the sound — the exact memorisation this entire plan exists to rule out. **A second game passable by the same memorised association is not a second proof.**

- [ ] **Step 1: Write the failing logic test**

```ts
import { describe, expect, it } from 'vitest';
import { GRAPHEMES, WORDS } from '@soundlings/curriculum';
import { makeRng } from '@soundlings/engine';
import { pictureStartOptions, supportsPictureStart } from './pictureStartLogic';

describe('supportsPictureStart', () => {
  it('is true for sounds with a picturable word starting with them', () => {
    for (const g of ['s', 'p', 'm', 't', 'f']) {
      expect(supportsPictureStart(g, 1), g).toBe(true);
    }
  });

  it('is false for the vowels, which have no picturable word', () => {
    // Documented limitation, not an oversight: `at`, `am`, `if` and `it` are
    // function words with no picture. The vowels get a second proving game
    // only when SAY_IT ships.
    expect(supportsPictureStart('a', 1)).toBe(false);
    expect(supportsPictureStart('i', 1)).toBe(false);
  });
});

describe('pictureStartOptions', () => {
  it('never offers the grapheme own mnemonic as the answer', () => {
    // The whole point. m's mnemonic is the moon; the answer must be mat or map.
    for (let seed = 0; seed < 50; seed += 1) {
      const { answer } = pictureStartOptions('m', 1, 3, makeRng(seed));
      expect(WORDS[answer].picture).not.toBe(GRAPHEMES['m'].mnemonicEmoji);
    }
  });

  it('gives an answer that really does start with the sound', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const { answer } = pictureStartOptions('s', 1, 3, makeRng(seed));
      expect(WORDS[answer].graphemes[0]).toBe('s');
    }
  });

  it('gives distractors that do NOT start with the sound', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const { answer, choices } = pictureStartOptions('m', 1, 3, makeRng(seed));
      for (const id of choices) {
        if (id === answer) continue;
        expect(WORDS[id].graphemes[0], `${id} must not start with m`).not.toBe('m');
      }
    }
  });

  it('includes the answer among the choices, with no duplicates', () => {
    const { answer, choices } = pictureStartOptions('p', 1, 3, makeRng(1));
    expect(choices).toContain(answer);
    expect(new Set(choices).size).toBe(choices.length);
  });

  it('varies the answer across seeds when several words qualify', () => {
    // p has pat, pip and pit. A fixed answer would be memorisable.
    const answers = new Set(Array.from({ length: 30 }, (_, i) => pictureStartOptions('p', 1, 3, makeRng(i)).answer));
    expect(answers.size).toBeGreaterThan(1);
  });

  it('throws for a grapheme it cannot support, rather than returning nonsense', () => {
    expect(() => pictureStartOptions('a', 1, 3, makeRng(1))).toThrow(/picture start/i);
  });
});
```

- [ ] **Step 2: Run, confirm it fails, implement**

`pictureStartOptions(graphemeId, level, choiceCount, rng)` returns `{ answer, choices }` of word ids. The answer is drawn from `picturableWordsStartingWith`, excluding any word whose picture equals the grapheme's `mnemonicEmoji`. Distractors are picturable words starting with a *different* grapheme.

- [ ] **Step 3: Task-type metadata, and the scheduling constraint**

```ts
  {
    id: 'picture-start',
    skill: 'LETTER_SOUND',
    difficulty: 2,
    minChoices: 2,
    maxChoices: 3,
    secondaryTargets: 'none',
  },
```

**This is where `provingTaskTypeCount` earns its per-target signature from Task 2.** `picture-start` counts toward a target only when `supportsPictureStart(target, level)` is true. So `m`/`LETTER_SOUND` requires two games and `a`/`LETTER_SOUND` requires one — honestly, because one is all that exists.

The session builder must not schedule `picture-start` for a grapheme it cannot support. Test that directly: across many seeds and mastery states, no `picture-start` task ever targets `a` or `i`.

- [ ] **Step 4: Build the component**

- The letter large at the top, in the letter font.
- Its sound plays on mount — this is a letter-to-sound task, so the child needs the letter, and the sound is what they are matching against.
- Three picture cards below.
- Tier 2: narrow to two, and replay the sound.
- Tier 3: the correct picture shimmers.

- [ ] **Step 5: Register, look at it, commit**

```bash
git commit -m "feat(game): add Picture Start, never answerable from the mnemonic"
```

---

## Task 6: Re-measure the pacing

**Files:**
- Modify: `packages/engine/src/simulate.test.ts`
- Modify: `docs/superpowers/specs/2026-10-10-soundlings-phonics-game-design.md`

Three new task types change what a quest contains and how fast evidence accumulates. The measured figures in the spec are now stale.

- [ ] **Step 1: Run the simulation**

Run: `npx vitest run packages/engine/src/simulate.test.ts`

Some range assertions will probably fail. **That is expected and is the point of this task.**

- [ ] **Step 2: Measure properly**

For each profile — fast, average, struggling, near-chance — over at least 30 seeds, record min, mean and max quests and tasks.

- [ ] **Step 3: Interpret before you retune**

Two outcomes, two different responses:

- **Quest counts fall.** Likely, because more task types means the two-task-type bar is reached sooner. Good — update the ranges to match.
- **Quest counts rise materially.** Then something is wrong: more ways to practise should not make a level longer. **Stop and report it** rather than widening the ranges.

Do **not** weaken any mastery guarantee — `masteryCorrect`, `masterySessions`, `masteryStrength`, the recency condition — to hit a number. The ranges describe the engine; they do not govern it.

- [ ] **Step 4: Write the measured figures into the spec**

Update §5.7's measured table and §11's ranges with the new numbers and the config that produced them. Keep the existing note that these are measurements, not promises.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/simulate.test.ts docs/
git commit -m "test(engine): re-measure pacing with six mini-games"
```

---

## Task 7: Verify the guarantee is now real

**Files:**
- Test: `packages/engine/src/mastery.predicate.test.ts`

The point of this plan was to make the anti-memorisation guarantee true. Prove it.

- [ ] **Step 1: Write the test**

```ts
describe('the anti-memorisation guarantee, after a second game per skill', () => {
  it('refuses mastery from one task type for every skill that now has two', () => {
    // Before this plan, LETTER_SOUND, BLEND_READ and SEGMENT_SPELL were capped
    // at one proving task type, so this condition was vacuous for them and the
    // spec said so. It should now bite.
    const cases = [
      { skill: 'SOUND_ID' as const, target: 's' },
      { skill: 'LETTER_SOUND' as const, target: 'm' },
      { skill: 'BLEND_READ' as const, target: 'mat' },
      { skill: 'SEGMENT_SPELL' as const, target: 'mat' },
    ];

    for (const { skill, target } of cases) {
      let record = emptyRecord(target, skill, DEFAULT_CONFIG);
      // Plenty of correct answers, several sessions — but all one game.
      for (let session = 1; session <= 5; session += 1) {
        record = applyAttempt(record, {
          sessionId: `s${session}`, targetId: target, skill, taskTypeId: 'only-one',
          correct: true, scaffolded: false, latencyMs: 800, weight: 1, at: session * 3_600_000,
        }, DEFAULT_CONFIG);
      }
      expect(isMastered(record, 5 * 3_600_000, DEFAULT_CONFIG), `${target}/${skill}`).toBe(false);
    }
  });

  it('still allows mastery on one task type where only one exists', () => {
    // `a`/LETTER_SOUND has no Picture Start, so demanding two games would make
    // it permanently unmasterable — the deadlock this engine already had once.
    let record = emptyRecord('a', 'LETTER_SOUND', DEFAULT_CONFIG);
    for (let session = 1; session <= 3; session += 1) {
      record = applyAttempt(record, {
        sessionId: `s${session}`, targetId: 'a', skill: 'LETTER_SOUND', taskTypeId: 'sound-singer',
        correct: true, scaffolded: false, latencyMs: 800, weight: 1, at: session * 3_600_000,
      }, DEFAULT_CONFIG);
    }
    expect(isMastered(record, 3 * 3_600_000, DEFAULT_CONFIG)).toBe(true);
  });
});
```

- [ ] **Step 2: Confirm both pass, then update the spec**

Spec §5.3's "Condition 3 must be capped by what actually exists" currently says the guarantee is vacuous for three skills and calls it the honest interim. Rewrite it: the guarantee now holds for every skill except `LETTER_SOUND` on the two vowels, and say why that exception exists and what lifts it.

- [ ] **Step 3: Commit**

```bash
git commit -m "test(engine): prove the anti-memorisation guarantee now bites"
```

---

## Task 8: Review gate 3

- [ ] **Step 1: Update `docs/REVIEW-GATE.md`**

Add the three new games and what each is for. Keep every existing caveat — the voice is still placeholder, nobody has heard it, no child has played it.

Add one thing to the "what to try" list: **play far enough to meet all six mini-games.** Picture Match and Word Pick need picturable words, so they arrive several quests in — and until now nobody had ever seen Picture Match running at all.

- [ ] **Step 2: Run everything, record the totals, commit**

```bash
npm test
git commit -m "docs: update the review gate for six mini-games"
```

---

## Out of scope

Levels 2–6 · real voice · illustrated pictures · the parent area · Supabase and sync · `SAY_IT` voice tasks · branded `TargetId` · the win-back pacing lever.

## Self-review notes

**Spec coverage:** §5.3's capped condition becomes real for three of four skills (Tasks 2, 5, 7) · §5.4 scheduling constraints for the new types (Tasks 3, 5) · §11 pacing re-measured (Task 6).

**Known limitation, stated not hidden:** `LETTER_SOUND` for `a` and `i` keeps one proving game, because no picturable Level 1 word starts with either vowel. The engine is honest about it via per-target counting rather than pretending otherwise. `SAY_IT` is the real fix and belongs in a later plan.

**Rough edge:** Tasks 3, 4 and 5 specify their components in prose rather than complete code, consistent with the review-depth note in Plan 1's header — layout is judged by looking. The *logic* behind each (`missingLetterLogic`, `pictureStartLogic`, the distractor ranking) is fully specified and tested.
