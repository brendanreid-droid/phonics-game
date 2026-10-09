# Soundlings — Design Spec

**Date:** 2026-10-10
**Status:** Approved for implementation planning
**Scope of this spec:** Core architecture + Level 1, playable and reviewable.

---

## 1. Product

A phonics reading game for 5-year-olds. Working title **Soundlings**.

A child plays a 5-minute "quest" of 12–15 short tasks. Each task teaches or tests one phonics skill against one target sound or word. Mastering a sound hatches a creature — a Soundling — whose name uses that sound. The creature collection *is* the progress map.

### 1.1 Goal

Beat [Phonics Hero](https://phonicshero.com/levels-of-learning-ls/), the market leader: 26 levels, 40 fixed games per level, six skill types, superhero-rescue narrative, ~3 years of content.

Where it is weak, and what we do instead:

| Phonics Hero | Soundlings |
|---|---|
| 40 fixed games per level, identical for every child | Level completes on proven mastery. Fast child ~5 quests, struggling child ~12. |
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

This is not an optimisation bolted on; it is how phonics actually works, and without it the arithmetic does not close. Isolated single-target crediting would require ~84 correct attempts to finish Level 1 — about 7 quests of flawless play, which would make us *slower* than the 40-game competitor we are trying to beat. With composite crediting, a strong child finishes in ~5 quests (~25 min) and a struggling child in ~12, with the extra time spent on review and scaffolding rather than on content they already know.

---

## 5. The mastery engine

### 5.1 Mastery record

One record per `(childProfileId, targetId, skill)`:

```ts
interface MasteryRecord {
  strength: number;        // 0..1, decayed on read
  halfLifeHours: number;
  lastSeenAt: number;
  correctCount: number;
  attemptCount: number;
  consecutiveCorrect: number;
  avgLatencyMs: number;
  taskTypesSeen: string[];       // mastery requires >= 2
  sessionsSeen: number;
  scaffoldedCount: number;       // scaffolded wins tracked but excluded from mastery
}
```

### 5.2 Decay and reinforcement

Strength is not stored as a current value; it is computed on read:

```
strength(now) = e^( -(now - lastSeenAt) / halfLifeHours )
```

On a correct, unscaffolded, non-slow attempt: `halfLifeHours *= growthFactor` (start 1.9, tapering as `correctCount` rises).
On an error: `halfLifeHours = max(minHalfLife, halfLifeHours * 0.4)` and `consecutiveCorrect = 0`.
On a scaffolded correct: no half-life change. The child was helped; nothing was proven.

"Slow" = latency above a per-task-type threshold. A slow correct answer reinforces at half rate. Recognition that is correct but effortful is not yet automatic, and automaticity is the actual goal of phonics practice.

### 5.3 Mastery predicate

Mastery is evaluated at **session-build time**, not immediately after an answer — otherwise condition 1 below is trivially satisfied by the attempt that was just made. The question the predicate answers is "could this child do it again today, cold?", which only has meaning after a gap.

A target is **mastered** for a skill when **all** hold:

1. `strength >= 0.8`
2. `correctCount >= 3` (unscaffolded; secondary credit counts as 0.5 — see §4.4)
3. `taskTypesSeen.length >= 2`
4. `sessionsSeen >= 2`

Conditions 3 and 4 are the important ones. (3) stops a child memorising the answer pattern of a single mini-game. (4) requires retention across a gap, not same-sitting recall.

### 5.4 Session builder

```ts
buildSession(profile, masteryRecords, level, now, rng): TaskInstance[]
```

Returns 12–15 task instances, composed:

| Band | Share | Selection |
|---|---|---|
| **Current focus** | 60% | Newest 1–2 unmastered graphemes in the level |
| **Due review** | 25% | Unmastered targets, ranked by `overdueness × (1 - strength)` |
| **Win-backs** | 15% | Mastered targets at high strength — guaranteed success |

Hard invariants, each covered by a unit test:

1. First task is a win-back. The child starts on a success.
2. Last task is a win-back. The child leaves on a success.
3. No two adjacent tasks share a task type.
4. At least one win-back in the middle third.
5. Every task's target is introduced at or before the child's current level.
6. Session length is within 12–15.
7. If fewer than 2 mastered targets exist (i.e. a brand-new child), win-backs are replaced by the lowest-difficulty task type on the current focus — never by a hard task.

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
| 3 errors on target | Abandon the task as scaffolded-complete. Insert a win-back. Cap remaining session difficulty at the child's demonstrated level. |
| 3 errors across 3 different targets in one session | Shorten session to 8 tasks, all low difficulty, end early on a win-back |

The last row is the "bad day" case — tired, unwell, distracted. The right response is a short, kind session, not a full quest of failure. Importantly, attempts in a degraded session still record normally, so the mastery data stays honest; we simply stop asking.

### 5.7 Level completion

Level 1 is complete when:
- All 7 graphemes mastered for `SOUND_ID` **and** `LETTER_SOUND`
- At least 8 Level-1 words mastered for `BLEND_READ`
- At least 6 Level-1 words mastered for `SEGMENT_SPELL`

Expected: ~5 quests (~25 min) for a fast learner, ~12 for a struggling learner. **That divergence is the feature.** Both children finish genuinely able to read the words, which a fixed 40-game playlist cannot promise.

These figures assume composite crediting (§4.4) and are calibrated by the simulation harness (§11), not asserted. If the harness shows a fast learner needing more than ~7 quests, the thresholds are wrong and get tuned — they are config values precisely so this is a data change, not a code change.

---

## 6. Level 1 content

Australian synthetic phonics sequence, Level 1: **s, a, t, p, i, m, f** — introduced two at a time (s,a → t,p → i,m → f).

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

One Soundling per grapheme, named using its own sound: /s/ → Sisi, /a/ → Ada, /t/ → Tito, /p/ → Pip, /i/ → Indi, /m/ → Mo, /f/ → Fifi. Hatches on mastery. Lives on the island home screen, which doubles as the progress map.

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
| Simulation harness | Run synthetic children (fast / average / struggling / bad-day) through Level 1; assert completion lands in the expected ranges — fast 4–7 quests, average 7–10, struggling 10–14. Catches pacing regressions no unit test would. |
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
