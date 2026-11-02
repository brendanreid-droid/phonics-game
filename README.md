# Soundlings

A phonics reading game for five-year-olds, built on the Australian synthetic phonics sequence.

A child completes a level when they can **prove they can read the words** — cold, a day later, unaided — not when they have played a fixed number of games.

## Run it

```bash
npm install
cd "apps/game" && npm run web
```

Then open <http://localhost:8081>.

On a real iPad — which is the version that counts for a children's app — install **Expo Go** from the App Store, run `npx expo start` from `apps/game`, and scan the QR code. No Xcode needed.

```bash
npm test          # 1787 tests
npm run typecheck
```

## What's here

| Package | What it does |
|---|---|
| `packages/curriculum` | Teaching content as pure data: graphemes, words, levels, creatures. Zero dependencies. |
| `packages/engine` | The adaptive engine — mastery model, session builder, frustration guard, distractor picker, simulation harness. Pure TypeScript, no React, no clock, no RNG. |
| `packages/api` | The sync layer over Supabase. `rebuild.ts` and `syncQueue.ts` are pure and decide whether a child's history survives; the rest moves data. |
| `packages/ui` | Soft Paper design tokens. |
| `packages/audio` | Audio-key manifest and a queue that never overlaps speech. |
| `apps/game` | Expo app: profiles, island home, nine mini-games, quest runner. |

`curriculum` and `engine` are deliberately pure so the adaptive logic — the part of this product that actually differentiates it — can be tested adversarially. It needed to be: simulation found a version of this engine where Level 1 **could not be completed at all**, while every unit test passed.

## Read this before changing anything

- **[The spec](docs/superpowers/specs/2026-10-10-soundlings-phonics-game-design.md)** — the design, and every decision's reasoning. It records what was got wrong as well as what was got right, because several things were only correct on the second or third attempt.
- **[The review gate](docs/REVIEW-GATE.md)** — what to try, what to listen for, and what is deliberately unfinished.
- **[Plan 1](docs/superpowers/plans/2026-10-10-soundlings-level-1.md)**, **[Plan 2](docs/superpowers/plans/2026-10-10-soundlings-plan-2-shell.md)** and **[Plan 6](docs/superpowers/plans/2026-10-15-soundlings-plan-6-teaching-sequence.md)** — the implementation plans, with amendment tables recording where the original instructions turned out to be wrong.
- **`npx vitest run packages/engine/src/trace.test.ts`** — prints the first ten quests a real child would be given, in order, and asserts the teaching order across them. The sequence was wrong for weeks while every test passed; this is the artefact that would have shown it.

Three principles that look like fussiness and are not:

1. **Letters render in Andika**, an infant face with a single-storey `a`. A child cannot read the `a` in a system sans.
2. **Wrong answers dim; they never redden.** A five-year-old reads red as being told off.
3. **Hints are free.** A scaffolded win advances the quest but earns no mastery credit, so the game can be generous with a child while the data stays honest.

## Current state

Level 1 is playable end to end: profiles, the island, **nine mini-games**, a fourteen-slot quest, results, trophies, and a PIN-gated parent area.

A quest now reads as a lesson rather than a shuffle. It opens on a guaranteed success, teaches a sound on a card with no right answer and nothing recorded, practises that sound, teaches the next, and mixes them. A word is read before it is spelt; a two-sound word comes before a three-sound one; oral blending — hearing /m/-/a/-/p/ as "map", with no letters on screen — runs from day one and is required to finish the level.

Measured pacing, re-measured 2026-11-02 from the simulation harness over 30 synthetic children per profile:

| Learner | Quests to finish Level 1 | Finished |
|---|---|---|
| Strong | 14–30, mean **23** | 30/30 |
| Average | 18–45, mean **29** | 30/30 |
| Struggling | 23–84, mean **47** | 30/30 |
| Guessing (55%) | — | **0/30** within 40 quests |

**The counts rose by a third to a half, and that is the point.** The old numbers were bought by skipping the teaching. About eight slots of every run are now teaching cards that earn no evidence at all, and reading and spelling are sequential instead of racing each other for slots. A child guessing at 55% used to get through occasionally; now none do.

Seven weeks of daily play for a struggling child is the figure to watch. It is roughly what a classroom takes over the same material, and it is also the number that decides whether a child who finds reading hard is still here at the end — which no simulation can answer.

**Sync:** optional parent sign-in keeps progress safe online and across devices. Only profiles, the attempt log and the level-completion latch sync; everything else is rebuilt from the log. The game never waits on the network. See the review gate for what was and was not verified.

**Not done:** real voice, illustrated artwork, Levels 2–6, `SAY_IT` voice tasks, and a signed-in run of the sync against the live Supabase project.

**The voice pack** is 69 clips, defined once in [`packages/audio/voice-script.txt`](packages/audio/voice-script.txt) with IPA and a delivery note per line. Three things read it, so they cannot drift apart:

| | |
|---|---|
| `./scripts/generate-placeholder-audio.sh` | macOS `say` stand-in. Ships today. Says "tuh" for /t/, which is wrong. |
| `./scripts/generate-voice-pack.sh` | Amazon Polly from the IPA, so /t/ is /t/. Needs your own AWS credentials; `DRY_RUN=1` prints the SSML and calls nothing. |
| `npm run generate:voice-script` | [docs/VOICE-SCRIPT.md](docs/VOICE-SCRIPT.md), the brief for whoever records the real pack. |

Synthetic speech is for building and demonstrating. Before any child uses this, a human records it — and **every phoneme is checked individually**, because two were wrong before and were caught by acoustic analysis rather than by ear.

**Not verified by anyone:** **no child has played it**, and the sync has not been run signed in against the real project. The pacing figures are simulated children, the pictures are emoji standing in for artwork, and the voice is machine-generated — usable for testing, but a human voice is needed before wider use. When it lands, check each phoneme individually: two were wrong before and were caught by acoustic analysis rather than by ear.

## Config worth knowing about

Almost everything about how the game feels is data, not code:

- `packages/curriculum/src/levels.ts` — which sounds, in what groups, in what order
- `packages/engine/src/config.ts` — how much evidence counts as knowing something, how fast it decays, how long a quest is
- `packages/engine/src/taskTypes.ts` — which mini-games exist and how hard each is

Change a pacing value and run `npx vitest run packages/engine/src/simulate.test.ts`; it will tell you what the change does to a real child's week.
