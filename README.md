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
npm test          # 1183 tests
npm run typecheck
```

## What's here

| Package | What it does |
|---|---|
| `packages/curriculum` | Teaching content as pure data: graphemes, words, levels, creatures. Zero dependencies. |
| `packages/engine` | The adaptive engine — mastery model, session builder, frustration guard, distractor picker, simulation harness. Pure TypeScript, no React, no clock, no RNG. |
| `packages/ui` | Soft Paper design tokens. |
| `packages/audio` | Audio-key manifest and a queue that never overlaps speech. |
| `apps/game` | Expo app: profiles, island home, four mini-games, quest runner. |

`curriculum` and `engine` are deliberately pure so the adaptive logic — the part of this product that actually differentiates it — can be tested adversarially. It needed to be: simulation found a version of this engine where Level 1 **could not be completed at all**, while every unit test passed.

## Read this before changing anything

- **[The spec](docs/superpowers/specs/2026-10-10-soundlings-phonics-game-design.md)** — the design, and every decision's reasoning. It records what was got wrong as well as what was got right, because several things were only correct on the second or third attempt.
- **[The review gate](docs/REVIEW-GATE.md)** — what to try, what to listen for, and what is deliberately unfinished.
- **[Plan 1](docs/superpowers/plans/2026-10-10-soundlings-level-1.md)** and **[Plan 2](docs/superpowers/plans/2026-10-10-soundlings-plan-2-shell.md)** — the implementation plans, with amendment tables recording where the original instructions turned out to be wrong.

Three principles that look like fussiness and are not:

1. **Letters render in Andika**, an infant face with a single-storey `a`. A child cannot read the `a` in a system sans.
2. **Wrong answers dim; they never redden.** A five-year-old reads red as being told off.
3. **Hints are free.** A scaffolded win advances the quest but earns no mastery credit, so the game can be generous with a child while the data stays honest.

## Current state

Level 1 is playable end to end: profiles, the island, four mini-games, a fourteen-task quest, results, trophies.

Measured pacing, from the simulation harness over 30 synthetic children per profile:

| Learner | Quests to finish Level 1 |
|---|---|
| Strong | 12–19, mean 15 |
| Average | 15–33, mean 22 |
| Struggling | 17–45, mean 30 |

**Not done:** real voice, illustrated pictures, the parent dashboard, Supabase and cross-device sync, Levels 2–6, and a second mini-game per skill.

**Not verified by anyone:** nobody has heard the audio, and no child has played it. The voice pack is machine-generated placeholder and must be replaced before testing with a real child — see spec §9.3.

## Config worth knowing about

Almost everything about how the game feels is data, not code:

- `packages/curriculum/src/levels.ts` — which sounds, in what groups, in what order
- `packages/engine/src/config.ts` — how much evidence counts as knowing something, how fast it decays, how long a quest is
- `packages/engine/src/taskTypes.ts` — which mini-games exist and how hard each is

Change a pacing value and run `npx vitest run packages/engine/src/simulate.test.ts`; it will tell you what the change does to a real child's week.
