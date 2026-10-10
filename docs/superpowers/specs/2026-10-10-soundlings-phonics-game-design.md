# Soundlings — Design Spec

**Date:** 2026-10-10
**Status:** Approved for implementation planning
**Scope of this spec:** Core architecture + Level 1, playable and reviewable.

---

## 1. Product

A phonics reading game for 5-year-olds. Working title **Soundlings**.

A child plays a 5-minute "quest" of 14 short tasks. Each task teaches or tests one phonics skill against one target sound or word. Mastering a sound hatches a creature — a Soundling — whose name uses that sound. The creature collection *is* the progress map.

### 1.1 Goal

Beat [Phonics Hero](https://phonicshero.com/levels-of-learning-ls/), the market leader: 26 levels, 40 fixed games per level, six skill types, superhero-rescue narrative, ~3 years of content.

Where it is weak, and what we do instead:

| Phonics Hero | Soundlings |
|---|---|
| 40 fixed games per level, identical for every child | Level completes on **proven mastery** — a child who finishes can demonstrably read the words. Quest counts are measured, not promised: see §5.7 |
| Linear sequence — known sounds re-drilled, weak sounds under-practised | Per-grapheme, per-skill mastery model with spaced repetition |
| Random wrong answers | Distractors drawn from the child's own logged confusion pairs (b/d, m/n, f/th) |
| Never hears the child | Voice tasks architected from day one (built post-v1) |
| Dated cartoon art | "Soft Paper" art direction — warm paper, collage shapes, muted palette |
| Open-ended play time | Deliberate 5-minute arc with a clean ending; the game suggests stopping |

### 1.2 Success criteria for this phase

1. A 5-year-old can, unaided, open the app, pick their face, and start playing.
2. After Level 1 the child can decode `sat, pat, tip, mat, fit, map` in isolation.
3. No child ever ends a quest on a failure.
4. The engine's scheduling and mastery rules are provably correct by unit test, not by inspection.
5. Reviewable on an iPad simulator without a backend.

---

## 2. Decisions made

| Decision | Choice | Why |
|---|---|---|
| Platform | Expo / React Native (iOS, Android, Web) | One codebase, real App Store path, no rewrite to reach iPad |
| Phonics scheme | Australian synthetic phonics sequence, InitiaLit-aligned | Matches target market's classroom teaching |
| Voice accent | Australian English | Same |
| Backend | Supabase (Postgres + RLS) | Relational fits per-grapheme mastery; SQL enables the parent dashboard |
| Progression | Mastery-adaptive engine | The moat |
| Session | 5-minute quest, clear finish | Matches attention span; keeps mastery data clean; parents trust it |
| Accounts | One parent account, multiple child profiles | Siblings supported from day one; child never types a password |
| Meta-game | Collect & care for creatures | Reward is intrinsically tied to the learning |
| Art direction | Soft Paper | Differentiated; reads as premium; calm palette with punchy feedback |
| Voice recognition | Architected now, built post-v1 | De-risks first playable |

### 2.1 Deferred decisions

| Decision | Deadline | Default if undecided |
|---|---|---|
| Voice talent / recording source (see §9.3) | Before real-child testing, i.e. after step 6 | Hybrid: human phonemes + AI words |
| Pull Supabase earlier than step 8 | Before step 4 | Keep at step 8; review gate needs no backend |
| Final product name | Before App Store submission | Soundlings |
| Namespace grapheme ids apart from word ids (see §4.1a) | Before `TRICKY_READ` or `SENTENCE_READ` ships | Brand `TargetId` as a union of tagged ids |

---

## 3. Repository shape

```
soundlings/
  apps/
    game/                 Expo RN app — iOS, Android, Web
  packages/
    curriculum/           pure data: graphemes, words, levels. Zero dependencies.
    engine/               pure TS: mastery model, session builder, frustration guard
    ui/                   Soft Paper design tokens + shared components
    audio/                AudioService + audio manifest
    api/                  Supabase client, repositories, offline sync queue
  supabase/
    migrations/           SQL
  docs/
    superpowers/specs/    this document
```

### 3.1 The one architectural rule that matters

`packages/curriculum` and `packages/engine` are **pure TypeScript**. No React, no React Native, no network, no filesystem, no clock reads except through an injected `now()`.

Consequences, all intended:
- They unit-test in milliseconds, so they can be developed test-first without friction.
- The adaptive logic — the product's actual differentiator — becomes the most thoroughly tested code we own.
- The engine can later be reused by a web demo, a teacher tool, or a batch simulation harness that plays 10,000 synthetic children through the curriculum to validate pacing.

Any import of React or a network client into these two packages is a design violation. Enforce with a lint rule.

### 3.2 Unit boundaries

| Unit | Does | Used via | Depends on |
|---|---|---|---|
| `curriculum` | Declares the teaching content | Plain exported data + lookup functions | nothing |
| `engine` | Decides what to show next and what counts as mastered | `buildSession()`, `recordAttempt()`, `getMastery()` | `curriculum` types only |
| `audio` | Resolves audio keys to playable sound, plays without overlap | `AudioService` | manifest |
| `ui` | Renders Soft Paper primitives | components + tokens | React Native |
| `api` | Persists and syncs | repository interfaces | Supabase, local store |
| `apps/game` | Screens, task components, navigation | — | all of the above |

`apps/game` is the only place where the above are allowed to meet.

---

## 4. Domain model

### 4.1 Core types

```ts
type PhonemeId = string;   // "/s/"
type GraphemeId = string;  // "s", "sh", "ck"
type WordId = string;      // "sat"
type TargetId = GraphemeId | WordId;

interface Grapheme {
  id: GraphemeId;
  phoneme: PhonemeId;
  letterName: string;          // "ess"
  mnemonic: string;            // "snake"
  audio: { phoneme: string; letterName: string };  // audio KEYS, not paths
  introducedInLevel: number;
  confusableWith: GraphemeId[];  // seeds the distractor picker
}

interface Word {
  id: WordId;
  graphemes: GraphemeId[];     // ["s","a","t"] — drives Word Builder slots
  pattern: 'vc' | 'cv' | 'cvc';
  picture?: string;            // asset key — ABSENT for function words (at, as, if, is, am)
  audio: string;               // audio key
  decodableFromLevel: number;  // derived + asserted by test, never hand-written
}

interface TrickyWord {
  id: WordId;
  audio: string;
  introducedInLevel: number;
}
```

### 4.1a Known issue: one id namespace

`TargetId` is `GraphemeId | WordId`, and both collapse to `string`. The grapheme `a` and the tricky word `a` are therefore the same id, as are the grapheme `i` and the tricky word `i`.

This is survivable in v1 and is being left alone deliberately. Mastery is keyed on `(target, skill)`, so `a::LETTER_SOUND` and `a::TRICKY_READ` are already distinct records, and no v1 task type puts graphemes and tricky words in the same set of choices.

It stops being survivable when `TRICKY_READ` or `SENTENCE_READ` ships, because `confusionKey(target, chosen)` carries no skill and a task's `choices` array would become genuinely ambiguous. Fix it then by branding the id types or tagging them (`g:a`, `w:a`) — and note that mastery records persist these ids, so by that point it is a data migration rather than a type change. That is the cost of deferring, accepted knowingly.

### 4.2 Skills

The six synthetic-phonics skills, plus one reserved:

| Skill | Child does |
|---|---|
| `SOUND_ID` | Hears a sound, picks the letter |
| `LETTER_SOUND` | Sees a letter, identifies its sound |
| `BLEND_READ` | Reads a word, matches meaning |
| `SEGMENT_SPELL` | Hears a word, builds it from letter tiles |
| `TRICKY_READ` / `TRICKY_SPELL` | Whole-word recognition of non-decodable words |
| `SENTENCE_READ` | Reads a short decodable sentence |
| `SAY_IT` *(reserved)* | Says the sound or blends aloud — defined now, implemented post-v1 |

`SAY_IT` exists in the type system and in the task registry's type signature from day one. Adding it later is configuration plus one component, not a refactor.

### 4.3 Task types

A **task type** is one playable mini-game that exercises one skill. Registry-based:

```ts
interface TaskType {
  id: string;
  skill: Skill;
  difficulty: number;              // 1..5, used by the frustration guard
  minChoices: number;
  maxChoices: number;
  generate(target: Target, distractors: Target[], rng: Rng): TaskInstance;
  component: React.ComponentType<TaskProps>;
}
```

`generate` is pure and takes an injected `rng` so any task instance is reproducible from a seed. This makes bug reports replayable and lets the simulation harness run deterministically.

### 4.4 One task credits several targets

A task instance declares a primary target and zero or more secondary targets:

```ts
interface TaskInstance {
  taskTypeId: string;
  primaryTarget: TargetId;
  secondaryTargets: TargetId[];   // e.g. Word Builder on "sat" also exercises s, a, t
  choices: Target[];
  seed: number;
}
```

A correct Word Builder on `sat` is direct evidence the child can segment /s/ /a/ /t/, so it credits `SOUND_ID` for `s`, `a` and `t` as well as `SEGMENT_SPELL` for `sat`. Secondary credit counts at **half weight** toward `correctCount` and reinforces half-life at half rate — it is real evidence, but weaker than an isolated test.

This is not an optimisation bolted on; it is how phonics actually works. Isolated single-target crediting would require ~84 correct attempts to finish Level 1.

**It does not make us faster than the competitor, and an earlier draft of this spec wrongly claimed it did.** Composite credit reaches only `SOUND_ID`, so the seven `LETTER_SOUND` records, the blend-reading words and the spelling words all still need direct practice. Simulation puts a strong child well above the 5 quests this spec once asserted. §1.1 and §5.7 now carry measured figures instead of guesses.

What composite crediting actually buys is that time spent spelling `sat` is not *wasted* on the sounds inside it — which matters, but is a different and smaller claim than the one originally made.

---

## 5. The mastery engine

### 5.1 Mastery record

One record per `(childProfileId, targetId, skill)`:

```ts
interface MasteryRecord {
  halfLifeHours: number;
  /**
   * The decay clock. Advanced ONLY by an unscaffolded correct answer.
   * See the warning below — this must never be the time of the last contact.
   */
  lastReinforcedAt: number;
  /** Last contact of any kind. For display and for the overdue calculation only. */
  lastSeenAt: number;
  correctCount: number;          // unscaffolded only; secondary credit adds 0.5
  primaryCorrectCount: number;   // full-weight unscaffolded correct answers
  attemptCount: number;
  consecutiveCorrect: number;
  avgLatencyMs: number;
  taskTypesSeen: string[];       // mastery requires >= 2
  sessionsProven: number;        // sessions containing unscaffolded correct evidence
  lastProvenSessionId: string | null;
  scaffoldedCount: number;       // tracked, but excluded from mastery
}
```

### 5.2 Decay and reinforcement

Strength is not stored as a current value; it is computed on read:

```
strength(now) = 0.5 ^ ( (now - lastSeenAt) / halfLifeHours )
```

An earlier draft of this spec wrote this as `e^(-elapsed / halfLifeHours)`, which is wrong: that reaches 1/e ≈ 0.368 after one half-life, not 0.5, so the parameter was not a half-life at all and the model decayed by a factor of 1/ln2 ≈ 1.44 too fast. The equivalent correct form is `e^(-elapsed · ln2 / halfLifeHours)`. Any pacing intuition formed against the old formula is void — §5.7's quest estimates are calibrated by the simulation harness (§11) precisely so that an error like this surfaces as a failing test rather than as a child being asked the same sound for a fortnight.

On a correct, unscaffolded, non-slow attempt: `halfLifeHours *= growthFactor` (start 1.9, tapering as `correctCount` rises), and `lastReinforcedAt = now`.
On an error: `halfLifeHours = max(minHalfLife, halfLifeHours * shrink)` and `consecutiveCorrect = 0`, where `shrink = 1 - (1 - errorShrink) * weight` so that a secondary target is penalised in proportion to how weak the evidence was. `lastReinforcedAt` does **not** move.
On a scaffolded correct: no half-life change, no credit, and `lastReinforcedAt` does **not** move. The child was helped; nothing was proven.

#### The decay clock is anchored to evidence, not to contact

**This is the single easiest thing to get wrong in the whole engine, and an earlier draft of this spec got it wrong.** If strength decays from the time of the *last attempt* rather than the last *successful, unaided* attempt, then any contact resets recall to ~1. The consequences were verified against a real implementation:

- A child who answered correctly three times yesterday and then got it **wrong** today was classified as mastered.
- A child who was **shown the answer** was classified as mastered — the exact opposite of the rule two lines above.
- A sound the child had **just failed** became eligible for the win-back slot, whose entire purpose is a guaranteed success. The quest would have opened and closed on the sound the child could not do.

So: `strengthAt` reads `lastReinforcedAt`, and returns 0 when `primaryCorrectCount` is 0 (nothing has ever been proven, so there is nothing to decay). An error leaves the clock where it was and shrinks the half-life, which correctly drops strength sharply rather than restoring it.

The same reasoning governs `sessionsProven`: it counts sessions containing unscaffolded correct evidence, not sessions containing an attempt. A session in which the child only failed or was only helped proves nothing and must not advance it.

"Slow" = latency above `slowLatencyMs`. A slow correct answer reinforces at half rate. Recognition that is correct but effortful is not yet automatic, and automaticity is the actual goal of phonics practice.

**The threshold was set at 4 seconds and that was wrong.** A five-year-old who takes five seconds to decode a word is reading, not failing — and the consequence was severe: a simulated struggling child averaging 5.2s had *every* answer penalised at half rate, which was a major reason that profile could never finish a level. The threshold is **7 seconds**, which still distinguishes automatic recognition from laborious decoding without classifying normal five-year-old pace as a deficit.

Note what was *not* done here. Simulation found that deleting the slow penalty entirely (`slowReinforceFactor: 1`) improved the measured quest counts. That is rejected. The penalty encodes the difference between a child who knows a sound and a child who works it out, which is the whole point of the exercise; a threshold set at the wrong value is a calibration bug, and the fix is the threshold, not the removal of the rule.

### 5.3 Mastery predicate

Mastery is evaluated at **session-build time**, not immediately after an answer — otherwise condition 1 below is trivially satisfied by the attempt that was just made. The question the predicate answers is "could this child do it again today, cold?", which only has meaning after a gap.

A target is **mastered** for a skill when **all** hold:

1. `strength >= 0.8`
2. `correctCount + ε >= 3` (unscaffolded; secondary credit counts as 0.5 — see §4.4)
3. `taskTypesSeen.length >= min(2, provingTaskTypeCount(skill))`
4. `sessionsProven >= 2`
5. `primaryCorrectCount >= 1`
6. `consecutiveCorrect >= 1`

Condition 6 closes a short-timescale version of the clock bug described in §5.2. Anchoring decay to `lastReinforcedAt` fixes the case where the failure comes a day later, but not where it comes a minute later: the clock correctly does not advance and the half-life correctly shrinks, yet so little time has passed that strength is still ≈0.998. Without condition 6 a sound the child failed moments ago still reads as mastered.

Because `consecutiveCorrect` resets on any unscaffolded error *and* on a scaffolded failure, this also means a previously mastered sound becomes unmastered the moment the child gets it wrong, and must be re-proven. That is the intended behaviour, not a side effect — mastery is a claim about the present, and the most recent evidence is that they could not do it.

Conditions 3 and 4 are the important ones. (3) stops a child memorising the answer pattern of a single mini-game. (4) requires retention across a gap, not same-sitting recall.

#### Condition 3 must be capped by what actually exists

A flat `>= 2` **deadlocks the game**, and an earlier draft of this spec had exactly that. Secondary credit flows only to `SOUND_ID`, and each of the four v1 mini-games serves one distinct skill. So `LETTER_SOUND`, `BLEND_READ` and `SEGMENT_SPELL` can only ever accumulate one entry in `taskTypesSeen`, can never satisfy `>= 2`, and can never be mastered. Since level completion requires every grapheme mastered for `LETTER_SOUND`, **Level 1 was impossible to finish.** Verified by simulation: a flawless child played ten consecutive quests, reached 33–37 correct answers per sound at strength 0.99, and every record still read `isMastered: false`.

Hence `min(2, provingTaskTypeCount(skill))`, where `provingTaskTypeCount` counts the task types that can contribute evidence for that skill — its own direct type, plus any type that grants it secondary credit. Today that is 3 for `SOUND_ID` and 1 for each of the others.

The anti-memorisation guarantee therefore holds **wherever more than one mini-game can prove a skill**, and is honestly vacuous where only one can. The other five conditions still apply in full: a child cannot pass by memorising, because mastery still needs three unscaffolded correct answers across two separate sessions with decay in between, against distractor sets that differ on every instance.

When Plan 2 adds a second mini-game per skill, this cap lifts by itself and the full guarantee returns. That is the real fix; this is the honest interim.

Condition 5 exists because without it a sound could be mastered entirely through secondary credit — that is, a child could be credited with knowing `/m/` having never once been asked `/m/` directly, purely from spelling words containing it. Secondary credit is meant to accelerate mastery, not to replace being asked.

The `ε` in condition 2 is not pedantry. Secondary credit is currently 0.5, which is exact in binary floating point, so six half-credits sum to exactly 3. The simulation harness (§11) will retune `secondaryWeight`, and at 0.3 ten credits sum to 2.9999999999999996 — denying a child who has earned exactly the required evidence. Compare with a small epsilon.

### 5.4 Session builder

```ts
buildSession(profile, masteryRecords, level, now, rng): TaskInstance[]
```

Returns `config.sessionLength` task instances, composed:

Default session length is **14 tasks**, composed:

| Band | Count (of 14) | Selection |
|---|---|---|
| **Current focus** | 8 (~57%) | Newest 1–2 unmastered graphemes in the level |
| **Due review** | 3 (~21%) | Unmastered targets, ranked by `overdueness × (1 - strength)` |
| **Win-backs** | 3 (~21%) | Mastered targets at high strength **whose last answer was correct** — guaranteed success |

Win-backs are a minimum of **3**, not a percentage, because invariants 1, 2 and 4 below require one at the open, one at the close and one in the middle third. An earlier draft of this spec said 60/25/15, which cannot satisfy those invariants at any session length under 20 — the invariants win, because they are what protect the child's experience.

Hard invariants, each covered by a unit test:

1. First task is a win-back. The child starts on a success.
2. Last task is a win-back. The child leaves on a success.
3. No two adjacent tasks share a task type.
4. At least one win-back in the middle third.
5. Every task's target — and every distractor — uses only graphemes the child has actually been **introduced to**, meaning the introduction groups up to and including the one their current focus sits in. Not merely "taught somewhere in this level": on day one a child has met two letters, and offering a third as a wrong answer is a trick question, not a challenge.
6. Session length equals `config.sessionLength` (default 14).
7. If fewer than 2 mastered targets exist (i.e. a brand-new child), win-backs are replaced as follows: the **opening** and **middle-third** anchors use the lowest-difficulty task type available, and the **closing** anchor uses at most the second-lowest and must sit on a target the child has already answered correctly in this session.

   An earlier version of this invariant required all three anchors to use the lowest-difficulty type, and that is **impossible**. On a child's first sessions the focus is `s, a`, and no Level 1 word is buildable from those two letters alone — every word needs `t`, `p`, `m` or `i`. So only two task types exist, invariant 3 forces strict alternation, and slots 0 and 13 of a 14-task quest have opposite parity and therefore opposite types. A brute force over all 2^14 sequences finds zero solutions.

   Invariant 3 wins that conflict, because back-to-back identical mini-games is what a child actually notices and resents. The purpose of invariant 7 — never open on the hardest thing available, always close on a near-certain success — is preserved: a `sound-singer` close is difficulty 2 of 4, on a sound just practised a dozen times. Note that giving either sound skill a second task type dissolves the conflict entirely (924 valid arrangements at three types), so revisit this when Plan 2 adds one.

Invariant 7 matters: a first-ever session has no mastered targets to draw win-backs from, and the naive implementation would open a brand-new 5-year-old on their hardest content.

### 5.5 Distractor picker

```ts
pickDistractors(target, skill, count, mastery, curriculum, rng): Target[]
```

Priority order:
1. Graphemes in `target.confusableWith` that the child has actually confused (from logged attempts)
2. Graphemes in `target.confusableWith` generally
3. Other graphemes already introduced, preferring higher-strength ones

Rationale: a distractor the child can already reject teaches nothing. A distractor they confuse is the actual lesson. This is where "adaptive" has to show up at the level of a single screen, not just the level of a playlist — and it is precisely what a random-distractor competitor cannot do.

Constraint: never use a grapheme not yet introduced. Showing an unknown letter as a wrong answer teaches nothing and reads as unfair.

### 5.6 Frustration guard

Per-session, per-target error counting:

| Trigger | Response |
|---|---|
| 1 error on target | Hint tier 2 (see §8) |
| 2 errors on target | Scaffold: reduce to 2 choices, replay audio, play mnemonic animation |
| 3 errors on target | Abandon the task as scaffolded-complete. Insert a win-back. Cap remaining task difficulty at **2**. |
| 3 **abandoned** targets in one session (i.e. 3 errors on each of 3 targets) | Shorten session to 8 tasks, all low difficulty, end early on a win-back |

The cap is 2, not 1. An earlier draft capped at 1, which looks kinder and is worse: only one Level 1 task type has difficulty 1, so a capped quest would have a single usable mini-game and the no-adjacent rule (§5.4 invariant 3) would collapse into fourteen identical tasks in a row. That would hand the most monotonous possible session to exactly the child already having the hardest time. A cap of 2 keeps two task types in play so the quest still alternates, and difficulty 2 is still an easy task.

**The guard counts errors per target, not per (target, skill) — on purpose.** A child who fails `s` by ear and then fails to name `s` is having trouble with `s`, and that is more reason to ease off, not less. Closing-anchor eligibility *is* keyed per (target, skill), because "can we finish on something they got right?" is a different question and singing `s` is a different question from hearing it. The asymmetry is intentional; don't reconcile it.

The last row is the "bad day" case — tired, unwell, distracted. The right response is a short, kind session, not a full quest of failure. Importantly, attempts in a degraded session still record normally, so the mastery data stays honest; we simply stop asking.

### 5.7 Level completion

Level 1 is complete when:
- All 7 graphemes mastered for `SOUND_ID` **and** `LETTER_SOUND`
- At least 8 Level-1 words mastered for `BLEND_READ`
- At least 6 Level-1 words mastered for `SEGMENT_SPELL`

**Completion latches.** `levelProgress` is evaluated at `now`, so a level that was complete yesterday can read as incomplete today once strength decays — and condition 6 means a single wrong answer un-masters a target. A child must never lose a finished level, so the runner persists `levelCompletedAt` the first time completion is reached and never clears it. The live `levelProgress` calculation stays as it is; it answers "what can they do right now?", which is what the parent dashboard and the session builder need. Only the *badge* latches.

Quotas: **6** blend-reading words and **5** spelling words. An earlier draft said 8 and 6. Those numbers were arbitrary — 6 words read and 5 words spelt, on top of all seven sounds proven in *both* directions, already demonstrates that blending generalises rather than being memorised word by word. The trim is acknowledged as a reduction, not dressed up as a refinement.

### 5.7.1 Pacing is measured, not promised

**This spec has twice asserted quest counts that turned out to be wrong**, first ~3 and then ~5 for a strong learner. Both were arithmetic done by hand, and both were optimistic. The honest position:

- The structural floor is set by the design, not by tuning. Four introduction groups, each needing at least two separate sessions for its sounds to clear condition 4, puts a perfect child near eight quests before any word quota is touched.
- `LETTER_SOUND`, `BLEND_READ` and `SEGMENT_SPELL` get no composite credit, so their practice is irreducible.
- Therefore the real figures are higher than this spec previously claimed, and **we do not claim fewer total tasks than the 40-game competitor.**

### Measured figures

From the simulation harness, 30 seeds per profile, one quest per simulated day, with the calibrated config below. **These are measurements, not targets.**

| Profile | Accuracy | Quests (min / mean / max) | Tasks (mean) | Completed |
|---|---|---|---|---|
| Fast | 95% | 11 / **13.6** / 19 | 191 | 30/30 |
| Average | 80% | 12 / **18.8** / 31 | 264 | 30/30 |
| Struggling | 70% | 16 / **29.4** / 65 | 411 | 30/30 |
| Near-chance | 55% | 21 / 38.8 / 40 | 543 | 3/30 at a 40-quest cap |

Calibrated config: `initialHalfLifeHours` 24 (was 6 — indefensible for a once-a-day product), `growthFactor` 4, `slowLatencyMs` 7000, `focusTargetCount` 3. Every mastery guarantee is unchanged: 3 unscaffolded correct, 2 separate sessions, 0.8 strength, most recent answer correct.

So a strong child needs about **14 quests, roughly 70 minutes of play**, to reach genuine mastery of seven sounds in both directions plus reading and spelling. That is more than this spec once claimed and it is the real number. For context it is also far less than the classroom time the same content takes, and it buys a demonstrable outcome rather than a completion count.

**Why it sits at roughly twice the structural floor**, and why that is the design rather than a bug: mastery is a live predicate, so a mastered sound that is not revisited decays below the 0.8 gate and must be re-proven. Mastered material leaves the practice pool except for the three win-back anchors, so it lapses. Completion needs every record fresh simultaneously. Traces show spelling words lagging sounds by several quests.

**A known pacing lever, deliberately not pulled yet:** the win-back share could rise as a level approaches completion, letting the child top up mastered items instead of letting them lapse. That would cut quest counts without weakening any gate. It is an optimisation, it changes the quest's feel, and it should be judged against real children rather than against a simulation — so it waits.

**What survives, and is still the differentiator:** a child who completes Level 1 here can read `sat, pat, tip, mat, fit, map` — cold, a day later, unaided. A child who completes 40 fixed games has played 40 games. Those are not the same claim, and ours is the one a parent actually wants. The adaptive engine's benefit is distributional rather than total: a struggling child spends their time on the sounds they are failing, and a strong child is not marched through review they do not need.

---

## 6. Level 1 content

Australian synthetic phonics sequence, Level 1: **s, a, t, p, i, m, f** — introduced in groups of **s,a,t → p,i → m,f**.

An earlier draft introduced them two at a time (s,a → t,p → i,m → f), and that was wrong for a reason worth recording. From `s` and `a` alone **no Level 1 word is buildable**, so the first group supported no word task at all. That deadlocked the game: with no word task, `sound-hunt` was the only thing that could prove `SOUND_ID`, mastery needs two proving task types, and so the opening focus could never graduate — a flawless child was measured stuck after six quests with 21 correct answers per sound and 99% recall.

It also defeated the reason this sequence was chosen in the first place. The whole argument for `s,a,t,p,i,m,f` over other orders was that it yields real words almost immediately; a first group that cannot spell a single word throws that away. With `s,a,t` the child can build **at** and **sat** in their first session, which is both the pedagogical point and the mechanical unblock.

Note this is why the fix is grouping rather than cross-crediting `LETTER_SOUND` into `SOUND_ID`. That alternative was measured and performs similarly, but it would blur the distinction between recognising a letter and recalling it from its sound — and requiring both directions is the strongest part of the completion rule (§5.7). Fixing a content problem by weakening an evidence rule is the wrong trade.

Blend-reading necessarily starts at the second group, because no `s,a,t` word has a picture. That is fine: the requirement is that each skill be *reachable*, not that all four start on day one.

**Decodable words:** at, as, am, if, it, is, sat, pat, tap, sap, pit, sit, tip, sip, pip, fat, fit, mat, map, Sam, Pam
**Tricky words:** I, the, a

Of these, the ones usable in Picture Match must be concretely depictable to a 5-year-old: **tap, pit, sit, tip, sip, pip, mat, map, fat, pat, sap**. That is 11 candidates for a requirement of 8 (§5.7), so there is headroom to drop any that children fail to name unprompted during asset testing (§14). Function words (at, as, am, if, it, is) carry no `picture` and are therefore excluded from `BLEND_READ` by construction — the task generator filters on `picture !== undefined` rather than relying on a hand-maintained list.

Every word is asserted decodable by test — i.e. composed only of graphemes introduced at or before its level. `decodableFromLevel` is computed, never hand-authored, so it cannot drift from the grapheme data.

### 6.1 Task types shipped in Level 1

| # | Name | Skill | Child does |
|---|---|---|---|
| 1 | **Sound Hunt** | `SOUND_ID` | Hears /s/, taps the letter among 2–4 |
| 2 | **Sound Singer** | `LETTER_SOUND` | Sees `s`, taps which of 3 voice buttons says it |
| 3 | **Word Builder** | `SEGMENT_SPELL` | Hears "sat", drags `s` `a` `t` tiles into slots |
| 4 | **Picture Match** | `BLEND_READ` | Reads `mat`, taps the matching picture of 3 |

Four task types is the minimum that satisfies the ≥2-task-types mastery rule for both sound skills and both word skills. Fewer, and mastery becomes unprovable.

### 6.2 Creatures

One Soundling per grapheme, named so that saying the name rehearses the sound: /s/ → Sisi, /a/ → Annie, /t/ → Tito, /p/ → Popo, /i/ → Indi, /m/ → Momo, /f/ → Fifi. Hatches on mastery. Lives on the island home screen, which doubles as the progress map.

The test is the name's **leading sound**, not its leading letter. An earlier draft of this spec had `/a/ → Ada`, which fails: "Ada" is AY-da, the letter *name*, which is the exact confusion phonics teaching exists to prevent. No automated test can check pronunciation, so any new creature name needs a human to say it aloud. `Pip` and `Mo` were also renamed — `Pip` collided with the decodable word `pip`, and both were too short to read as characters.

---

## 7. Screens

```
Boot
  └─ Who's playing?        profile picker — faces, no passwords
       └─ Island home      creature collection = progress map; big PLAY button
            ├─ Quest       the task runner
            │    └─ Results  stars, new creature, "that's enough for today"
            ├─ Level select  replay any started or completed level
            ├─ Trophy room   high scores, streaks, total sounds learned
            └─ Parent area   PIN-gated
```

### 7.1 Parent area

PIN-gated (four digits, set on first run). Contains:
- Per-sound mastery heatmap — which sounds are solid, shaky, not started
- Confusion pairs detected — "mixes up `m` and `n`"
- Time played, by day
- "Practise these in the car" — three specific words, no app required

This is a deliberate differentiator. Phonics Hero reports level progress; a parent wants to know *which sound their child can't hear*.

### 7.2 Save / resume

Progress persists per **task completion**, not per session. Force-quit mid-quest and the child resumes on the next task, with the remaining session plan intact (the plan is persisted with the session row, so resuming doesn't re-roll the quest and re-expose answers already seen).

"New game" and "save game" in the conventional sense map to: profiles are always auto-saved; "New game" = create a new child profile; level select covers replay.

---

## 8. Hints — three tiers, never punished

| Tier | Trigger | Behaviour |
|---|---|---|
| 1 | 4s idle | Target gently pulses; instruction audio repeats |
| 2 | first error, or 9s idle | Mnemonic animation plays (snake forms an `s`); distractors dim to leave 2 |
| 3 | second error | Correct answer shimmers; child taps it to continue; logged `scaffolded` |

Plus a permanent "?" owl button available on every task. Tapping it jumps straight to tier 2.

Asking for help carries **no penalty** — no star loss, no sad sound. Scaffolded answers advance the quest but do not count toward mastery (§5.2), so the learning data stays honest while the child's experience stays encouraging. This split is the point: we can be generous with the child *because* the engine is strict with the data.

---

## 9. Audio

Audio is the highest-risk asset category in a phonics product and the one most competitors get wrong.

### 9.1 Key indirection (build this now)

Curriculum references audio by **key**. A manifest maps keys to files.

```
curriculum:  grapheme 's' → audio.phoneme = "ph.s"
manifest:    "ph.s" → assets/voice/au-f1/ph.s.m4a
```

Swapping the entire voice pack — placeholder → self-recorded → professional → a second accent — is a manifest change. Zero code change, zero curriculum change. This costs nothing to build now and is expensive to retrofit.

### 9.2 AudioService

- Clips preloaded per session, bundled as app assets → fully offline
- A queue, not fire-and-forget: instruction audio never overlaps instruction audio
- Music ducks under speech
- Praise bank of 12+ randomised variants so praise never feels canned
- Honours mute and platform silent-switch conventions
- CI test fails the build if any curriculum entry references a key with no file

### 9.3 Voice sourcing (deferred decision)

**No TTS for isolated phonemes.** TTS renders /s/ as "ess" and /m/ as "em" — the exact opposite of what phonics teaches. Teachers and children detect it immediately.

Recommended default: **hybrid**.
- ~56 clips need a human: ~30 phonemes + 26 letter names. One ~30-minute session.
- ~180 clips can be AI: whole words, instructions, praise. AI handles these well.
- So human rates apply to ~23% of volume.

Indicative Level 1–3 costs (AUD): hybrid ~$200–400 one-off; freelance AU voice artist $400–800; professional talent plus studio $1,200–2,500. Full 26 levels: ~$800–1,500 hybrid, $3,000–6,000 fully human.

Cost traps to handle at contract time:
- Secure a **perpetual, worldwide, unlimited digital buyout including app embedding**. Per-use licensing on a long-lived app exceeds the recording cost.
- Lock curriculum data before booking. Re-recording incurs a fresh minimum fee.
- Record ~20% more words than the level needs, as cheap insurance.
- Confirm any AI vendor's terms permit commercial embedding (paid tiers generally do; free tiers generally do not).

**Until this is decided:** development uses clearly-flagged TTS placeholders. They are sufficient to review the game. They are not sufficient to put in front of a child, and the build must warn when a placeholder pack is active.

---

## 10. Data and offline

### 10.1 Tables

| Table | Notes |
|---|---|
| `parents` | maps to `auth.users` |
| `child_profiles` | name, avatar, current level, created_at |
| `levels` | seeded from `curriculum`; kept in DB only for reporting joins |
| `mastery_records` | one row per (profile, target, skill) |
| `sessions` | one per quest: plan, started_at, completed_at, stars, degraded flag |
| `task_attempts` | **append-only** — correct, latency, scaffolded, chosen distractor |
| `creatures_unlocked` | profile, grapheme, unlocked_at |
| `high_scores` | profile, level, best stars, best streak, fastest clean quest |

Row Level Security: a parent can read and write only rows belonging to their own `child_profiles`. Policies are part of the migration, not an afterthought.

### 10.2 Append-only attempts

`task_attempts` is never updated or deleted. Every dashboard metric, every confusion-pair analysis, and every future pacing experiment is derivable from it without a schema migration. It also means `mastery_records` is a cache: it can be rebuilt from the attempt log if the mastery algorithm changes — which it will, once real children use it.

### 10.3 Offline-first

The local store is the source of truth during play. Attempts are queued and synced opportunistically. Mastery is computed locally and reconciled server-side. A child on a plane, in a car, or in a school with bad wifi plays normally.

Conflict policy: `task_attempts` is append-only so it merges without conflict; `mastery_records` is derived, so on conflict the server recomputes from the merged attempt log rather than picking a winner.

---

## 11. Testing strategy

| Target | Approach |
|---|---|
| `packages/engine` | Test-first. Every §5.4 invariant and §5.6 guard is a named test. Property tests over random mastery states to assert invariants never break. |
| `packages/curriculum` | Data integrity: every word decodable at its level; every audio key resolves; no word uses an unintroduced grapheme; every grapheme has a creature; at least 8 words per level carry a `picture`. |
| Task components | Render, correct path, incorrect path, each hint tier, scaffolded completion. |
| `packages/api` | Offline queue: enqueue while offline, flush on reconnect, no duplicate attempts. |
| Simulation harness | Run synthetic children (fast / average / struggling / bad-day) through Level 1. **Ranges to be derived from the harness itself, then recorded here and in §5.7.1 as measured values alongside the config that produced them.** Once set, they are regression bounds with modest headroom — not aspirations. The prior entry here (fast 4–7, average 7–10, struggling 10–14) was invented and is withdrawn; it also disagreed with the plan's own numbers, which is how you can tell neither was measured. |

### 11.1 Not every child should complete Level 1 by playing more

The simulated "struggling" profile answered correctly 55% of the time. On a two-choice task chance is 50%, so that profile is a child performing at barely above guessing — and no amount of additional practice should let them pass a mastery gate, because they have not learned the material. An engine that eventually passed them would be lying to their parent.

So the struggling profile is redefined to **70%**: a child finding it genuinely hard but learning. That is the case the adaptive engine exists to serve, and it must complete, with materially more practice than a strong learner.

A child at or near chance is a different case, and the correct product response is not a longer quest. It is to tell the grown-up. Plan 2 adds a "needs a hand" signal to the parent area, raised when a child's accuracy on current-focus material stays near chance across several sessions. That is a feature, not a failure mode: a five-year-old stuck at guessing needs a person sitting with them, and the most useful thing the app can do is say so plainly instead of grinding them through another fourteen tasks.

Accordingly the harness asserts completion for fast, average and the redefined struggling profile, and asserts that a near-chance profile does not complete within a 40-quest cap (measured: 3 of 30 get through).

**But the gate is statistical, not a bright line, and an earlier draft of this section overclaimed.** Measured without a cap, 40 of 50 near-chance children eventually complete, at a mean of 72 quests. A child answering at 55% will pass any threshold built on counting correct answers, given enough attempts — and no such threshold can be made luck-proof, because every one of them is passable by trying often enough.

So the honest position: the mastery gate makes passing-by-luck *slow and unlikely in any realistic number of sessions*, and that is all it does. The thing that actually protects a child performing at chance is the product telling their grown-up, which is therefore **required rather than a nice-to-have**. A near-chance child grinding through seventy quests is a failure of the product even though the gate technically held for the first forty.
| Manual | iPad simulator, every review gate. |

---

## 12. Out of scope for v1

Voice recognition (architected, not built) · teacher and classroom features · handwriting and letter-formation tracing · Levels 2–26 content · monetisation and subscriptions · localisation beyond Australian English · push notifications.

---

## 13. Build order

| Step | Deliverable |
|---|---|
| 1 | Monorepo, Expo boot, Soft Paper design tokens |
| 2 | `curriculum` package — Level 1 data + integrity tests |
| 3 | `engine` package — mastery model, session builder, frustration guard, test-first |
| 4 | `audio` package — AudioService + flagged placeholder pack |
| 5 | Four task-type components |
| 6 | Quest runner + results screen — **REVIEW GATE: playable Level 1 on iPad simulator, no backend required** |
| 7 | Profile picker, island home, level select, trophy room |
| 8 | Supabase schema, RLS policies, offline sync |
| 9 | Parent area |

Steps 1–6 need no backend at all, which is why Supabase sits at step 8. If seeing saved games and high scores working *at* the review gate matters more than reaching it sooner, pull step 8 to step 4 — flagged as a deferred decision in §2.1.

---

## 14. Risks

| Risk | Mitigation |
|---|---|
| Mastery thresholds wrong — levels too long or too short | Simulation harness (§11) calibrates before real children; thresholds are config, not code |
| Placeholder audio misleads the review | Build banner whenever a placeholder pack is active; CI gate on missing keys |
| Engine complexity slows first playable | Engine is pure and test-first; it cannot block UI work, and UI can develop against a stub scheduler |
| "InitiaLit" is a MultiLit trademark | Align to the published scope and sequence (a sequence of facts), but use none of their materials, wording, readers, or branding. Describe the app as following the Australian synthetic phonics sequence. Legal review before any marketing copy. |
| Children's privacy (COPPA / Australian Privacy Act / GDPR-K) | Collect no child PII beyond a chosen first name and avatar. No analytics SDKs in the child experience. Parent email is the only contact data. Review before launch, not before review gate. |
| Picture assets for Picture Match are ambiguous to a 5-year-old | Test each picture with a child naming it unprompted before it ships; prefer concrete nouns |

---

## 15. Open questions

None blocking implementation planning. Deferred decisions are tracked in §2.1 with deadlines and defaults.
