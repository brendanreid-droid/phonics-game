# Soundlings Plan 4: The Parent Area — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the grown-up an honest view of what their child can and cannot do, and tell them when a child needs a person rather than an app.

**Architecture:** One PIN-gated area, built from data the device already holds. All derivations are pure functions over the existing mastery map, attempt log and confusion map. No backend — Supabase is Plan 5.

**Tech Stack:** Unchanged.

**Spec:** `docs/superpowers/specs/2026-10-10-soundlings-phonics-game-design.md` §7.1, §11.1

---

## Why this before more content

Level 1 takes a strong child about 17 quests and a struggling child about 30. There is plenty of game already. What is missing is that nobody — not the parent, not you — can see what the engine knows. The adaptive model is the product's whole claim and it is currently invisible.

Two things make this urgent rather than nice:

**The mastery gate is statistical, not absolute.** Spec §11.1 records that a child answering at chance eventually passes it: 40 of 50 simulated near-chance children completed Level 1 given enough attempts, at a mean of 72 quests. No gate built on counting correct answers can be made luck-proof. The only real safeguard is telling the grown-up, which makes the "needs a hand" signal **required**, not a nice-to-have.

**A parent whose child is struggling currently has nothing.** They see stars and creatures, which are deliberately all-positive. That is right for the child's screens and wrong for the adult's.

## What this is not

Not a report card, and not a dashboard of charts. A parent of a five-year-old wants three answers:

1. Which sounds does my child know?
2. What are they mixing up?
3. What should I do about it?

Everything here serves one of those. If a number does not, it does not belong.

---

## Decisions made up front

**A four-digit PIN, and it replaces the hold gate.** Plan 2 gated profile creation and deletion behind a two-second hold, with a `TODO(Plan 3)` recording that a hold is not completable by keyboard or screen reader — a real accessibility gap, and a grown-up using assistive technology is exactly who hits it. Now there is a PIN, destructive profile actions move behind it too. **One accessible gate, not two inaccessible ones.** Delete the hold gate and its TODO.

**The PIN stops a child, not an adult, and the code should say so.** Store a salted hash rather than the digits, because a plain PIN sitting in device storage is gratuitous. But do not pretend this is a security boundary: a determined adult with the device can clear storage. It exists so a five-year-old cannot wander into their own progress data and tap "delete".

**Forgetting the PIN must not trap anyone.** A "forgot it" path resets the PIN by clearing it — but it also says plainly, before confirming, that this is possible for anyone holding the device. Locking a parent out of their own child's data would be worse than the weak gate.

**The heatmap shows live strength, not the latch.** It answers "what can they do right now?", which is the question a parent asks before sitting down with them. Level select shows the latch, because that answers "did they finish it?". Both are true. The island already makes this distinction, and `island.ts` and `levelCards.ts` carry comments explaining it — follow the same pattern here.

**No accuracy percentages anywhere.** "68% correct" invites a parent to treat it as a school mark and to say so to the child. The same information is more useful and less harmful as "still learning /f/" plus "practise fit and fat in the car".

---

## File structure

### `apps/game/src/parent` — the derivations, all pure
| File | Responsibility |
|---|---|
| `pin.ts` | Hashing, verifying, setting and clearing the PIN |
| `PinRepo.ts` | Interface, memory and AsyncStorage implementations |
| `soundReport.ts` | Per-sound state from the mastery map |
| `confusionReport.ts` | Which pairs this child actually mixes up |
| `practiceSuggestions.ts` | Three specific things to do away from the screen |
| `needsAHand.ts` | The near-chance signal |
| `parentSummary.ts` | Assembles the above into one view model |

### `apps/game/app`
| File | Responsibility |
|---|---|
| `parent.tsx` | The PIN gate and the area behind it |
| `index.tsx` | *Modified:* profile deletion moves behind the PIN |

---

## Task 1: The PIN

**Files:**
- Create: `apps/game/src/parent/pin.ts`
- Create: `apps/game/src/parent/PinRepo.ts`
- Create: `apps/game/src/parent/MemoryPinRepo.ts`
- Create: `apps/game/src/parent/AsyncStoragePinRepo.ts`
- Test: `apps/game/src/parent/pin.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { hashPin, isValidPinFormat, verifyPin } from './pin';

describe('isValidPinFormat', () => {
  it('accepts four digits', () => {
    expect(isValidPinFormat('1234')).toBe(true);
    expect(isValidPinFormat('0000')).toBe(true);
  });

  it('rejects anything else', () => {
    for (const bad of ['123', '12345', 'abcd', '12 4', '', '12.4']) {
      expect(isValidPinFormat(bad), bad).toBe(false);
    }
  });
});

describe('hashPin and verifyPin', () => {
  it('accepts the right PIN', () => {
    const stored = hashPin('1234', 'salt-abc');
    expect(verifyPin('1234', stored)).toBe(true);
  });

  it('rejects the wrong PIN', () => {
    const stored = hashPin('1234', 'salt-abc');
    expect(verifyPin('1235', stored)).toBe(false);
  });

  it('does not store the digits themselves', () => {
    // A plain PIN sitting in device storage is gratuitous. This is not a
    // security boundary — an adult with the device can clear storage — but
    // there is no reason to make it trivial.
    const stored = hashPin('1234', 'salt-abc');
    expect(JSON.stringify(stored)).not.toContain('1234');
  });

  it('gives different stored values for the same PIN with different salts', () => {
    expect(hashPin('1234', 'salt-a').hash).not.toBe(hashPin('1234', 'salt-b').hash);
  });

  it('is stable for the same PIN and salt', () => {
    expect(hashPin('1234', 'salt-a').hash).toBe(hashPin('1234', 'salt-a').hash);
  });
});
```

- [ ] **Step 2: Run it, confirm it fails, implement**

Use a simple keyed hash — this guards against shoulder-reading storage, not against an attacker, and the comment should say exactly that. Do not reach for a crypto dependency; the threat model does not justify one.

`PinRepo` follows the shape of the existing `ProfileRepo`: an interface, a memory implementation, an AsyncStorage one, and a shared contract suite. Read `apps/game/src/profiles/profileRepoContract.ts` and copy the pattern rather than inventing a second one.

It needs: `isSet()`, `set(pin)`, `verify(pin)`, `clear()`.

- [ ] **Step 3: Commit**

```bash
git add apps/game/src/parent
git commit -m "feat(game): add a PIN for the parent area"
```

---

## Task 2: The sound report

**Files:**
- Create: `apps/game/src/parent/soundReport.ts`
- Test: `apps/game/src/parent/soundReport.test.ts`

The first of the parent's three questions: **which sounds does my child know?**

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, applyAttempt, emptyRecord } from '@soundlings/engine';
import type { MasteryMap } from '@soundlings/engine';
import { masteryKey } from '@soundlings/engine';
import { soundReport } from './soundReport';

const HOUR = 3_600_000;
const NOW = 1000 * HOUR;

function mapWith(entries: Array<[string, ReturnType<typeof emptyRecord>]>): MasteryMap {
  return Object.fromEntries(entries);
}

describe('soundReport', () => {
  it('lists every sound in the level, in teaching order', () => {
    const rows = soundReport(1, {}, NOW);
    expect(rows.map((r) => r.grapheme.id)).toEqual(['s', 'a', 't', 'p', 'i', 'm', 'f']);
  });

  it('marks a sound the child has never met as not started', () => {
    expect(soundReport(1, {}, NOW)[0].state).toBe('not-started');
  });

  it('separates hearing from seeing, because they are different abilities', () => {
    // A child can often pick `s` on hearing /s/ while still not recalling the
    // sound when shown the letter. A parent needs to see which one is lagging,
    // because the practice that helps is different.
    const rows = soundReport(1, {}, NOW);
    expect(rows[0]).toHaveProperty('hearing');
    expect(rows[0]).toHaveProperty('seeing');
  });

  it('reports a mastered sound as secure', () => {
    let hearing = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
    for (const [session, type] of [['one', 'sound-hunt'], ['two', 'word-builder'], ['three', 'sound-hunt']] as const) {
      hearing = applyAttempt(hearing, {
        sessionId: session, targetId: 's', skill: 'SOUND_ID', taskTypeId: type,
        correct: true, scaffolded: false, latencyMs: 800, weight: 1, at: NOW,
      }, DEFAULT_CONFIG);
    }
    const rows = soundReport(1, mapWith([[masteryKey('s', 'SOUND_ID'), hearing]]), NOW);
    expect(rows[0].hearing.state).toBe('secure');
  });

  it('reports a sound that has decayed as needing a refresh, not as lost', () => {
    // Wording matters. A parent reading "forgotten" will say so to the child.
    let hearing = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
    hearing = applyAttempt(hearing, {
      sessionId: 'one', targetId: 's', skill: 'SOUND_ID', taskTypeId: 'sound-hunt',
      correct: true, scaffolded: false, latencyMs: 800, weight: 1, at: NOW,
    }, DEFAULT_CONFIG);
    const muchLater = NOW + 5000 * HOUR;
    const rows = soundReport(1, mapWith([[masteryKey('s', 'SOUND_ID'), hearing]]), muchLater);
    expect(rows[0].hearing.state).toBe('needs-refresh');
  });

  it('never reports a percentage or an accuracy figure', () => {
    const rows = soundReport(1, {}, NOW);
    const text = JSON.stringify(rows);
    expect(text).not.toMatch(/%/);
    expect(text).not.toMatch(/accuracy/i);
  });

  it('counts how many sounds are secure in each direction', () => {
    const rows = soundReport(1, {}, NOW);
    expect(rows.filter((r) => r.hearing.state === 'secure').length).toBe(0);
  });
});
```

- [ ] **Step 2: Run, confirm it fails, implement**

States are `not-started`, `learning`, `needs-refresh` and `secure`, derived from `strengthAt` and `isMastered`. `needs-refresh` is a previously-strong record that has decayed — the distinction matters because it tells a parent to revisit rather than to re-teach.

Keep the vocabulary gentle and accurate. No "failed", no "weak", no percentages.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(game): add the per-sound report for the parent area"
```

---

## Task 3: Confusion pairs and practice suggestions

**Files:**
- Create: `apps/game/src/parent/confusionReport.ts`
- Create: `apps/game/src/parent/practiceSuggestions.ts`
- Test: `apps/game/src/parent/confusionReport.test.ts`
- Test: `apps/game/src/parent/practiceSuggestions.test.ts`

The parent's second and third questions: **what are they mixing up, and what do I do about it?**

- [ ] **Step 1: Write the failing confusion test**

```ts
describe('confusionReport', () => {
  it('is empty for a child with no recorded confusions', () => {
    expect(confusionReport({}, 1)).toEqual([]);
  });

  it('reports a pair the child actually mixes up', () => {
    const rows = confusionReport({ 'm>n': 4 }, 1);
    expect(rows[0].target).toBe('m');
    expect(rows[0].mistakenFor).toBe('n');
    expect(rows[0].times).toBe(4);
  });

  it('ranks the most frequent confusion first', () => {
    const rows = confusionReport({ 'm>n': 2, 's>f': 7 }, 1);
    expect(rows[0].target).toBe('s');
  });

  it('ignores a pair seen only once, which is a slip rather than a pattern', () => {
    // One wrong tap is a wobble. Reporting it would have a parent drilling
    // something their child does not actually struggle with.
    expect(confusionReport({ 'm>n': 1 }, 1)).toEqual([]);
  });

  it('describes the pair in words a parent can use', () => {
    const rows = confusionReport({ 'm>n': 4 }, 1);
    expect(rows[0].description).toMatch(/mixe?s up/i);
  });

  it('ignores confusions involving sounds not in this level', () => {
    expect(confusionReport({ 'zz>qq': 9 }, 1)).toEqual([]);
  });
});
```

- [ ] **Step 2: Write the failing practice test**

```ts
describe('practiceSuggestions', () => {
  it('suggests nothing when there is nothing to work on', () => {
    expect(practiceSuggestions({ soundRows: [], confusions: [], level: 1 })).toEqual([]);
  });

  it('gives at most three suggestions, because a parent will not do more', () => {
    const many = practiceSuggestions({ soundRows: manyStrugglingRows(), confusions: [], level: 1 });
    expect(many.length).toBeLessThanOrEqual(3);
  });

  it('names specific words rather than abstract advice', () => {
    // "Work on blending" is useless. "Try sat and sip in the car" is a thing a
    // parent can actually do while driving.
    const [first] = practiceSuggestions({ soundRows: strugglingWith('s'), confusions: [], level: 1 });
    expect(first.words.length).toBeGreaterThan(0);
    for (const word of first.words) {
      expect(word).toMatch(/^[a-z]+$/);
    }
  });

  it('suggests words that actually contain the sound being practised', () => {
    const [first] = practiceSuggestions({ soundRows: strugglingWith('m'), confusions: [], level: 1 });
    for (const word of first.words) {
      expect(word).toMatch(/m/);
    }
  });

  it('only suggests words the child could decode at this level', () => {
    for (const suggestion of practiceSuggestions({ soundRows: strugglingWith('s'), confusions: [], level: 1 })) {
      for (const word of suggestion.words) {
        expect(wordsForLevel(1).map((w) => w.id)).toContain(word);
      }
    }
  });

  it('prioritises a confusion over a merely unlearned sound', () => {
    // A child mixing two sounds up is actively building a wrong habit. A
    // sound they have not met yet is just the next lesson.
    const rows = practiceSuggestions({
      soundRows: strugglingWith('f'),
      confusions: [{ target: 'm', mistakenFor: 'n', times: 5, description: 'mixes up m and n' }],
      level: 1,
    });
    expect(rows[0].about).toBe('m');
  });
});
```

Write the helpers (`strugglingWith`, `manyStrugglingRows`) in the test file. They are fixtures, not production code.

- [ ] **Step 3: Implement both, run, commit**

```bash
git commit -m "feat(game): add confusion pairs and specific practice suggestions"
```

---
## Task 4: The "needs a hand" signal

**Files:**
- Create: `apps/game/src/parent/needsAHand.ts`
- Test: `apps/game/src/parent/needsAHand.test.ts`

**This is the most important thing in the plan, and the reason the parent area is required rather than optional.**

Spec §11.1 records the measurement: the mastery gate is statistical, not absolute. A child answering at chance eventually passes it — 40 of 50 simulated near-chance children completed Level 1 given enough attempts, at a mean of 72 quests. **No gate built on counting correct answers can be made luck-proof**, because every threshold is passable by trying often enough.

So the engine cannot hold the line alone. A five-year-old stuck at guessing needs a person sitting beside them, and the most useful thing this app can do is say so plainly rather than let them grind through another seventy quests.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { needsAHand } from './needsAHand';
import type { Attempt } from '@soundlings/engine';

function attempts(spec: Array<{ session: string; correct: boolean; target?: string }>): Attempt[] {
  return spec.map((s, i) => ({
    sessionId: s.session,
    targetId: s.target ?? 's',
    skill: 'SOUND_ID' as const,
    taskTypeId: 'sound-hunt',
    correct: s.correct,
    scaffolded: false,
    latencyMs: 2000,
    weight: 1,
    at: i * 60_000,
  }));
}

describe('needsAHand', () => {
  it('says nothing for a child who has barely started', () => {
    // Two sessions is not a pattern. Raising a flag this early would alarm a
    // parent about an ordinary beginning.
    const few = attempts([{ session: 'a', correct: false }, { session: 'b', correct: true }]);
    expect(needsAHand(few).raised).toBe(false);
  });

  it('says nothing for a child who is learning normally', () => {
    const ok = attempts(
      Array.from({ length: 60 }, (_, i) => ({ session: `s${Math.floor(i / 12)}`, correct: i % 5 !== 0 })),
    );
    expect(needsAHand(ok).raised).toBe(false);
  });

  it('raises for a child answering near chance across several sessions', () => {
    const guessing = attempts(
      Array.from({ length: 60 }, (_, i) => ({ session: `s${Math.floor(i / 12)}`, correct: i % 2 === 0 })),
    );
    expect(needsAHand(guessing).raised).toBe(true);
  });

  it('needs the pattern to persist, not just one bad afternoon', () => {
    // Every child has an off day. Flagging it would teach a parent to ignore
    // the signal, which is worse than not having one.
    const oneBadDay = attempts([
      ...Array.from({ length: 36 }, (_, i) => ({ session: `s${Math.floor(i / 12)}`, correct: true })),
      ...Array.from({ length: 12 }, (_, i) => ({ session: 'bad', correct: i % 2 === 0 })),
    ]);
    expect(oneBadDay.length).toBeGreaterThan(0);
    expect(needsAHand(oneBadDay).raised).toBe(false);
  });

  it('clears once the child improves', () => {
    const recovered = attempts([
      ...Array.from({ length: 36 }, (_, i) => ({ session: `s${Math.floor(i / 12)}`, correct: i % 2 === 0 })),
      ...Array.from({ length: 36 }, (_, i) => ({ session: `g${Math.floor(i / 12)}`, correct: true })),
    ]);
    expect(needsAHand(recovered).raised).toBe(false);
  });

  it('gives the grown-up something to do, not just a warning', () => {
    const guessing = attempts(
      Array.from({ length: 60 }, (_, i) => ({ session: `s${Math.floor(i / 12)}`, correct: i % 2 === 0 })),
    );
    const result = needsAHand(guessing);
    expect(result.message.length).toBeGreaterThan(0);
    expect(result.message).not.toMatch(/fail|behind|below average|struggling/i);
  });
});
```

- [ ] **Step 2: Run, confirm it fails, implement**

Look at the most recent N sessions (3 or 4), require a minimum number of attempts so it cannot fire on a short sitting, and compare the unscaffolded correct rate against what guessing would produce given the choice counts actually offered. Two choices means chance is 50%, so a flat threshold would be wrong — derive it from the tasks the child actually saw.

**Wording matters more than the arithmetic here.** The message goes to a parent about their five-year-old. It must not say failing, behind, struggling or below average. Something closer to: *"Some of these sounds are proving tricky. Ten minutes sitting together will help more than more time on the app."* Write it so a parent reads it as useful rather than as a verdict, and so they would not repeat it to the child as criticism.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(game): add the needs-a-hand signal for a child answering near chance"
```

---

## Task 5: Assemble the summary

**Files:**
- Create: `apps/game/src/parent/parentSummary.ts`
- Test: `apps/game/src/parent/parentSummary.test.ts`

One function that turns the stored data into exactly what the screen renders, so the screen itself holds no logic.

- [ ] **Step 1: Write the test, then implement**

```ts
parentSummary({ level, mastery, confusions, attempts, playedDates, highScores, now }): ParentSummary
```

Returning: `sounds` (the rows from Task 2), `confusions` (Task 3), `practice` (Task 3), `needsAHand` (Task 4), plus plain counts — sessions played, days played, sounds secure out of total.

Tests worth having:
- An empty profile produces a summary that renders without special-casing — a parent opening this on day one must see a sensible "not started yet" view, not a blank or a crash.
- No percentage appears anywhere in the output.
- The summary is a pure function of its inputs, with no clock read inside.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(game): assemble the parent summary view model"
```

---

## Task 6: The screen

**Files:**
- Create: `apps/game/app/parent.tsx`
- Modify: `apps/game/app/index.tsx`
- Modify: `apps/game/app/island.tsx`
- Delete: `apps/game/src/profiles/holdGate.ts` and `HoldButton`

- [ ] **Step 1: Build the PIN gate**

First entry sets a PIN; later entries ask for it. A "forgot it" path clears the PIN, and says plainly **before** confirming that anyone holding the device can do this. Locking a parent out of their own child's data would be worse than a weak gate.

- [ ] **Step 2: Build the area**

Reading order matters — a worried parent reads the top and stops:

1. **"Needs a hand", if raised.** First, prominent, and written as help rather than verdict.
2. **The sounds.** A row per sound showing hearing and seeing separately, since a child often has one and not the other and the practice that helps differs. Colour and a word, not a bar — "secure", "learning", "needs a refresh", "not started".
3. **What they're mixing up.** The confusion pairs, in plain words.
4. **Try this.** The three practice suggestions, with their specific words. This is the part a parent will act on, so make it the easiest thing to read.
5. **Plain counts.** Sessions, days played, sounds secure. Small, at the bottom.

No charts. No percentages. If a number does not answer one of the parent's three questions, leave it out.

- [ ] **Step 3: Move profile deletion behind the PIN, and delete the hold gate**

Plan 2 gated deletion behind a two-second hold, with a `TODO` recording that a hold cannot be completed by keyboard or screen reader. That debt is paid here: deletion moves behind the PIN, which is keyboard-accessible, and the hold gate is **deleted** rather than left beside it.

One accessible gate, not two inaccessible ones. Remove `holdGate.ts`, `HoldButton`, their tests and the TODO.

Profile *creation* can stay ungated — adding a profile is not destructive, and a grown-up setting the device up for the first time should not meet a PIN before anything exists.

- [ ] **Step 4: Add the entry point**

A small, discreet link from the island — the existing "Grown-ups" affordance on the picker is the right model. Children should be able to find it and lose interest, not be blocked by something that looks like a door worth opening.

- [ ] **Step 5: Look at it**

Run the web build and check with a real profile that has some progress:
- The sound rows read clearly, and hearing versus seeing is obvious
- A confusion pair reads as plain English
- The practice suggestions name actual words
- An empty profile renders sensibly rather than blank

Report what you saw.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(game): add the parent area and retire the hold gate"
```

---

## Task 7: Review gate 4

**Files:**
- Modify: `docs/REVIEW-GATE.md`
- Modify: `docs/superpowers/specs/2026-10-10-soundlings-phonics-game-design.md`

- [ ] **Step 1: Update the review gate**

Add the parent area, how to reach it, and what it shows. Note the PIN is a child gate rather than a security boundary.

**Remove the "nobody has heard the audio" caveat** — it has now been listened to and judged usable for testing. Replace it with the narrower truth that remains: the clips are machine-generated placeholders, a human voice is still needed before wider use, and when it lands each phoneme should be checked individually, because two of them were wrong before and were caught by analysis rather than by ear.

Keep the caveat that no child has played it.

- [ ] **Step 2: Update spec §7.1 and §11.1**

§7.1 describes the parent area as planned; make it describe what was built. §11.1 says the "needs a hand" signal is a Plan 2 item; it is now built, so say so and record how it is derived.

- [ ] **Step 3: Run everything, commit**

```bash
npm test
git commit -m "docs: update the review gate and spec for the parent area"
```

---

## Out of scope

Supabase, cross-device sync, Levels 2–6, real voice, illustrated artwork, `SAY_IT` voice tasks, branded `TargetId`, the win-back pacing lever.

## Self-review notes

**Spec coverage:** §7.1's parent area (Tasks 2–6) · §11.1's required "needs a hand" signal (Task 4) · the Plan 2 accessibility debt on the hold gate (Task 6).

**Deliberately not built:** anything resembling a report card. The three questions a parent of a five-year-old actually asks are which sounds does my child know, what are they mixing up, and what do I do about it. A number that answers none of those makes the screen worse.

**Rough edge:** Task 6 specifies the screen in prose rather than code, consistent with the review-depth note in Plan 1's header. The derivations behind it (Tasks 2–5) are fully specified and tested, so the screen stays thin.
