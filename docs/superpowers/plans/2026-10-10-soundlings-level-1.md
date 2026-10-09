# Soundlings Level 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a playable, mastery-adaptive Level 1 of the Soundlings phonics game, runnable on an iPad simulator with no backend.

**Architecture:** An npm-workspaces monorepo. Two pure-TypeScript packages — `curriculum` (teaching content) and `engine` (mastery model, session builder, frustration guard) — carry all the logic and are developed test-first with Vitest. An Expo React Native app consumes them and renders four mini-games. Progress persists to device storage via a repository interface, so swapping in Supabase later touches one file.

**Tech Stack:** TypeScript 5.6 (strict), npm workspaces, Vitest, Expo SDK 54 + expo-router, expo-audio, React Native, AsyncStorage, macOS `say` for placeholder voice assets.

**Spec:** `docs/superpowers/specs/2026-10-10-soundlings-phonics-game-design.md`

**Scope:** Spec build-order steps 1–6. Ends at the review gate: playable Level 1 on an iPad simulator. Profile picker, island home, trophy room, Supabase and the parent area are Plan 2.

---

## Conventions for the engineer

You are assumed to be a competent developer who has never seen this codebase and does not know phonics. A few things that will otherwise bite you:

- **A grapheme is a letter or letter-group; a phoneme is the sound it makes.** `s` is a grapheme; `/s/` is a phoneme. "Say the sound, not the letter name" is the whole discipline here — `/s/` is "sss", never "ess".
- **Never touch a test's expected value to make it pass.** If a test about pacing fails, the config is wrong, not the test. Config lives in `packages/engine/src/config.ts` precisely so tuning is a data change.
- **`packages/curriculum` and `packages/engine` must stay pure.** No React, no network, no `Date.now()`, no `Math.random()`. Time and randomness are injected. There is a test that enforces this; do not delete it.
- **Commit after every task.** Each task ends in a green test run and a commit.
- Run all package tests with `npm test` from the repo root.

---

## File structure

### `packages/curriculum` — pure data, zero dependencies
| File | Responsibility |
|---|---|
| `src/types.ts` | All curriculum types and the `Skill` union |
| `src/graphemes.ts` | Level 1 grapheme data (s a t p i m f) |
| `src/words.ts` | Word seeds + derivation of `decodableFromLevel` |
| `src/trickyWords.ts` | Non-decodable words taught whole |
| `src/creatures.ts` | One Soundling per grapheme |
| `src/levels.ts` | Level definitions and introduction order |
| `src/index.ts` | Public lookups — the only thing consumers import |
| `src/purity.test.ts` | Asserts the package has no dependencies and no React/network imports |
| `src/integrity.test.ts` | Asserts the content itself is pedagogically valid |

### `packages/engine` — pure logic, depends only on curriculum types
| File | Responsibility |
|---|---|
| `src/types.ts` | `MasteryRecord`, `Attempt`, `TaskInstance`, maps |
| `src/config.ts` | Every tunable number in one place |
| `src/rng.ts` | Seeded deterministic RNG |
| `src/mastery.ts` | Decay, reinforcement, the mastery predicate |
| `src/taskTypes.ts` | Task-type metadata (no components) |
| `src/distractors.ts` | Wrong-answer selection from the child's own confusions |
| `src/sessionBuilder.ts` | Composes one quest and enforces its invariants |
| `src/frustration.ts` | In-session error tracking and scaffolding directives |
| `src/completion.ts` | Level progress and completion |
| `src/simulate.ts` | Synthetic-child harness used to calibrate pacing |
| `src/index.ts` | Public surface |

### `packages/ui` — design tokens
| File | Responsibility |
|---|---|
| `src/tokens.ts` | Soft Paper colours, spacing, radii, type scale |

### `packages/audio` — audio keys to sound
| File | Responsibility |
|---|---|
| `src/manifest.json` | Generated: audio key → asset path |
| `src/manifest.ts` | Typed accessor over the manifest |
| `src/AudioService.ts` | Queued, non-overlapping playback |
| `src/manifest.test.ts` | Asserts every curriculum audio key resolves to a real file |

### `apps/game` — Expo app
| File | Responsibility |
|---|---|
| `app/_layout.tsx` | Root navigation stack |
| `app/index.tsx` | Temporary entry screen with a Play button |
| `app/quest.tsx` | Quest runner — the orchestrator |
| `app/results.tsx` | End-of-quest screen |
| `src/tasks/TaskFrame.tsx` | Shared task chrome: prompt, hint owl, progress pips, hint timers |
| `src/tasks/SoundHunt.tsx` | `SOUND_ID` mini-game |
| `src/tasks/SoundSinger.tsx` | `LETTER_SOUND` mini-game |
| `src/tasks/WordBuilder.tsx` | `SEGMENT_SPELL` mini-game |
| `src/tasks/PictureMatch.tsx` | `BLEND_READ` mini-game |
| `src/tasks/registry.ts` | Maps task-type ids to components |
| `src/data/ProgressRepo.ts` | Repository interface + AsyncStorage implementation |
| `scripts/generate-placeholder-audio.sh` | Builds the placeholder voice pack |

---

## Task 1: Monorepo scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `vitest.config.ts`
- Create: `packages/curriculum/package.json`
- Create: `packages/curriculum/tsconfig.json`

- [ ] **Step 1: Create the root `package.json`**

```json
{
  "name": "soundlings",
  "private": true,
  "version": "0.1.0",
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -p tsconfig.base.json --noEmit"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "typescript": "^5.6.3",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "declaration": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["node"]
  },
  "include": ["packages/*/src/**/*.ts"]
}
```

Note: `noUncheckedIndexedAccess` is deliberately off. It is good practice in general but it would force non-null assertions through every array access in the session builder, which makes the scheduling logic harder to read than the bugs it prevents. Array bounds in this codebase are covered by the invariant tests instead.

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 4: Create `packages/curriculum/package.json`**

The empty `dependencies` object is load-bearing — a test asserts it stays empty.

```json
{
  "name": "@soundlings/curriculum",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "dependencies": {}
}
```

- [ ] **Step 5: Create `packages/curriculum/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 6: Install and verify the toolchain**

Run: `npm install`
Expected: completes, creates `node_modules/` and `package-lock.json`.

Run: `npx vitest run`
Expected: exits 0 with "No test files found" — the harness works and there is nothing to run yet.

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.base.json vitest.config.ts packages/curriculum/package.json packages/curriculum/tsconfig.json package-lock.json
git commit -m "chore: scaffold npm workspaces monorepo with vitest"
```

---

## Task 2: Curriculum types

**Files:**
- Create: `packages/curriculum/src/types.ts`

There is no test in this task — it declares types only, and types are exercised by the tasks that follow. Resist the urge to invent a test that asserts a type exists.

- [ ] **Step 1: Write `packages/curriculum/src/types.ts`**

```ts
/** A written unit: one letter or a letter group. "s", "sh", "ck". */
export type GraphemeId = string;

/** A spoken sound, written between slashes by convention: "/s/". */
export type PhonemeId = string;

/** A whole word, lowercase except proper nouns: "sat", "Sam". */
export type WordId = string;

/** Anything mastery can be tracked against. */
export type TargetId = GraphemeId | WordId;

/**
 * The six synthetic-phonics skills, plus SAY_IT which is declared now and
 * implemented post-v1. Declaring it early means adding voice tasks later is
 * configuration, not a refactor of every mastery record.
 */
export const SKILLS = [
  'SOUND_ID',
  'LETTER_SOUND',
  'BLEND_READ',
  'SEGMENT_SPELL',
  'TRICKY_READ',
  'TRICKY_SPELL',
  'SENTENCE_READ',
  'SAY_IT',
] as const;

export type Skill = (typeof SKILLS)[number];

export interface Grapheme {
  id: GraphemeId;
  /** The sound this grapheme makes in Level 1 words. */
  phoneme: PhonemeId;
  /** How the letter is *named*, not sounded: "ess". Used sparingly. */
  letterName: string;
  /** Picture cue a child is taught alongside the sound. */
  mnemonic: string;
  /** Stand-in art for the mnemonic until illustrated. */
  mnemonicEmoji: string;
  /** Audio KEYS, never file paths. See packages/audio. */
  audio: { phoneme: string; letterName: string };
  introducedInLevel: number;
  /** Teaching order within the whole scheme. Lower is taught earlier. */
  sequenceIndex: number;
  /**
   * Graphemes children commonly confuse with this one. Seeds the distractor
   * picker. May reference graphemes from later levels; the picker filters to
   * what the child has actually met.
   */
  confusableWith: GraphemeId[];
}

/** A word as authored. `decodableFromLevel` is derived, never hand-written. */
export type WordSeed = Omit<Word, 'decodableFromLevel'>;

export interface Word {
  id: WordId;
  /** The graphemes in order. Drives Word Builder's slots. */
  graphemes: GraphemeId[];
  pattern: 'vc' | 'cv' | 'cvc';
  /**
   * Stand-in art. ABSENT for function words (at, am, if, it) which cannot be
   * pictured. Picture Match filters on this field rather than a maintained list.
   */
  picture?: string;
  audio: string;
  /** Lowest level at which every one of this word's graphemes has been taught. */
  decodableFromLevel: number;
}

/** A word that cannot be sounded out yet and is taught as a whole shape. */
export interface TrickyWord {
  id: WordId;
  audio: string;
  introducedInLevel: number;
  /** Why it is tricky. Shown in the parent area, not to the child. */
  reason: string;
}

export interface Creature {
  id: string;
  /** Name uses the grapheme's own sound, so the reward rehearses the lesson. */
  name: string;
  graphemeId: GraphemeId;
  emoji: string;
}

export interface Level {
  number: number;
  name: string;
  graphemeIds: GraphemeId[];
  /** Graphemes are introduced in these small groups, in order. */
  introductionGroups: GraphemeId[][];
  trickyWordIds: WordId[];
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc -p packages/curriculum/tsconfig.json --noEmit`
Expected: no output, exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/curriculum/src/types.ts
git commit -m "feat(curriculum): add curriculum types and skill union"
```

---

## Task 3: Level 1 graphemes

**Files:**
- Create: `packages/curriculum/src/graphemes.ts`
- Test: `packages/curriculum/src/graphemes.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/curriculum/src/graphemes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { GRAPHEMES, GRAPHEME_LIST } from './graphemes';

describe('Level 1 graphemes', () => {
  it('contains exactly the Level 1 sequence s a t p i m f', () => {
    expect(GRAPHEME_LIST.map((g) => g.id)).toEqual(['s', 'a', 't', 'p', 'i', 'm', 'f']);
  });

  it('keys the record by grapheme id', () => {
    for (const g of GRAPHEME_LIST) {
      expect(GRAPHEMES[g.id]).toBe(g);
    }
  });

  it('gives every grapheme a distinct sequence index in list order', () => {
    expect(GRAPHEME_LIST.map((g) => g.sequenceIndex)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('gives every grapheme both phoneme and letter-name audio keys', () => {
    for (const g of GRAPHEME_LIST) {
      expect(g.audio.phoneme).toBe(`ph.${g.id}`);
      expect(g.audio.letterName).toBe(`ln.${g.id}`);
    }
  });

  it('never lists a grapheme as confusable with itself', () => {
    for (const g of GRAPHEME_LIST) {
      expect(g.confusableWith).not.toContain(g.id);
    }
  });

  it('gives every grapheme a mnemonic and stand-in art', () => {
    for (const g of GRAPHEME_LIST) {
      expect(g.mnemonic.length).toBeGreaterThan(0);
      expect(g.mnemonicEmoji.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/curriculum/src/graphemes.test.ts`
Expected: FAIL — `Failed to resolve import "./graphemes"`.

- [ ] **Step 3: Write the implementation**

Create `packages/curriculum/src/graphemes.ts`:

```ts
import type { Grapheme, GraphemeId } from './types';

/**
 * Level 1 of the Australian synthetic phonics sequence: s, a, t, p, i, m, f.
 *
 * This order is not arbitrary and must not be "tidied" alphabetically. These
 * seven graphemes are taught first because they combine into a large number of
 * real CVC words (sat, pat, tap, pit, mat, map...), so a child can read actual
 * words within their first few sessions rather than reciting isolated letters.
 *
 * `confusableWith` may name graphemes from later levels (n, d, b, v). The
 * distractor picker filters to graphemes the child has met, so listing them
 * early is free and pays off at Level 2.
 */
export const GRAPHEME_LIST: Grapheme[] = [
  {
    id: 's',
    phoneme: '/s/',
    letterName: 'ess',
    mnemonic: 'snake',
    mnemonicEmoji: '🐍',
    audio: { phoneme: 'ph.s', letterName: 'ln.s' },
    introducedInLevel: 1,
    sequenceIndex: 0,
    confusableWith: ['f', 'z'],
  },
  {
    id: 'a',
    phoneme: '/a/',
    letterName: 'ay',
    mnemonic: 'apple',
    mnemonicEmoji: '🍎',
    audio: { phoneme: 'ph.a', letterName: 'ln.a' },
    introducedInLevel: 1,
    sequenceIndex: 1,
    confusableWith: ['i', 'e', 'u'],
  },
  {
    id: 't',
    phoneme: '/t/',
    letterName: 'tee',
    mnemonic: 'teddy',
    mnemonicEmoji: '🧸',
    audio: { phoneme: 'ph.t', letterName: 'ln.t' },
    introducedInLevel: 1,
    sequenceIndex: 2,
    confusableWith: ['p', 'd', 'f'],
  },
  {
    id: 'p',
    phoneme: '/p/',
    letterName: 'pee',
    mnemonic: 'pig',
    mnemonicEmoji: '🐷',
    audio: { phoneme: 'ph.p', letterName: 'ln.p' },
    introducedInLevel: 1,
    sequenceIndex: 3,
    confusableWith: ['t', 'b', 'd'],
  },
  {
    id: 'i',
    phoneme: '/i/',
    letterName: 'eye',
    mnemonic: 'insect',
    mnemonicEmoji: '🐛',
    audio: { phoneme: 'ph.i', letterName: 'ln.i' },
    introducedInLevel: 1,
    sequenceIndex: 4,
    confusableWith: ['a', 'e'],
  },
  {
    id: 'm',
    phoneme: '/m/',
    letterName: 'em',
    mnemonic: 'moon',
    mnemonicEmoji: '🌙',
    audio: { phoneme: 'ph.m', letterName: 'ln.m' },
    introducedInLevel: 1,
    sequenceIndex: 5,
    confusableWith: ['n', 'w'],
  },
  {
    id: 'f',
    phoneme: '/f/',
    letterName: 'ef',
    mnemonic: 'fish',
    mnemonicEmoji: '🐟',
    audio: { phoneme: 'ph.f', letterName: 'ln.f' },
    introducedInLevel: 1,
    sequenceIndex: 6,
    confusableWith: ['s', 'v', 'th'],
  },
];

export const GRAPHEMES: Record<GraphemeId, Grapheme> = Object.fromEntries(
  GRAPHEME_LIST.map((g) => [g.id, g]),
);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/curriculum/src/graphemes.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/curriculum/src/graphemes.ts packages/curriculum/src/graphemes.test.ts
git commit -m "feat(curriculum): add Level 1 graphemes s a t p i m f"
```

---

## Task 4: Words and derived decodability

**Files:**
- Create: `packages/curriculum/src/words.ts`
- Test: `packages/curriculum/src/words.test.ts`

Two content decisions in this task that look like omissions and are not:

**`as` and `is` are excluded from the decodable words.** In both, the letter `s` says `/z/`, not `/s/`. Presenting them as sound-it-out words actively teaches a falsehood, and a child who sounds `is` as "iss" has been failed by the app. They go in Task 5 as tricky words.

**Function words carry no `picture`.** You cannot draw "at". Picture Match filters on the presence of `picture`, so this is enforced by the type rather than by anyone remembering.

- [ ] **Step 1: Write the failing test**

Create `packages/curriculum/src/words.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { GRAPHEMES } from './graphemes';
import { WORDS, WORD_LIST, PICTURABLE_WORD_LIST } from './words';

describe('words', () => {
  it('keys the record by word id', () => {
    for (const w of WORD_LIST) {
      expect(WORDS[w.id]).toBe(w);
    }
  });

  it('has no duplicate ids', () => {
    const ids = WORD_LIST.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('spells every word from its own grapheme sequence', () => {
    for (const w of WORD_LIST) {
      expect(w.graphemes.join('')).toBe(w.id.toLowerCase());
    }
  });

  it('only uses graphemes that exist', () => {
    for (const w of WORD_LIST) {
      for (const g of w.graphemes) {
        expect(GRAPHEMES[g], `${w.id} uses unknown grapheme ${g}`).toBeDefined();
      }
    }
  });

  it('derives decodableFromLevel as the latest grapheme introduction', () => {
    for (const w of WORD_LIST) {
      const expected = Math.max(...w.graphemes.map((g) => GRAPHEMES[g].introducedInLevel));
      expect(w.decodableFromLevel, w.id).toBe(expected);
    }
  });

  it('gives every word an audio key matching its id', () => {
    for (const w of WORD_LIST) {
      expect(w.audio).toBe(`wd.${w.id.toLowerCase()}`);
    }
  });

  it('excludes the /z/ words "as" and "is" — their s does not say /s/', () => {
    expect(WORDS['as']).toBeUndefined();
    expect(WORDS['is']).toBeUndefined();
  });

  it('matches the declared pattern to the grapheme count', () => {
    for (const w of WORD_LIST) {
      expect(w.graphemes.length, w.id).toBe(w.pattern.length);
    }
  });

  it('offers at least 8 picturable Level 1 words, so Picture Match has headroom', () => {
    const level1 = PICTURABLE_WORD_LIST.filter((w) => w.decodableFromLevel === 1);
    expect(level1.length).toBeGreaterThanOrEqual(8);
  });

  it('never gives a function word a picture', () => {
    for (const id of ['at', 'am', 'if', 'it']) {
      expect(WORDS[id].picture, id).toBeUndefined();
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/curriculum/src/words.test.ts`
Expected: FAIL — `Failed to resolve import "./words"`.

- [ ] **Step 3: Write the implementation**

Create `packages/curriculum/src/words.ts`:

```ts
import { GRAPHEMES } from './graphemes';
import type { Word, WordId, WordSeed } from './types';

/**
 * Level 1 words, buildable from s a t p i m f.
 *
 * Deliberately absent: "as" and "is". The `s` in both says /z/, so teaching
 * them as decodable would teach a child to sound "is" as "iss". They are
 * tricky words — see trickyWords.ts.
 *
 * `picture` is a stand-in emoji pending real illustration. It is present only
 * where a five-year-old can reliably name the image unprompted; that is the
 * acceptance test for the real artwork too (see spec §14). Function words and
 * ambiguous pictures (sat vs sit, tip) are intentionally picture-less and so
 * never appear in Picture Match.
 */
const SEEDS: WordSeed[] = [
  // Function words — no picture possible.
  { id: 'at', graphemes: ['a', 't'], pattern: 'vc', audio: 'wd.at' },
  { id: 'am', graphemes: ['a', 'm'], pattern: 'vc', audio: 'wd.am' },
  { id: 'if', graphemes: ['i', 'f'], pattern: 'vc', audio: 'wd.if' },
  { id: 'it', graphemes: ['i', 't'], pattern: 'vc', audio: 'wd.it' },

  // CVC words with reliable pictures.
  { id: 'pat', graphemes: ['p', 'a', 't'], pattern: 'cvc', picture: '🐶', audio: 'wd.pat' },
  { id: 'tap', graphemes: ['t', 'a', 'p'], pattern: 'cvc', picture: '🚰', audio: 'wd.tap' },
  { id: 'pit', graphemes: ['p', 'i', 't'], pattern: 'cvc', picture: '🕳️', audio: 'wd.pit' },
  { id: 'sit', graphemes: ['s', 'i', 't'], pattern: 'cvc', picture: '🪑', audio: 'wd.sit' },
  { id: 'sip', graphemes: ['s', 'i', 'p'], pattern: 'cvc', picture: '🥤', audio: 'wd.sip' },
  { id: 'pip', graphemes: ['p', 'i', 'p'], pattern: 'cvc', picture: '🌰', audio: 'wd.pip' },
  { id: 'fat', graphemes: ['f', 'a', 't'], pattern: 'cvc', picture: '🐷', audio: 'wd.fat' },
  { id: 'fit', graphemes: ['f', 'i', 't'], pattern: 'cvc', picture: '💪', audio: 'wd.fit' },
  { id: 'mat', graphemes: ['m', 'a', 't'], pattern: 'cvc', picture: '🧘', audio: 'wd.mat' },
  { id: 'map', graphemes: ['m', 'a', 'p'], pattern: 'cvc', picture: '🗺️', audio: 'wd.map' },

  // CVC words without a reliable picture — still used for spelling and blending.
  { id: 'sat', graphemes: ['s', 'a', 't'], pattern: 'cvc', audio: 'wd.sat' },
  { id: 'tip', graphemes: ['t', 'i', 'p'], pattern: 'cvc', audio: 'wd.tip' },
  { id: 'sap', graphemes: ['s', 'a', 'p'], pattern: 'cvc', audio: 'wd.sap' },
  { id: 'Sam', graphemes: ['s', 'a', 'm'], pattern: 'cvc', audio: 'wd.sam' },
  { id: 'Pam', graphemes: ['p', 'a', 'm'], pattern: 'cvc', audio: 'wd.pam' },
];

function decodableFromLevel(seed: WordSeed): number {
  return Math.max(...seed.graphemes.map((g) => GRAPHEMES[g].introducedInLevel));
}

export const WORD_LIST: Word[] = SEEDS.map((seed) => ({
  ...seed,
  decodableFromLevel: decodableFromLevel(seed),
}));

export const WORDS: Record<WordId, Word> = Object.fromEntries(
  WORD_LIST.map((w) => [w.id, w]),
);

/** Words usable in Picture Match. */
export const PICTURABLE_WORD_LIST: Word[] = WORD_LIST.filter((w) => w.picture !== undefined);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/curriculum/src/words.test.ts`
Expected: PASS, 10 tests. The picturable count is 10 against a requirement of 8.

- [ ] **Step 5: Commit**

```bash
git add packages/curriculum/src/words.ts packages/curriculum/src/words.test.ts
git commit -m "feat(curriculum): add Level 1 words with derived decodability"
```

---

## Task 5: Tricky words, creatures, levels, and the public API

**Files:**
- Create: `packages/curriculum/src/trickyWords.ts`
- Create: `packages/curriculum/src/creatures.ts`
- Create: `packages/curriculum/src/levels.ts`
- Create: `packages/curriculum/src/index.ts`
- Test: `packages/curriculum/src/integrity.test.ts`
- Test: `packages/curriculum/src/purity.test.ts`

- [ ] **Step 1: Write the failing integrity test**

Create `packages/curriculum/src/integrity.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  CREATURES,
  GRAPHEMES,
  GRAPHEME_LIST,
  LEVELS,
  TRICKY_WORDS,
  WORDS,
  getLevel,
  graphemesForLevel,
  picturableWordsForLevel,
  wordsForLevel,
} from './index';

describe('curriculum integrity', () => {
  it('gives every grapheme exactly one creature', () => {
    for (const g of GRAPHEME_LIST) {
      const matches = Object.values(CREATURES).filter((c) => c.graphemeId === g.id);
      expect(matches.length, `grapheme ${g.id}`).toBe(1);
    }
  });

  it('names each creature using its own grapheme, so the reward rehearses the lesson', () => {
    for (const creature of Object.values(CREATURES)) {
      expect(
        creature.name.toLowerCase().startsWith(creature.graphemeId),
        `${creature.name} should start with "${creature.graphemeId}"`,
      ).toBe(true);
    }
  });

  it('lists only known graphemes in each level', () => {
    for (const level of LEVELS) {
      for (const id of level.graphemeIds) {
        expect(GRAPHEMES[id], `level ${level.number} grapheme ${id}`).toBeDefined();
      }
    }
  });

  it('covers every level grapheme exactly once across its introduction groups', () => {
    for (const level of LEVELS) {
      const flattened = level.introductionGroups.flat();
      expect(flattened.slice().sort()).toEqual(level.graphemeIds.slice().sort());
      expect(new Set(flattened).size).toBe(flattened.length);
    }
  });

  it('lists only known tricky words in each level', () => {
    for (const level of LEVELS) {
      for (const id of level.trickyWordIds) {
        expect(TRICKY_WORDS[id], `level ${level.number} tricky word ${id}`).toBeDefined();
      }
    }
  });

  it('never lets a word require a grapheme the child has not met', () => {
    for (const level of LEVELS) {
      const taught = new Set(graphemesForLevel(level.number).map((g) => g.id));
      for (const word of wordsForLevel(level.number)) {
        for (const g of word.graphemes) {
          expect(taught.has(g), `${word.id} needs ${g}, not taught by level ${level.number}`).toBe(true);
        }
      }
    }
  });

  it('gives every level at least 8 picturable words', () => {
    for (const level of LEVELS) {
      expect(picturableWordsForLevel(level.number).length, `level ${level.number}`)
        .toBeGreaterThanOrEqual(8);
    }
  });

  it('never marks a word as both decodable and tricky', () => {
    for (const id of Object.keys(TRICKY_WORDS)) {
      expect(WORDS[id], `${id} is in both lists`).toBeUndefined();
    }
  });

  it('returns Level 1 by number', () => {
    expect(getLevel(1).graphemeIds).toEqual(['s', 'a', 't', 'p', 'i', 'm', 'f']);
  });

  it('throws on an unknown level rather than returning undefined', () => {
    expect(() => getLevel(99)).toThrow(/unknown level/i);
  });
});
```

- [ ] **Step 2: Write the failing purity test**

Create `packages/curriculum/src/purity.test.ts`:

```ts
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname);
const PKG = join(__dirname, '..', 'package.json');

/**
 * The curriculum package must stay pure data. If this test fails, do not
 * delete it — move whatever you were adding into packages/api or apps/game.
 */
describe('curriculum purity', () => {
  it('declares no runtime dependencies', () => {
    const pkg = JSON.parse(readFileSync(PKG, 'utf8')) as { dependencies?: Record<string, string> };
    expect(pkg.dependencies ?? {}).toEqual({});
  });

  it('imports no React, network client, or filesystem module', () => {
    const banned = [/from ['"]react/, /from ['"]react-native/, /from ['"]node:fs/, /\bfetch\(/, /from ['"]axios/];
    const files = readdirSync(SRC).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    for (const file of files) {
      const source = readFileSync(join(SRC, file), 'utf8');
      for (const pattern of banned) {
        expect(pattern.test(source), `${file} matches ${pattern}`).toBe(false);
      }
    }
  });

  it('reads neither the clock nor the global RNG', () => {
    const files = readdirSync(SRC).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    for (const file of files) {
      const source = readFileSync(join(SRC, file), 'utf8');
      expect(source.includes('Date.now()'), `${file} reads the clock`).toBe(false);
      expect(source.includes('Math.random()'), `${file} reads the global RNG`).toBe(false);
    }
  });
});
```

- [ ] **Step 3: Run both tests to verify they fail**

Run: `npx vitest run packages/curriculum/src/integrity.test.ts packages/curriculum/src/purity.test.ts`
Expected: integrity FAILS with `Failed to resolve import "./index"`; purity FAILS on the dependencies assertion only if `package.json` is wrong — it should already pass, which is fine.

- [ ] **Step 4: Write `packages/curriculum/src/trickyWords.ts`**

```ts
import type { TrickyWord, WordId } from './types';

/**
 * Words a Level 1 child cannot sound out with s a t p i m f. Taught as whole
 * shapes. `reason` is surfaced in the parent area so a grown-up can explain
 * why the usual "sound it out" advice does not apply here.
 */
export const TRICKY_WORD_LIST: TrickyWord[] = [
  { id: 'I', audio: 'wd.i_pronoun', introducedInLevel: 1, reason: 'The letter i says its name, not /i/.' },
  { id: 'the', audio: 'wd.the', introducedInLevel: 1, reason: 'Contains th and a weak vowel, neither taught yet.' },
  { id: 'a', audio: 'wd.a_word', introducedInLevel: 1, reason: 'As a word it says /uh/, not /a/.' },
  { id: 'as', audio: 'wd.as', introducedInLevel: 1, reason: 'The s says /z/.' },
  { id: 'is', audio: 'wd.is', introducedInLevel: 1, reason: 'The s says /z/.' },
];

export const TRICKY_WORDS: Record<WordId, TrickyWord> = Object.fromEntries(
  TRICKY_WORD_LIST.map((w) => [w.id, w]),
);
```

- [ ] **Step 5: Write `packages/curriculum/src/creatures.ts`**

```ts
import type { Creature } from './types';

/**
 * One Soundling per grapheme. Each name begins with its own grapheme so that
 * saying the creature's name rehearses the sound the child just mastered — the
 * reward is the lesson, not a sticker bolted onto it.
 */
export const CREATURE_LIST: Creature[] = [
  { id: 'sisi', name: 'Sisi', graphemeId: 's', emoji: '🐍' },
  { id: 'ada', name: 'Ada', graphemeId: 'a', emoji: '🍎' },
  { id: 'tito', name: 'Tito', graphemeId: 't', emoji: '🧸' },
  { id: 'popo', name: 'Popo', graphemeId: 'p', emoji: '🐷' },
  { id: 'indi', name: 'Indi', graphemeId: 'i', emoji: '🐛' },
  { id: 'momo', name: 'Momo', graphemeId: 'm', emoji: '🌙' },
  { id: 'fifi', name: 'Fifi', graphemeId: 'f', emoji: '🐟' },
];

export const CREATURES: Record<string, Creature> = Object.fromEntries(
  CREATURE_LIST.map((c) => [c.id, c]),
);
```

- [ ] **Step 6: Write `packages/curriculum/src/levels.ts`**

```ts
import type { Level } from './types';

export const LEVELS: Level[] = [
  {
    number: 1,
    name: 'Island of First Sounds',
    graphemeIds: ['s', 'a', 't', 'p', 'i', 'm', 'f'],
    // Two at a time, so a child always has a small, finishable front.
    introductionGroups: [['s', 'a'], ['t', 'p'], ['i', 'm'], ['f']],
    trickyWordIds: ['I', 'the', 'a'],
  },
];
```

Note that `as` and `is` exist as tricky words but are not introduced in Level 1 — they are available for Level 2 without needing a data change.

- [ ] **Step 7: Write `packages/curriculum/src/index.ts`**

```ts
export * from './types';
export { GRAPHEMES, GRAPHEME_LIST } from './graphemes';
export { WORDS, WORD_LIST, PICTURABLE_WORD_LIST } from './words';
export { TRICKY_WORDS, TRICKY_WORD_LIST } from './trickyWords';
export { CREATURES, CREATURE_LIST } from './creatures';
export { LEVELS } from './levels';

import { GRAPHEME_LIST } from './graphemes';
import { LEVELS } from './levels';
import { CREATURE_LIST } from './creatures';
import { PICTURABLE_WORD_LIST, WORD_LIST } from './words';
import type { Creature, Grapheme, GraphemeId, Level, Word } from './types';

export function getLevel(levelNumber: number): Level {
  const level = LEVELS.find((l) => l.number === levelNumber);
  if (!level) throw new Error(`Unknown level: ${levelNumber}`);
  return level;
}

/** Every grapheme taught at or before `levelNumber`, in teaching order. */
export function graphemesForLevel(levelNumber: number): Grapheme[] {
  return GRAPHEME_LIST.filter((g) => g.introducedInLevel <= levelNumber).sort(
    (a, b) => a.sequenceIndex - b.sequenceIndex,
  );
}

/** Every decodable word available at or before `levelNumber`. */
export function wordsForLevel(levelNumber: number): Word[] {
  return WORD_LIST.filter((w) => w.decodableFromLevel <= levelNumber);
}

/** Words at or before `levelNumber` that carry a picture. */
export function picturableWordsForLevel(levelNumber: number): Word[] {
  return PICTURABLE_WORD_LIST.filter((w) => w.decodableFromLevel <= levelNumber);
}

export function creatureForGrapheme(graphemeId: GraphemeId): Creature {
  const creature = CREATURE_LIST.find((c) => c.graphemeId === graphemeId);
  if (!creature) throw new Error(`No creature for grapheme: ${graphemeId}`);
  return creature;
}

/**
 * The introduction group a grapheme belongs to, zero-indexed. Used by the
 * session builder to decide what counts as "current" versus "review".
 */
export function introductionGroupIndex(levelNumber: number, graphemeId: GraphemeId): number {
  const groups = getLevel(levelNumber).introductionGroups;
  const index = groups.findIndex((group) => group.includes(graphemeId));
  if (index === -1) throw new Error(`Grapheme ${graphemeId} is not in level ${levelNumber}`);
  return index;
}

/** Every audio key the curriculum references. Used by the audio integrity test. */
export function allAudioKeys(): string[] {
  const keys = new Set<string>();
  for (const g of GRAPHEME_LIST) {
    keys.add(g.audio.phoneme);
    keys.add(g.audio.letterName);
  }
  for (const w of WORD_LIST) keys.add(w.audio);
  return [...keys].sort();
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run packages/curriculum`
Expected: PASS — graphemes 6, words 10, integrity 10, purity 3.

- [ ] **Step 9: Commit**

```bash
git add packages/curriculum/src
git commit -m "feat(curriculum): add tricky words, creatures, levels, and public lookups"
```

---
## Task 6: Engine scaffold — types, config, seeded RNG

**Files:**
- Create: `packages/engine/package.json`
- Create: `packages/engine/tsconfig.json`
- Create: `packages/engine/src/types.ts`
- Create: `packages/engine/src/config.ts`
- Create: `packages/engine/src/rng.ts`
- Test: `packages/engine/src/rng.test.ts`
- Test: `packages/engine/src/purity.test.ts`

- [ ] **Step 1: Create `packages/engine/package.json`**

```json
{
  "name": "@soundlings/engine",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "dependencies": {
    "@soundlings/curriculum": "0.1.0"
  }
}
```

- [ ] **Step 2: Create `packages/engine/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Write `packages/engine/src/types.ts`**

```ts
import type { Skill, TargetId } from '@soundlings/curriculum';

/** `${targetId}::${skill}` — the identity of one mastery record. */
export type MasteryKey = string;

export function masteryKey(targetId: TargetId, skill: Skill): MasteryKey {
  return `${targetId}::${skill}`;
}

export interface MasteryRecord {
  targetId: TargetId;
  skill: Skill;
  /** Hours until recall probability halves. Grows with success, shrinks on error. */
  halfLifeHours: number;
  /** Epoch ms of the most recent attempt. 0 if never attempted. */
  lastSeenAt: number;
  /** Unscaffolded correct answers. Secondary credit adds 0.5, so this is fractional. */
  correctCount: number;
  attemptCount: number;
  consecutiveCorrect: number;
  avgLatencyMs: number;
  /** Task types the child has answered correctly without scaffolding. */
  taskTypesSeen: string[];
  /** Distinct sessions in which this target was attempted. */
  sessionsSeen: number;
  lastSessionId: string | null;
  scaffoldedCount: number;
}

export type MasteryMap = Record<MasteryKey, MasteryRecord>;

/**
 * One answered question. Append-only: these are never mutated, and every
 * mastery number is derivable from the full attempt log.
 */
export interface Attempt {
  sessionId: string;
  targetId: TargetId;
  skill: Skill;
  taskTypeId: string;
  correct: boolean;
  /** True when the child was shown the answer. Advances the quest, proves nothing. */
  scaffolded: boolean;
  latencyMs: number;
  /** 1 for the task's primary target, 0.5 for targets exercised incidentally. */
  weight: number;
  /** What the child picked when wrong. Feeds the confusion map. */
  chosen?: TargetId;
  at: number;
}

/** `${target}>${chosen}` → how many times the child made that specific mix-up. */
export type ConfusionMap = Record<string, number>;

export function confusionKey(targetId: TargetId, chosen: TargetId): string {
  return `${targetId}>${chosen}`;
}

export type SessionBand = 'focus' | 'review' | 'winback';

export interface TaskInstance {
  id: string;
  taskTypeId: string;
  skill: Skill;
  primaryTarget: TargetId;
  /** Targets this task also provides evidence for, credited at half weight. */
  secondaryTargets: TargetId[];
  /** Everything shown to the child, correct answer included, already shuffled. */
  choices: TargetId[];
  correctChoice: TargetId;
  band: SessionBand;
  /**
   * True for the three confidence positions: first task, middle third, last
   * task. Normally filled from the win-back pool. For a brand-new child with
   * nothing mastered yet, filled with the easiest available task instead — a
   * five-year-old's first ever screen must not be their hardest.
   */
  anchor: boolean;
  difficulty: number;
  seed: number;
}
```

- [ ] **Step 4: Write `packages/engine/src/config.ts`**

```ts
/**
 * Every tunable number in the engine. These are data, not code, because the
 * simulation harness (src/simulate.ts) calibrates them and real children will
 * force changes. When a pacing test fails, change a value here — never change
 * the test's expectation.
 */
export interface EngineConfig {
  // Session shape
  sessionLength: number;
  winbackCount: number;
  reviewCount: number;
  /** How many of the newest unmastered graphemes count as "current focus". */
  focusTargetCount: number;

  // Mastery predicate
  masteryStrength: number;
  masteryCorrect: number;
  masteryTaskTypes: number;
  masterySessions: number;

  // Win-back eligibility — stricter than mastery, since these must not fail.
  winbackStrength: number;

  // Decay and reinforcement
  initialHalfLifeHours: number;
  minHalfLifeHours: number;
  maxHalfLifeHours: number;
  growthFactor: number;
  errorShrink: number;
  secondaryWeight: number;
  slowLatencyMs: number;
  slowReinforceFactor: number;

  // Frustration guard
  scaffoldAfterErrors: number;
  abandonAfterErrors: number;
  badDayDistinctTargets: number;
  badDaySessionLength: number;

  // Level completion
  blendWordsRequired: number;
  segmentWordsRequired: number;
}

export const DEFAULT_CONFIG: EngineConfig = {
  // 14 tasks is roughly five minutes at a five-year-old's pace. Win-backs are
  // a floor of 3 rather than a percentage because the session invariants need
  // one at the open, one in the middle third and one at the close.
  sessionLength: 14,
  winbackCount: 3,
  reviewCount: 3,
  focusTargetCount: 2,

  masteryStrength: 0.8,
  masteryCorrect: 3,
  // Two task types, so a child cannot master a sound by memorising one game.
  masteryTaskTypes: 2,
  // Two sessions, so mastery means retention across a gap, not same-sitting recall.
  masterySessions: 2,

  winbackStrength: 0.9,

  initialHalfLifeHours: 6,
  minHalfLifeHours: 1,
  maxHalfLifeHours: 24 * 90,
  growthFactor: 1.9,
  errorShrink: 0.4,
  secondaryWeight: 0.5,
  // Above this, a correct answer was effortful rather than automatic, and
  // automaticity is the actual goal of phonics practice.
  slowLatencyMs: 4000,
  slowReinforceFactor: 0.5,

  scaffoldAfterErrors: 2,
  abandonAfterErrors: 3,
  badDayDistinctTargets: 3,
  badDaySessionLength: 8,

  blendWordsRequired: 8,
  segmentWordsRequired: 6,
};

export function withDefaults(partial?: Partial<EngineConfig>): EngineConfig {
  return { ...DEFAULT_CONFIG, ...(partial ?? {}) };
}
```

- [ ] **Step 5: Write the failing RNG test**

Create `packages/engine/src/rng.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { makeRng, shuffle } from './rng';

describe('seeded rng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const seqA = [a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    expect(makeRng(1)()).not.toBe(makeRng(2)());
  });

  it('stays within [0, 1)', () => {
    const rng = makeRng(7);
    for (let i = 0; i < 500; i += 1) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('shuffles deterministically and keeps every element', () => {
    const input = ['a', 'b', 'c', 'd', 'e'];
    const first = shuffle(input, makeRng(99));
    const second = shuffle(input, makeRng(99));
    expect(first).toEqual(second);
    expect(first.slice().sort()).toEqual(input.slice().sort());
  });

  it('does not mutate the input array', () => {
    const input = ['a', 'b', 'c'];
    shuffle(input, makeRng(5));
    expect(input).toEqual(['a', 'b', 'c']);
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/rng.test.ts`
Expected: FAIL — `Failed to resolve import "./rng"`.

- [ ] **Step 7: Write `packages/engine/src/rng.ts`**

```ts
/** Returns a float in [0, 1). */
export type Rng = () => number;

/**
 * mulberry32. Chosen over Math.random because every task instance must be
 * reproducible from a seed: that makes a parent's bug report replayable and
 * lets the simulation harness run deterministically in CI.
 */
export function makeRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates on a copy. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const a = result[i];
    const b = result[j];
    result[i] = b;
    result[j] = a;
  }
  return result;
}

/** A seed derived from a string, so session ids can seed task generation. */
export function seedFromString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
```

- [ ] **Step 8: Write the engine purity test**

Create `packages/engine/src/purity.test.ts`:

```ts
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname);
const PKG = join(__dirname, '..', 'package.json');

/**
 * The engine is the product's moat, so it stays pure and fast to test. If this
 * fails, the thing you were adding belongs in apps/game, not here.
 */
describe('engine purity', () => {
  it('depends only on the curriculum package', () => {
    const pkg = JSON.parse(readFileSync(PKG, 'utf8')) as { dependencies?: Record<string, string> };
    expect(Object.keys(pkg.dependencies ?? {})).toEqual(['@soundlings/curriculum']);
  });

  it('imports no React, React Native, or network client', () => {
    const banned = [/from ['"]react/, /from ['"]react-native/, /from ['"]axios/, /\bfetch\(/];
    for (const file of sourceFiles()) {
      const source = readFileSync(join(SRC, file), 'utf8');
      for (const pattern of banned) {
        expect(pattern.test(source), `${file} matches ${pattern}`).toBe(false);
      }
    }
  });

  it('reads neither the clock nor the global RNG — both are injected', () => {
    for (const file of sourceFiles()) {
      const source = readFileSync(join(SRC, file), 'utf8');
      expect(source.includes('Date.now()'), `${file} reads the clock`).toBe(false);
      expect(source.includes('Math.random()'), `${file} reads the global RNG`).toBe(false);
    }
  });
});

function sourceFiles(): string[] {
  return readdirSync(SRC).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npm install && npx vitest run packages/engine`
Expected: PASS — rng 5, purity 3. The `npm install` is needed to link the new workspace.

- [ ] **Step 10: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): add engine scaffold, config, and seeded rng"
```

---

## Task 7: Mastery — decay

**Files:**
- Create: `packages/engine/src/mastery.ts`
- Test: `packages/engine/src/mastery.decay.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/engine/src/mastery.decay.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from './config';
import { emptyRecord, strengthAt } from './mastery';

const HOUR = 3_600_000;

describe('strengthAt', () => {
  it('is zero for a target never attempted', () => {
    const record = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
    expect(strengthAt(record, 1_000_000)).toBe(0);
  });

  it('is 1 at the instant of the attempt', () => {
    const record = { ...emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG), attemptCount: 1, lastSeenAt: 1_000_000 };
    expect(strengthAt(record, 1_000_000)).toBeCloseTo(1, 10);
  });

  it('is 0.5 after exactly one half-life', () => {
    const record = {
      ...emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG),
      attemptCount: 1,
      lastSeenAt: 0,
      halfLifeHours: 6,
    };
    expect(strengthAt(record, 6 * HOUR)).toBeCloseTo(0.5, 6);
  });

  it('is 0.25 after two half-lives', () => {
    const record = {
      ...emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG),
      attemptCount: 1,
      lastSeenAt: 0,
      halfLifeHours: 6,
    };
    expect(strengthAt(record, 12 * HOUR)).toBeCloseTo(0.25, 6);
  });

  it('decays more slowly for a longer half-life', () => {
    const base = { ...emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG), attemptCount: 1, lastSeenAt: 0 };
    const weak = { ...base, halfLifeHours: 2 };
    const strong = { ...base, halfLifeHours: 200 };
    expect(strengthAt(strong, 24 * HOUR)).toBeGreaterThan(strengthAt(weak, 24 * HOUR));
  });

  it('never returns a negative strength even if the clock goes backwards', () => {
    const record = { ...emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG), attemptCount: 1, lastSeenAt: 10 * HOUR };
    expect(strengthAt(record, 0)).toBeLessThanOrEqual(1);
    expect(strengthAt(record, 0)).toBeGreaterThanOrEqual(0);
  });
});

describe('emptyRecord', () => {
  it('starts at the configured initial half-life with nothing proven', () => {
    const record = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
    expect(record.halfLifeHours).toBe(DEFAULT_CONFIG.initialHalfLifeHours);
    expect(record.correctCount).toBe(0);
    expect(record.attemptCount).toBe(0);
    expect(record.taskTypesSeen).toEqual([]);
    expect(record.sessionsSeen).toBe(0);
    expect(record.lastSessionId).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/mastery.decay.test.ts`
Expected: FAIL — `Failed to resolve import "./mastery"`.

- [ ] **Step 3: Write `packages/engine/src/mastery.ts`**

```ts
import type { Skill, TargetId } from '@soundlings/curriculum';
import type { EngineConfig } from './config';
import type { MasteryRecord } from './types';

const MS_PER_HOUR = 3_600_000;

export function emptyRecord(targetId: TargetId, skill: Skill, config: EngineConfig): MasteryRecord {
  return {
    targetId,
    skill,
    halfLifeHours: config.initialHalfLifeHours,
    lastSeenAt: 0,
    correctCount: 0,
    attemptCount: 0,
    consecutiveCorrect: 0,
    avgLatencyMs: 0,
    taskTypesSeen: [],
    sessionsSeen: 0,
    lastSessionId: null,
    scaffoldedCount: 0,
  };
}

/**
 * Probability the child could recall this right now, as exponential decay from
 * the last attempt. Strength is computed rather than stored, so a record left
 * untouched for a week correctly reports that it has gone stale.
 */
export function strengthAt(record: MasteryRecord, now: number): number {
  if (record.attemptCount === 0) return 0;
  const elapsedHours = Math.max(0, now - record.lastSeenAt) / MS_PER_HOUR;
  return Math.exp(-elapsedHours / record.halfLifeHours);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/mastery.decay.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/mastery.ts packages/engine/src/mastery.decay.test.ts
git commit -m "feat(engine): add half-life decay model for mastery strength"
```

---

## Task 8: Mastery — reinforcement

**Files:**
- Modify: `packages/engine/src/mastery.ts`
- Test: `packages/engine/src/mastery.apply.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/engine/src/mastery.apply.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from './config';
import { applyAttempt, emptyRecord } from './mastery';
import type { Attempt } from './types';

const HOUR = 3_600_000;

function attempt(overrides: Partial<Attempt> = {}): Attempt {
  return {
    sessionId: 'session-1',
    targetId: 's',
    skill: 'SOUND_ID',
    taskTypeId: 'sound-hunt',
    correct: true,
    scaffolded: false,
    latencyMs: 1200,
    weight: 1,
    at: 10 * HOUR,
    ...overrides,
  };
}

describe('applyAttempt', () => {
  it('does not mutate the record it is given', () => {
    const record = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
    applyAttempt(record, attempt(), DEFAULT_CONFIG);
    expect(record.attemptCount).toBe(0);
  });

  it('lengthens the half-life on a fast, unscaffolded correct answer', () => {
    const record = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
    const next = applyAttempt(record, attempt(), DEFAULT_CONFIG);
    expect(next.halfLifeHours).toBeCloseTo(record.halfLifeHours * DEFAULT_CONFIG.growthFactor, 6);
    expect(next.correctCount).toBe(1);
    expect(next.consecutiveCorrect).toBe(1);
  });

  it('reinforces a slow correct answer at half rate — correct is not yet automatic', () => {
    const record = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
    const fast = applyAttempt(record, attempt({ latencyMs: 900 }), DEFAULT_CONFIG);
    const slow = applyAttempt(record, attempt({ latencyMs: 9000 }), DEFAULT_CONFIG);
    expect(slow.halfLifeHours).toBeLessThan(fast.halfLifeHours);
    expect(slow.halfLifeHours).toBeGreaterThan(record.halfLifeHours);
    // Still correct, so it still counts toward correctCount.
    expect(slow.correctCount).toBe(1);
  });

  it('shrinks the half-life and resets the streak on an error', () => {
    const record = { ...emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG), consecutiveCorrect: 4 };
    const next = applyAttempt(record, attempt({ correct: false, chosen: 'f' }), DEFAULT_CONFIG);
    expect(next.halfLifeHours).toBeCloseTo(record.halfLifeHours * DEFAULT_CONFIG.errorShrink, 6);
    expect(next.consecutiveCorrect).toBe(0);
    expect(next.correctCount).toBe(0);
  });

  it('never shrinks the half-life below the configured floor', () => {
    const record = { ...emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG), halfLifeHours: 1 };
    const next = applyAttempt(record, attempt({ correct: false }), DEFAULT_CONFIG);
    expect(next.halfLifeHours).toBe(DEFAULT_CONFIG.minHalfLifeHours);
  });

  it('counts a scaffolded correct answer as progress but proves nothing', () => {
    const record = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
    const next = applyAttempt(record, attempt({ scaffolded: true }), DEFAULT_CONFIG);
    expect(next.halfLifeHours).toBe(record.halfLifeHours);
    expect(next.correctCount).toBe(0);
    expect(next.scaffoldedCount).toBe(1);
    expect(next.taskTypesSeen).toEqual([]);
  });

  it('credits a secondary target at half weight', () => {
    const record = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
    const next = applyAttempt(record, attempt({ weight: DEFAULT_CONFIG.secondaryWeight }), DEFAULT_CONFIG);
    expect(next.correctCount).toBe(0.5);
    const full = applyAttempt(record, attempt({ weight: 1 }), DEFAULT_CONFIG);
    expect(next.halfLifeHours).toBeLessThan(full.halfLifeHours);
    expect(next.halfLifeHours).toBeGreaterThan(record.halfLifeHours);
  });

  it('records each proving task type once', () => {
    const record = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
    const once = applyAttempt(record, attempt({ taskTypeId: 'sound-hunt' }), DEFAULT_CONFIG);
    const twice = applyAttempt(once, attempt({ taskTypeId: 'sound-hunt' }), DEFAULT_CONFIG);
    const other = applyAttempt(twice, attempt({ taskTypeId: 'word-builder' }), DEFAULT_CONFIG);
    expect(twice.taskTypesSeen).toEqual(['sound-hunt']);
    expect(other.taskTypesSeen).toEqual(['sound-hunt', 'word-builder']);
  });

  it('counts a new session only when the session id changes', () => {
    const record = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
    const a = applyAttempt(record, attempt({ sessionId: 'one' }), DEFAULT_CONFIG);
    const b = applyAttempt(a, attempt({ sessionId: 'one' }), DEFAULT_CONFIG);
    const c = applyAttempt(b, attempt({ sessionId: 'two' }), DEFAULT_CONFIG);
    expect(a.sessionsSeen).toBe(1);
    expect(b.sessionsSeen).toBe(1);
    expect(c.sessionsSeen).toBe(2);
  });

  it('tracks a running mean latency', () => {
    const record = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
    const a = applyAttempt(record, attempt({ latencyMs: 1000 }), DEFAULT_CONFIG);
    const b = applyAttempt(a, attempt({ latencyMs: 3000 }), DEFAULT_CONFIG);
    expect(a.avgLatencyMs).toBe(1000);
    expect(b.avgLatencyMs).toBe(2000);
  });

  it('advances lastSeenAt to the attempt time', () => {
    const record = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
    const next = applyAttempt(record, attempt({ at: 99 * HOUR }), DEFAULT_CONFIG);
    expect(next.lastSeenAt).toBe(99 * HOUR);
  });

  it('never exceeds the configured half-life ceiling', () => {
    let record = { ...emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG), halfLifeHours: DEFAULT_CONFIG.maxHalfLifeHours };
    record = applyAttempt(record, attempt(), DEFAULT_CONFIG);
    expect(record.halfLifeHours).toBe(DEFAULT_CONFIG.maxHalfLifeHours);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/mastery.apply.test.ts`
Expected: FAIL — `applyAttempt is not a function`.

- [ ] **Step 3: Add `applyAttempt` to `packages/engine/src/mastery.ts`**

Add `Attempt` to the existing type import at the top of the file, so it reads:

```ts
import type { Attempt, MasteryRecord } from './types';
```

Then append the function to the end of the file:

```ts
/**
 * Folds one attempt into a mastery record. Pure: returns a new record.
 *
 * The rules encode three pedagogical judgements worth not "simplifying":
 *  - A scaffolded win advances the quest but changes no half-life and earns no
 *    credit. This is what lets the game be generous with hints while keeping
 *    the learning data honest.
 *  - A slow correct answer reinforces at half rate. Phonics aims at
 *    automaticity, and effortful decoding is not yet automatic.
 *  - Secondary credit is real but weaker. Spelling "sat" is evidence the child
 *    hears /s/ /a/ /t/, just weaker evidence than being asked /s/ directly.
 */
export function applyAttempt(
  record: MasteryRecord,
  attempt: Attempt,
  config: EngineConfig,
): MasteryRecord {
  const next: MasteryRecord = {
    ...record,
    taskTypesSeen: [...record.taskTypesSeen],
  };

  next.attemptCount = record.attemptCount + 1;
  next.avgLatencyMs =
    (record.avgLatencyMs * record.attemptCount + attempt.latencyMs) / next.attemptCount;
  next.lastSeenAt = attempt.at;

  if (attempt.sessionId !== record.lastSessionId) {
    next.sessionsSeen = record.sessionsSeen + 1;
    next.lastSessionId = attempt.sessionId;
  }

  if (attempt.scaffolded) {
    next.scaffoldedCount = record.scaffoldedCount + 1;
    if (!attempt.correct) next.consecutiveCorrect = 0;
    return next;
  }

  if (!attempt.correct) {
    next.halfLifeHours = Math.max(config.minHalfLifeHours, record.halfLifeHours * config.errorShrink);
    next.consecutiveCorrect = 0;
    return next;
  }

  const slow = attempt.latencyMs > config.slowLatencyMs;
  const rate = attempt.weight * (slow ? config.slowReinforceFactor : 1);
  const growth = 1 + (config.growthFactor - 1) * rate;

  next.halfLifeHours = Math.min(config.maxHalfLifeHours, record.halfLifeHours * growth);
  next.correctCount = record.correctCount + attempt.weight;
  next.consecutiveCorrect = record.consecutiveCorrect + 1;
  if (!next.taskTypesSeen.includes(attempt.taskTypeId)) {
    next.taskTypesSeen.push(attempt.taskTypeId);
  }

  return next;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/mastery.apply.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/mastery.ts packages/engine/src/mastery.apply.test.ts
git commit -m "feat(engine): apply attempts to mastery records with weighted reinforcement"
```

---

## Task 9: Mastery — the predicate and the map helpers

**Files:**
- Modify: `packages/engine/src/mastery.ts`
- Test: `packages/engine/src/mastery.predicate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/engine/src/mastery.predicate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from './config';
import { applyAttempt, emptyRecord, getRecord, isMastered, recordAttempt } from './mastery';
import { masteryKey } from './types';
import type { Attempt, MasteryMap } from './types';

const HOUR = 3_600_000;

function attempt(overrides: Partial<Attempt> = {}): Attempt {
  return {
    sessionId: 'session-1',
    targetId: 's',
    skill: 'SOUND_ID',
    taskTypeId: 'sound-hunt',
    correct: true,
    scaffolded: false,
    latencyMs: 1200,
    weight: 1,
    at: HOUR,
    ...overrides,
  };
}

/** Three fast correct answers across two sessions and two task types. */
function provenRecord() {
  let record = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
  record = applyAttempt(record, attempt({ sessionId: 'one', taskTypeId: 'sound-hunt', at: HOUR }), DEFAULT_CONFIG);
  record = applyAttempt(record, attempt({ sessionId: 'one', taskTypeId: 'word-builder', at: 2 * HOUR }), DEFAULT_CONFIG);
  record = applyAttempt(record, attempt({ sessionId: 'two', taskTypeId: 'sound-hunt', at: 3 * HOUR }), DEFAULT_CONFIG);
  return record;
}

describe('isMastered', () => {
  it('accepts a target proven across two sessions and two task types', () => {
    expect(isMastered(provenRecord(), 3 * HOUR, DEFAULT_CONFIG)).toBe(true);
  });

  it('rejects a target proven on only one task type, however many times', () => {
    let record = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
    record = applyAttempt(record, attempt({ sessionId: 'one', at: HOUR }), DEFAULT_CONFIG);
    record = applyAttempt(record, attempt({ sessionId: 'two', at: 2 * HOUR }), DEFAULT_CONFIG);
    record = applyAttempt(record, attempt({ sessionId: 'three', at: 3 * HOUR }), DEFAULT_CONFIG);
    record = applyAttempt(record, attempt({ sessionId: 'four', at: 4 * HOUR }), DEFAULT_CONFIG);
    expect(record.taskTypesSeen).toEqual(['sound-hunt']);
    expect(isMastered(record, 4 * HOUR, DEFAULT_CONFIG)).toBe(false);
  });

  it('rejects a target proven only within a single session', () => {
    let record = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
    record = applyAttempt(record, attempt({ sessionId: 'one', taskTypeId: 'sound-hunt', at: HOUR }), DEFAULT_CONFIG);
    record = applyAttempt(record, attempt({ sessionId: 'one', taskTypeId: 'word-builder', at: 2 * HOUR }), DEFAULT_CONFIG);
    record = applyAttempt(record, attempt({ sessionId: 'one', taskTypeId: 'picture-match', at: 3 * HOUR }), DEFAULT_CONFIG);
    expect(record.sessionsSeen).toBe(1);
    expect(isMastered(record, 3 * HOUR, DEFAULT_CONFIG)).toBe(false);
  });

  it('rejects a target whose strength has decayed below threshold', () => {
    const record = provenRecord();
    const muchLater = 3 * HOUR + 1000 * HOUR;
    expect(isMastered(record, muchLater, DEFAULT_CONFIG)).toBe(false);
  });

  it('does not count scaffolded wins toward the correct requirement', () => {
    let record = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
    record = applyAttempt(record, attempt({ sessionId: 'one', taskTypeId: 'sound-hunt', scaffolded: true }), DEFAULT_CONFIG);
    record = applyAttempt(record, attempt({ sessionId: 'two', taskTypeId: 'word-builder', scaffolded: true }), DEFAULT_CONFIG);
    record = applyAttempt(record, attempt({ sessionId: 'three', taskTypeId: 'picture-match', scaffolded: true }), DEFAULT_CONFIG);
    expect(isMastered(record, 3 * HOUR, DEFAULT_CONFIG)).toBe(false);
  });

  it('needs two half-weight credits to equal one full one', () => {
    const half = DEFAULT_CONFIG.secondaryWeight;
    let record = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
    record = applyAttempt(record, attempt({ sessionId: 'one', taskTypeId: 'word-builder', weight: half }), DEFAULT_CONFIG);
    record = applyAttempt(record, attempt({ sessionId: 'two', taskTypeId: 'picture-match', weight: half }), DEFAULT_CONFIG);
    expect(record.correctCount).toBe(1);
    expect(isMastered(record, 2 * HOUR, DEFAULT_CONFIG)).toBe(false);
  });
});

describe('getRecord and recordAttempt', () => {
  it('returns a fresh empty record for an unseen target', () => {
    const record = getRecord({}, 'a', 'LETTER_SOUND', DEFAULT_CONFIG);
    expect(record.targetId).toBe('a');
    expect(record.skill).toBe('LETTER_SOUND');
    expect(record.attemptCount).toBe(0);
  });

  it('writes an attempt into a new map without mutating the original', () => {
    const before: MasteryMap = {};
    const after = recordAttempt(before, attempt(), DEFAULT_CONFIG);
    expect(before).toEqual({});
    expect(after[masteryKey('s', 'SOUND_ID')].attemptCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/mastery.predicate.test.ts`
Expected: FAIL — `isMastered is not a function`.

- [ ] **Step 3: Add the predicate and map helpers to `packages/engine/src/mastery.ts`**

Extend the imports at the top of the file so they read:

```ts
import { masteryKey } from './types';
import type { Attempt, MasteryMap, MasteryRecord } from './types';
```

Then append to the end of the file:

```ts
/**
 * Could this child do it again, cold, today?
 *
 * Evaluated at session-build time, never immediately after an answer —
 * strength is ~1 the instant an attempt lands, so asking then is meaningless.
 *
 * The two conditions people try to remove are the two that matter.
 * `masteryTaskTypes` stops a child "mastering" a sound by memorising the shape
 * of one mini-game. `masterySessions` requires retention across a gap rather
 * than same-sitting recall.
 */
export function isMastered(record: MasteryRecord, now: number, config: EngineConfig): boolean {
  return (
    strengthAt(record, now) >= config.masteryStrength &&
    record.correctCount >= config.masteryCorrect &&
    record.taskTypesSeen.length >= config.masteryTaskTypes &&
    record.sessionsSeen >= config.masterySessions
  );
}

export function getRecord(
  map: MasteryMap,
  targetId: TargetId,
  skill: Skill,
  config: EngineConfig,
): MasteryRecord {
  return map[masteryKey(targetId, skill)] ?? emptyRecord(targetId, skill, config);
}

/** Returns a new map with this attempt folded in. Does not mutate `map`. */
export function recordAttempt(map: MasteryMap, attempt: Attempt, config: EngineConfig): MasteryMap {
  const key = masteryKey(attempt.targetId, attempt.skill);
  const current = map[key] ?? emptyRecord(attempt.targetId, attempt.skill, config);
  return { ...map, [key]: applyAttempt(current, attempt, config) };
}

/**
 * Folds a task's primary and secondary attempts in one call, and updates the
 * confusion map when the child picked a specific wrong answer.
 */
export function recordAttempts(
  map: MasteryMap,
  attempts: Attempt[],
  config: EngineConfig,
): MasteryMap {
  return attempts.reduce((acc, attempt) => recordAttempt(acc, attempt, config), map);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/mastery.predicate.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Run the whole suite to check nothing regressed**

Run: `npm test`
Expected: PASS — all curriculum and engine tests green.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/mastery.ts packages/engine/src/mastery.predicate.test.ts
git commit -m "feat(engine): add mastery predicate requiring two task types and two sessions"
```

---

## Task 10: Task-type metadata

**Files:**
- Create: `packages/engine/src/taskTypes.ts`
- Test: `packages/engine/src/taskTypes.test.ts`

Metadata only — no React components. The engine must be able to schedule a task type without being able to render it, which is what keeps it pure and testable.

- [ ] **Step 1: Write the failing test**

Create `packages/engine/src/taskTypes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SKILLS } from '@soundlings/curriculum';
import { TASK_TYPES, taskTypeById, taskTypesForSkill } from './taskTypes';
import { DEFAULT_CONFIG } from './config';

describe('task types', () => {
  it('has unique ids', () => {
    const ids = TASK_TYPES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('declares only real skills', () => {
    for (const taskType of TASK_TYPES) {
      expect(SKILLS).toContain(taskType.skill);
    }
  });

  it('offers at least as many task types as mastery requires, for every skill it covers', () => {
    const covered = new Set(TASK_TYPES.map((t) => t.skill));
    for (const skill of covered) {
      expect(taskTypesForSkill(skill).length, skill).toBeGreaterThanOrEqual(1);
    }
  });

  it('covers the four Level 1 skills', () => {
    expect(TASK_TYPES.map((t) => t.skill).sort()).toEqual(
      ['BLEND_READ', 'LETTER_SOUND', 'SEGMENT_SPELL', 'SOUND_ID'].sort(),
    );
  });

  it('lets a grapheme reach the two-task-type mastery bar via secondary credit', () => {
    // SOUND_ID has one direct task type, so without secondary credit from
    // word tasks no grapheme could ever be mastered. This asserts the escape hatch.
    const direct = taskTypesForSkill('SOUND_ID').length;
    const secondary = TASK_TYPES.filter((t) => t.secondaryTargets === 'graphemes').length;
    expect(direct + secondary).toBeGreaterThanOrEqual(DEFAULT_CONFIG.masteryTaskTypes);
  });

  it('keeps choice bounds sane', () => {
    for (const taskType of TASK_TYPES) {
      expect(taskType.minChoices).toBeGreaterThanOrEqual(2);
      expect(taskType.maxChoices).toBeGreaterThanOrEqual(taskType.minChoices);
    }
  });

  it('orders difficulty so there is always an easiest task type', () => {
    const difficulties = TASK_TYPES.map((t) => t.difficulty);
    expect(Math.min(...difficulties)).toBeLessThan(Math.max(...difficulties));
  });

  it('looks up by id and throws on an unknown id', () => {
    expect(taskTypeById('sound-hunt').skill).toBe('SOUND_ID');
    expect(() => taskTypeById('nope')).toThrow(/unknown task type/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/taskTypes.test.ts`
Expected: FAIL — `Failed to resolve import "./taskTypes"`.

- [ ] **Step 3: Write `packages/engine/src/taskTypes.ts`**

```ts
import type { Skill } from '@soundlings/curriculum';

export interface TaskTypeMeta {
  id: string;
  skill: Skill;
  /** 1 is easiest. The frustration guard caps difficulty, so this must be meaningful. */
  difficulty: number;
  minChoices: number;
  maxChoices: number;
  /**
   * 'graphemes' means a correct answer is also evidence for each grapheme in
   * the target word, credited at half weight. This is why a child can reach
   * the two-task-type mastery bar for a sound without four separate sound games.
   */
  secondaryTargets: 'graphemes' | 'none';
}

/**
 * The four mini-games shipped in Level 1. Four is the minimum that lets both
 * sound skills and both word skills clear the two-task-type mastery bar once
 * secondary crediting is taken into account.
 */
export const TASK_TYPES: TaskTypeMeta[] = [
  {
    id: 'sound-hunt',
    skill: 'SOUND_ID',
    difficulty: 1,
    minChoices: 2,
    maxChoices: 4,
    secondaryTargets: 'none',
  },
  {
    id: 'sound-singer',
    skill: 'LETTER_SOUND',
    difficulty: 2,
    minChoices: 2,
    maxChoices: 3,
    secondaryTargets: 'none',
  },
  {
    id: 'picture-match',
    skill: 'BLEND_READ',
    difficulty: 3,
    minChoices: 2,
    maxChoices: 3,
    secondaryTargets: 'graphemes',
  },
  {
    id: 'word-builder',
    skill: 'SEGMENT_SPELL',
    difficulty: 4,
    minChoices: 3,
    maxChoices: 5,
    secondaryTargets: 'graphemes',
  },
];

export function taskTypeById(id: string): TaskTypeMeta {
  const found = TASK_TYPES.find((t) => t.id === id);
  if (!found) throw new Error(`Unknown task type: ${id}`);
  return found;
}

export function taskTypesForSkill(skill: Skill): TaskTypeMeta[] {
  return TASK_TYPES.filter((t) => t.skill === skill);
}

export function easiestTaskTypeForSkill(skill: Skill): TaskTypeMeta {
  const candidates = taskTypesForSkill(skill);
  if (candidates.length === 0) throw new Error(`No task type for skill: ${skill}`);
  return candidates.reduce((best, t) => (t.difficulty < best.difficulty ? t : best));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/taskTypes.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/taskTypes.ts packages/engine/src/taskTypes.test.ts
git commit -m "feat(engine): add task-type metadata for the four Level 1 mini-games"
```

---
## Task 11: Distractor picker

**Files:**
- Create: `packages/engine/src/distractors.ts`
- Test: `packages/engine/src/distractors.test.ts`

This is where "adaptive" has to show up at the level of a single screen. A wrong answer the child can already reject teaches nothing; a wrong answer they genuinely confuse *is* the lesson. Phonics Hero picks randomly, which is the single easiest place to beat it.

- [ ] **Step 1: Write the failing test**

Create `packages/engine/src/distractors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from './config';
import { pickGraphemeDistractors, pickWordDistractors } from './distractors';
import { makeRng } from './rng';
import { confusionKey } from './types';

describe('pickGraphemeDistractors', () => {
  it('never includes the target', () => {
    const picks = pickGraphemeDistractors({
      target: 's', count: 3, level: 1, confusions: {}, rng: makeRng(1),
    });
    expect(picks).not.toContain('s');
  });

  it('never includes a grapheme the child has not met', () => {
    // 'n' is listed as confusable with 'm' but is not taught until Level 2.
    const picks = pickGraphemeDistractors({
      target: 'm', count: 4, level: 1, confusions: {}, rng: makeRng(1),
    });
    expect(picks).not.toContain('n');
    expect(picks).not.toContain('z');
  });

  it('returns the requested number of distinct distractors', () => {
    const picks = pickGraphemeDistractors({
      target: 's', count: 3, level: 1, confusions: {}, rng: makeRng(2),
    });
    expect(picks.length).toBe(3);
    expect(new Set(picks).size).toBe(3);
  });

  it('prefers a grapheme this child has actually confused with the target', () => {
    const confusions = { [confusionKey('m', 'w')]: 0, [confusionKey('m', 'a')]: 5 };
    const picks = pickGraphemeDistractors({
      target: 'm', count: 1, level: 1, confusions, rng: makeRng(3),
    });
    expect(picks).toEqual(['a']);
  });

  it('falls back to the taught confusable list when there is no history', () => {
    // 't' is confusable with p, d, f — of which p and f are taught at Level 1.
    const picks = pickGraphemeDistractors({
      target: 't', count: 2, level: 1, confusions: {}, rng: makeRng(4),
    });
    expect(picks.slice().sort()).toEqual(['f', 'p']);
  });

  it('is deterministic for a given seed', () => {
    const args = { target: 'a', count: 3, level: 1, confusions: {} };
    const first = pickGraphemeDistractors({ ...args, rng: makeRng(77) });
    const second = pickGraphemeDistractors({ ...args, rng: makeRng(77) });
    expect(first).toEqual(second);
  });

  it('returns as many as it can rather than throwing when the pool is small', () => {
    const picks = pickGraphemeDistractors({
      target: 's', count: 99, level: 1, confusions: {}, rng: makeRng(5),
    });
    // Level 1 teaches 7 graphemes, so 6 are available as distractors.
    expect(picks.length).toBe(6);
  });
});

describe('pickWordDistractors', () => {
  it('never includes the target and only uses picturable words', () => {
    const picks = pickWordDistractors({
      target: 'mat', count: 2, level: 1, rng: makeRng(1),
    });
    expect(picks).not.toContain('mat');
    // 'sat' has no picture, so it can never appear in Picture Match.
    expect(picks).not.toContain('sat');
  });

  it('prefers minimal pairs — words differing from the target by one grapheme', () => {
    const picks = pickWordDistractors({
      target: 'mat', count: 2, level: 1, rng: makeRng(9),
    });
    // map differs only in the final grapheme; pat only in the first.
    expect(picks).toContain('map');
  });

  it('is deterministic for a given seed', () => {
    const first = pickWordDistractors({ target: 'sit', count: 2, level: 1, rng: makeRng(11) });
    const second = pickWordDistractors({ target: 'sit', count: 2, level: 1, rng: makeRng(11) });
    expect(first).toEqual(second);
  });
});

describe('config sanity', () => {
  it('keeps secondary weight below full credit', () => {
    expect(DEFAULT_CONFIG.secondaryWeight).toBeLessThan(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/distractors.test.ts`
Expected: FAIL — `Failed to resolve import "./distractors"`.

- [ ] **Step 3: Write `packages/engine/src/distractors.ts`**

```ts
import {
  GRAPHEMES,
  graphemesForLevel,
  picturableWordsForLevel,
  WORDS,
} from '@soundlings/curriculum';
import type { GraphemeId, TargetId, WordId } from '@soundlings/curriculum';
import { shuffle } from './rng';
import type { Rng } from './rng';
import { confusionKey } from './types';
import type { ConfusionMap } from './types';

export interface GraphemeDistractorArgs {
  target: GraphemeId;
  count: number;
  level: number;
  confusions: ConfusionMap;
  rng: Rng;
  /**
   * Graphemes the child has actually been introduced to. Defaults to
   * everything taught by `level`. The session builder passes a narrower set,
   * because on day one a child has met two letters, not seven.
   */
  allowed?: GraphemeId[];
}

/**
 * Wrong letters for a sound question, best teaching value first:
 *   1. graphemes this child has demonstrably confused with the target
 *   2. graphemes children generally confuse with it, that this child has met
 *   3. anything else already taught
 *
 * Tier 3 is shuffled so repeated questions do not become a memorisable pattern.
 * Nothing from a future level is ever offered — an unknown letter as a wrong
 * answer teaches nothing and reads to a child as a trick.
 */
export function pickGraphemeDistractors(args: GraphemeDistractorArgs): GraphemeId[] {
  const { target, count, level, confusions, rng } = args;
  const pool = args.allowed ?? graphemesForLevel(level).map((g) => g.id);
  const taught = pool.filter((id) => id !== target);

  const confusedWith = taught
    .filter((id) => (confusions[confusionKey(target, id)] ?? 0) > 0)
    .sort((a, b) => (confusions[confusionKey(target, b)] ?? 0) - (confusions[confusionKey(target, a)] ?? 0));

  const generallyConfusable = shuffle(
    (GRAPHEMES[target]?.confusableWith ?? []).filter(
      (id) => taught.includes(id) && !confusedWith.includes(id),
    ),
    rng,
  );

  const remainder = shuffle(
    taught.filter((id) => !confusedWith.includes(id) && !generallyConfusable.includes(id)),
    rng,
  );

  return [...confusedWith, ...generallyConfusable, ...remainder].slice(0, count);
}

export interface WordDistractorArgs {
  target: WordId;
  count: number;
  level: number;
  rng: Rng;
  /** Restricts the pool to words the child can actually decode. */
  allowedWords?: WordId[];
}

/**
 * Wrong pictures for a reading question. Minimal pairs first — mat/map/pat
 * differ by a single grapheme, so choosing between them requires actually
 * decoding rather than recognising a word's silhouette.
 */
export function pickWordDistractors(args: WordDistractorArgs): WordId[] {
  const { target, count, level, rng } = args;
  const targetGraphemes = WORDS[target]?.graphemes ?? [];

  const basePool = args.allowedWords ?? picturableWordsForLevel(level).map((w) => w.id);
  const pool = basePool.filter((id) => id !== target);

  const scored = shuffle(pool, rng).map((id) => ({
    id,
    distance: graphemeDistance(targetGraphemes, WORDS[id].graphemes),
  }));

  scored.sort((a, b) => a.distance - b.distance);
  return scored.slice(0, count).map((entry) => entry.id);
}

/** How many positions differ. Different lengths count as maximally distant. */
function graphemeDistance(a: readonly GraphemeId[], b: readonly GraphemeId[]): number {
  if (a.length !== b.length) return Math.max(a.length, b.length);
  let distance = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) distance += 1;
  }
  return distance;
}

/** Extra letter tiles for Word Builder, beyond the ones the word needs. */
export function pickTileDistractors(args: {
  target: WordId;
  count: number;
  level: number;
  confusions: ConfusionMap;
  rng: Rng;
  allowed?: GraphemeId[];
}): GraphemeId[] {
  const { target, count, level, confusions, rng } = args;
  const needed = new Set(WORDS[target]?.graphemes ?? []);
  const pool = args.allowed ?? graphemesForLevel(level).map((g) => g.id);
  const taught = pool.filter((id) => !needed.has(id));

  // Prefer letters confusable with any grapheme in the word — those are the
  // tiles that make the child listen to the word rather than guess its shape.
  const confusable = taught.filter((id) =>
    [...needed].some(
      (g) =>
        (GRAPHEMES[g]?.confusableWith ?? []).includes(id) ||
        (confusions[confusionKey(g, id)] ?? 0) > 0,
    ),
  );

  const rest = taught.filter((id) => !confusable.includes(id));
  return [...shuffle(confusable, rng), ...shuffle(rest, rng)].slice(0, count);
}

/** Folds one wrong answer into the confusion map. Does not mutate. */
export function recordConfusion(
  confusions: ConfusionMap,
  target: TargetId,
  chosen: TargetId,
): ConfusionMap {
  const key = confusionKey(target, chosen);
  return { ...confusions, [key]: (confusions[key] ?? 0) + 1 };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/distractors.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/distractors.ts packages/engine/src/distractors.test.ts
git commit -m "feat(engine): pick distractors from the child's own confusion history"
```

---

## Task 12: Session builder

**Files:**
- Create: `packages/engine/src/sessionBuilder.ts`
- Test: `packages/engine/src/sessionBuilder.test.ts`

The heart of the product. Every invariant below protects something specific about a five-year-old's experience; they are not style preferences.

- [ ] **Step 1: Write the failing test**

Create `packages/engine/src/sessionBuilder.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { graphemesForLevel } from '@soundlings/curriculum';
import { DEFAULT_CONFIG } from './config';
import { applyAttempt, emptyRecord } from './mastery';
import { buildSession } from './sessionBuilder';
import { masteryKey } from './types';
import type { Attempt, MasteryMap } from './types';

const HOUR = 3_600_000;
const NOW = 1000 * HOUR;

/** A mastery map in which the given graphemes are mastered for both sound skills. */
function masteredGraphemes(ids: string[]): MasteryMap {
  const map: MasteryMap = {};
  for (const id of ids) {
    for (const skill of ['SOUND_ID', 'LETTER_SOUND'] as const) {
      let record = emptyRecord(id, skill, DEFAULT_CONFIG);
      const base: Attempt = {
        sessionId: 'x', targetId: id, skill, taskTypeId: 'sound-hunt',
        correct: true, scaffolded: false, latencyMs: 900, weight: 1, at: NOW,
      };
      record = applyAttempt(record, { ...base, sessionId: 'one', taskTypeId: 'sound-hunt' }, DEFAULT_CONFIG);
      record = applyAttempt(record, { ...base, sessionId: 'two', taskTypeId: 'word-builder' }, DEFAULT_CONFIG);
      record = applyAttempt(record, { ...base, sessionId: 'three', taskTypeId: 'picture-match' }, DEFAULT_CONFIG);
      map[masteryKey(id, skill)] = record;
    }
  }
  return map;
}

function build(mastery: MasteryMap, sessionId = 'test-session') {
  return buildSession({ sessionId, level: 1, mastery, confusions: {}, now: NOW });
}

describe('buildSession invariants', () => {
  it('returns exactly config.sessionLength tasks', () => {
    expect(build({}).length).toBe(DEFAULT_CONFIG.sessionLength);
    expect(build(masteredGraphemes(['s', 'a', 't'])).length).toBe(DEFAULT_CONFIG.sessionLength);
  });

  it('opens on an anchor task so the child starts on a success', () => {
    expect(build(masteredGraphemes(['s', 'a']))[0].anchor).toBe(true);
  });

  it('closes on an anchor task so the child leaves on a success', () => {
    const plan = build(masteredGraphemes(['s', 'a']));
    expect(plan[plan.length - 1].anchor).toBe(true);
  });

  it('places an anchor in the middle third as a breather', () => {
    const plan = build(masteredGraphemes(['s', 'a']));
    const start = Math.floor(plan.length / 3);
    const end = Math.ceil((2 * plan.length) / 3);
    expect(plan.slice(start, end).some((t) => t.anchor)).toBe(true);
  });

  it('never places two of the same mini-game back to back', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const plan = build(masteredGraphemes(['s', 'a', 't']), `seed-${seed}`);
      for (let i = 1; i < plan.length; i += 1) {
        expect(
          plan[i].taskTypeId === plan[i - 1].taskTypeId,
          `seed ${seed}: ${plan[i - 1].taskTypeId} repeated at ${i}`,
        ).toBe(false);
      }
    }
  });

  it('never targets a grapheme from a later level', () => {
    const taught = new Set(graphemesForLevel(1).map((g) => g.id));
    const plan = build({});
    for (const task of plan) {
      for (const choice of task.choices) {
        if (choice.length === 1) expect(taught.has(choice), choice).toBe(true);
      }
    }
  });

  it('always includes the correct answer among the choices', () => {
    for (const task of build(masteredGraphemes(['s', 'a']))) {
      expect(task.choices).toContain(task.correctChoice);
    }
  });

  it('offers no duplicate choices within a task', () => {
    for (const task of build(masteredGraphemes(['s', 'a']))) {
      expect(new Set(task.choices).size).toBe(task.choices.length);
    }
  });

  it('gives every task a unique id', () => {
    const plan = build(masteredGraphemes(['s', 'a']));
    expect(new Set(plan.map((t) => t.id)).size).toBe(plan.length);
  });

  it('is deterministic for the same session id and mastery state', () => {
    const mastery = masteredGraphemes(['s', 'a']);
    const first = buildSession({ sessionId: 'same', level: 1, mastery, confusions: {}, now: NOW });
    const second = buildSession({ sessionId: 'same', level: 1, mastery, confusions: {}, now: NOW });
    expect(first).toEqual(second);
  });

  it('produces a different plan for a different session id', () => {
    const mastery = masteredGraphemes(['s', 'a']);
    const a = buildSession({ sessionId: 'one', level: 1, mastery, confusions: {}, now: NOW });
    const b = buildSession({ sessionId: 'two', level: 1, mastery, confusions: {}, now: NOW });
    expect(a).not.toEqual(b);
  });
});

describe('buildSession for a brand-new child', () => {
  it('anchors on the easiest task when nothing is mastered yet', () => {
    const plan = build({});
    const anchors = plan.filter((t) => t.anchor);
    expect(anchors.length).toBe(DEFAULT_CONFIG.winbackCount);
    const minDifficulty = Math.min(...plan.map((t) => t.difficulty));
    for (const anchor of anchors) {
      expect(anchor.difficulty).toBe(minDifficulty);
    }
  });

  it('focuses only on the first introduction group', () => {
    const plan = build({});
    // Level 1 introduces s and a first. Single-letter targets must be s or a.
    const graphemeTargets = plan
      .map((t) => t.primaryTarget)
      .filter((target) => target.length === 1);
    for (const target of graphemeTargets) {
      expect(['s', 'a']).toContain(target);
    }
  });

  it('never offers a letter the child has not been introduced to, even as a wrong answer', () => {
    // Day one: the child has met s and a. Showing them `f` as a distractor is
    // not a challenge, it is a trick question.
    const plan = build({});
    for (const task of plan) {
      for (const choice of task.choices) {
        if (choice.length === 1) expect(['s', 'a'], `saw ${choice}`).toContain(choice);
      }
    }
  });

  it('only uses words buildable from the letters met so far', () => {
    const plan = build({});
    const wordTargets = plan.map((t) => t.primaryTarget).filter((target) => target.length > 1);
    for (const target of wordTargets) {
      for (const grapheme of target.toLowerCase().split('')) {
        expect(['s', 'a'], `${target} needs ${grapheme}`).toContain(grapheme);
      }
    }
  });

  it('starts with only two choices, so a first screen is winnable', () => {
    const plan = build({});
    const soundTasks = plan.filter((t) => t.taskTypeId === 'sound-hunt');
    expect(soundTasks.length).toBeGreaterThan(0);
    for (const task of soundTasks) {
      expect(task.choices.length).toBe(2);
    }
  });
});

describe('buildSession composition', () => {
  it('weights the plan toward current focus', () => {
    const plan = build(masteredGraphemes(['s', 'a']));
    const focus = plan.filter((t) => t.band === 'focus').length;
    expect(focus).toBeGreaterThanOrEqual(plan.length / 2);
  });

  it('draws win-backs only from mastered targets once some exist', () => {
    const mastery = masteredGraphemes(['s', 'a']);
    const plan = buildSession({ sessionId: 'w', level: 1, mastery, confusions: {}, now: NOW });
    for (const task of plan.filter((t) => t.band === 'winback')) {
      expect(['s', 'a']).toContain(task.primaryTarget);
    }
  });

  it('widens the choice count as the child meets more graphemes', () => {
    const early = build({});
    const later = build(masteredGraphemes(['s', 'a', 't', 'p', 'i']));
    const earlyMax = Math.max(...early.filter((t) => t.taskTypeId === 'sound-hunt').map((t) => t.choices.length));
    const laterMax = Math.max(...later.filter((t) => t.taskTypeId === 'sound-hunt').map((t) => t.choices.length));
    expect(laterMax).toBeGreaterThan(earlyMax);
  });

  it('credits the graphemes of a word task as secondary targets', () => {
    const plan = build(masteredGraphemes(['s', 'a', 't']));
    const wordTasks = plan.filter((t) => t.taskTypeId === 'word-builder' || t.taskTypeId === 'picture-match');
    expect(wordTasks.length).toBeGreaterThan(0);
    for (const task of wordTasks) {
      expect(task.secondaryTargets.length).toBeGreaterThan(0);
    }
  });

  it('gives sound tasks no secondary targets', () => {
    const plan = build(masteredGraphemes(['s', 'a']));
    for (const task of plan.filter((t) => t.taskTypeId === 'sound-hunt' || t.taskTypeId === 'sound-singer')) {
      expect(task.secondaryTargets).toEqual([]);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/sessionBuilder.test.ts`
Expected: FAIL — `Failed to resolve import "./sessionBuilder"`.

- [ ] **Step 3: Write `packages/engine/src/sessionBuilder.ts`**

```ts
import {
  getLevel,
  graphemesForLevel,
  introductionGroupIndex,
  picturableWordsForLevel,
  WORDS,
  wordsForLevel,
} from '@soundlings/curriculum';
import type { GraphemeId, Skill, TargetId, WordId } from '@soundlings/curriculum';
import { withDefaults } from './config';
import type { EngineConfig } from './config';
import { pickGraphemeDistractors, pickTileDistractors, pickWordDistractors } from './distractors';
import { getRecord, isMastered, strengthAt } from './mastery';
import { makeRng, seedFromString, shuffle } from './rng';
import type { Rng } from './rng';
import { easiestTaskTypeForSkill, TASK_TYPES, taskTypesForSkill } from './taskTypes';
import type { TaskTypeMeta } from './taskTypes';
import type { ConfusionMap, MasteryMap, SessionBand, TaskInstance } from './types';

export interface BuildSessionArgs {
  sessionId: string;
  level: number;
  mastery: MasteryMap;
  confusions: ConfusionMap;
  now: number;
  config?: Partial<EngineConfig>;
  /** Caps task difficulty. Set by the frustration guard after a bad session. */
  maxDifficulty?: number;
  /** Overrides session length. Set by the frustration guard on a bad day. */
  length?: number;
}

interface Pairing {
  targetId: TargetId;
  skill: Skill;
}

/**
 * Composes one quest.
 *
 * Shape: focus / review / anchor. Anchors occupy the first, middle and last
 * positions so the child opens confident, gets a breather, and leaves on a
 * success. Focus is the newest unmastered sounds plus the words that contain
 * them, which is what generates secondary mastery credit (see taskTypes.ts).
 */
export function buildSession(args: BuildSessionArgs): TaskInstance[] {
  const config = withDefaults(args.config);
  const length = args.length ?? config.sessionLength;
  const rng = makeRng(seedFromString(args.sessionId));
  const { level, mastery, confusions, now } = args;

  const allowedTaskTypes = TASK_TYPES.filter(
    (t) => t.difficulty <= (args.maxDifficulty ?? Number.POSITIVE_INFINITY),
  );
  const usableTaskTypes = allowedTaskTypes.length > 0 ? allowedTaskTypes : [easiestOverall()];

  const allPairs = allPairings(level);
  const unmasteredAll = allPairs.filter(
    (p) => !isMastered(getRecord(mastery, p.targetId, p.skill, config), now, config),
  );

  const focusGraphemes = currentFocusGraphemes(level, unmasteredAll, config);

  // Restrict everything to what this child has actually MET. A child on their
  // first day has been introduced to two letters, not all seven. Scheduling
  // "review" of a letter they have never seen is not review, it is a trick
  // question, and it is the fastest way to make a five-year-old give up.
  const metGraphemeIds = graphemesMetFor(level, focusGraphemes);
  const metSet = new Set(metGraphemeIds);
  const pairings = allPairs.filter((p) => isComposedOf(p.targetId, metSet));

  const unmastered = pairings.filter(
    (p) => !isMastered(getRecord(mastery, p.targetId, p.skill, config), now, config),
  );
  const mastered = pairings.filter(
    (p) => isMastered(getRecord(mastery, p.targetId, p.skill, config), now, config),
  );

  const focusPool = unmastered.filter((p) => touchesFocus(p, focusGraphemes));
  const reviewPool = rankByUrgency(
    unmastered.filter((p) => !touchesFocus(p, focusGraphemes)),
    mastery,
    now,
    config,
  );
  const winbackPool = mastered
    .filter((p) => strengthAt(getRecord(mastery, p.targetId, p.skill, config), now) >= config.winbackStrength)
    .sort(
      (a, b) =>
        strengthAt(getRecord(mastery, b.targetId, b.skill, config), now) -
        strengthAt(getRecord(mastery, a.targetId, a.skill, config), now),
    );

  const anchorCount = Math.min(config.winbackCount, length);
  const reviewCount = Math.min(config.reviewCount, Math.max(0, length - anchorCount));
  const focusCount = Math.max(0, length - anchorCount - reviewCount);

  const graphemesMet = metGraphemeIds.length;
  const allowedWords = pairings
    .filter((p) => p.skill === 'BLEND_READ')
    .map((p) => p.targetId);

  // Anchors: win-backs when they exist, otherwise the easiest focus task.
  // Invariant 7 — a brand-new child has nothing mastered, and their first ever
  // screen must not be the hardest thing the engine can produce.
  const useWinbacks = winbackPool.length > 0;
  const anchorPairings = useWinbacks
    ? cycle(winbackPool, anchorCount)
    : cycle(focusPool.length > 0 ? focusPool : unmastered, anchorCount);

  const anchors = anchorPairings.map((pairing, index) =>
    makeTask({
      pairing,
      band: useWinbacks ? 'winback' : 'focus',
      anchor: true,
      taskType: useWinbacks
        ? chooseTaskType(pairing, mastery, usableTaskTypes, config, rng)
        : easiestTaskTypeFor(pairing, usableTaskTypes),
      index: `a${index}`,
      level,
      confusions,
      graphemesMet,
      allowedGraphemes: metGraphemeIds,
      allowedWords,
      rng,
    }),
  );

  const focus = cycle(focusPool.length > 0 ? focusPool : unmastered, focusCount).map((pairing, index) =>
    makeTask({
      pairing,
      band: 'focus',
      anchor: false,
      taskType: chooseTaskType(pairing, mastery, usableTaskTypes, config, rng),
      index: `f${index}`,
      level,
      confusions,
      graphemesMet,
      allowedGraphemes: metGraphemeIds,
      allowedWords,
      rng,
    }),
  );

  const review = cycle(reviewPool.length > 0 ? reviewPool : focusPool, reviewCount).map((pairing, index) =>
    makeTask({
      pairing,
      band: 'review',
      anchor: false,
      taskType: chooseTaskType(pairing, mastery, usableTaskTypes, config, rng),
      index: `r${index}`,
      level,
      confusions,
      graphemesMet,
      allowedGraphemes: metGraphemeIds,
      allowedWords,
      rng,
    }),
  );

  return arrange(anchors, [...focus, ...review], length, rng);
}

/**
 * Every grapheme the child has been introduced to: all introduction groups up
 * to and including the group their current focus sits in.
 */
function graphemesMetFor(level: number, focusGraphemes: GraphemeId[]): GraphemeId[] {
  const groups = getLevel(level).introductionGroups;
  if (focusGraphemes.length === 0) return groups.flat();
  const furthest = Math.max(...focusGraphemes.map((g) => introductionGroupIndex(level, g)));
  return groups.slice(0, furthest + 1).flat();
}

/** True when a target is a met grapheme, or a word built only from met graphemes. */
function isComposedOf(targetId: TargetId, met: Set<GraphemeId>): boolean {
  if (met.has(targetId)) return true;
  const word = WORDS[targetId as WordId];
  if (!word) return false;
  return word.graphemes.every((g) => met.has(g));
}

/** Every (target, skill) pairing teachable at this level. */
function allPairings(level: number): Pairing[] {
  const pairings: Pairing[] = [];
  for (const grapheme of graphemesForLevel(level)) {
    pairings.push({ targetId: grapheme.id, skill: 'SOUND_ID' });
    pairings.push({ targetId: grapheme.id, skill: 'LETTER_SOUND' });
  }
  for (const word of picturableWordsForLevel(level)) {
    pairings.push({ targetId: word.id, skill: 'BLEND_READ' });
  }
  for (const word of wordsForLevel(level)) {
    pairings.push({ targetId: word.id, skill: 'SEGMENT_SPELL' });
  }
  return pairings;
}

/**
 * The graphemes the child is currently learning: the earliest introduction
 * groups that still contain something unmastered, capped at
 * `focusTargetCount` graphemes so the front stays small and finishable.
 */
function currentFocusGraphemes(
  level: number,
  unmastered: Pairing[],
  config: EngineConfig,
): GraphemeId[] {
  const unmasteredGraphemes = graphemesForLevel(level)
    .filter((g) => unmastered.some((p) => p.targetId === g.id))
    .sort(
      (a, b) =>
        introductionGroupIndex(level, a.id) - introductionGroupIndex(level, b.id) ||
        a.sequenceIndex - b.sequenceIndex,
    );

  if (unmasteredGraphemes.length === 0) return getLevel(level).graphemeIds;
  return unmasteredGraphemes.slice(0, config.focusTargetCount).map((g) => g.id);
}

/** True when this pairing exercises one of the focus graphemes. */
function touchesFocus(pairing: Pairing, focusGraphemes: GraphemeId[]): boolean {
  if (focusGraphemes.includes(pairing.targetId)) return true;
  const word = WORDS[pairing.targetId as WordId];
  if (!word) return false;
  return word.graphemes.some((g) => focusGraphemes.includes(g));
}

/** Weakest and most overdue first. */
function rankByUrgency(
  pairings: Pairing[],
  mastery: MasteryMap,
  now: number,
  config: EngineConfig,
): Pairing[] {
  return [...pairings].sort((a, b) => urgency(b) - urgency(a));

  function urgency(pairing: Pairing): number {
    const record = getRecord(mastery, pairing.targetId, pairing.skill, config);
    const strength = strengthAt(record, now);
    const elapsedHours = record.lastSeenAt === 0 ? 0 : (now - record.lastSeenAt) / 3_600_000;
    const overdue = record.lastSeenAt === 0 ? 0 : elapsedHours / record.halfLifeHours;
    return (1 - strength) * (1 + overdue);
  }
}

/**
 * Prefers a task type the child has not yet proven for this target, which is
 * how a target reaches the two-task-type mastery bar instead of stalling.
 */
function chooseTaskType(
  pairing: Pairing,
  mastery: MasteryMap,
  usable: TaskTypeMeta[],
  config: EngineConfig,
  rng: Rng,
): TaskTypeMeta {
  const candidates = usable.filter((t) => t.skill === pairing.skill);
  const pool = candidates.length > 0 ? candidates : taskTypesForSkill(pairing.skill);
  if (pool.length === 1) return pool[0];

  const seen = getRecord(mastery, pairing.targetId, pairing.skill, config).taskTypesSeen;
  const unseen = pool.filter((t) => !seen.includes(t.id));
  const choices = unseen.length > 0 ? unseen : pool;
  return shuffle(choices, rng)[0];
}

function easiestTaskTypeFor(pairing: Pairing, usable: TaskTypeMeta[]): TaskTypeMeta {
  const candidates = usable.filter((t) => t.skill === pairing.skill);
  if (candidates.length === 0) return easiestTaskTypeForSkill(pairing.skill);
  return candidates.reduce((best, t) => (t.difficulty < best.difficulty ? t : best));
}

function easiestOverall(): TaskTypeMeta {
  return TASK_TYPES.reduce((best, t) => (t.difficulty < best.difficulty ? t : best));
}

/** Repeats a pool in order until `count` items are produced. */
function cycle<T>(pool: readonly T[], count: number): T[] {
  if (pool.length === 0 || count <= 0) return [];
  const out: T[] = [];
  for (let i = 0; i < count; i += 1) out.push(pool[i % pool.length]);
  return out;
}

interface MakeTaskArgs {
  pairing: Pairing;
  band: SessionBand;
  anchor: boolean;
  taskType: TaskTypeMeta;
  index: string;
  level: number;
  confusions: ConfusionMap;
  /** How many graphemes the child has met. Drives how many choices to show. */
  graphemesMet: number;
  allowedGraphemes: GraphemeId[];
  allowedWords: TargetId[];
  rng: Rng;
}

function makeTask(args: MakeTaskArgs): TaskInstance {
  const { pairing, band, anchor, taskType, index, level, confusions, graphemesMet, rng } = args;
  const { allowedGraphemes, allowedWords } = args;
  const seed = Math.floor(rng() * 2 ** 31);
  const instanceRng = makeRng(seed);

  // Choice count grows with how much the child has met, so a first session is
  // a two-way choice and a late one is a four-way choice.
  const choiceCount = Math.min(
    taskType.maxChoices,
    Math.max(taskType.minChoices, Math.min(graphemesMet - 1, taskType.maxChoices)),
  );

  let choices: TargetId[];
  let secondaryTargets: TargetId[] = [];

  if (taskType.skill === 'SOUND_ID' || taskType.skill === 'LETTER_SOUND') {
    const distractors = pickGraphemeDistractors({
      target: pairing.targetId,
      count: choiceCount - 1,
      level,
      confusions,
      allowed: allowedGraphemes,
      rng: instanceRng,
    });
    choices = shuffle([pairing.targetId, ...distractors], instanceRng);
  } else if (taskType.skill === 'BLEND_READ') {
    const distractors = pickWordDistractors({
      target: pairing.targetId,
      count: choiceCount - 1,
      level,
      allowedWords,
      rng: instanceRng,
    });
    choices = shuffle([pairing.targetId, ...distractors], instanceRng);
    secondaryTargets = WORDS[pairing.targetId].graphemes;
  } else {
    // SEGMENT_SPELL: choices are letter tiles — the word's own letters plus
    // one or two extras, shuffled so the correct order is never the tile order.
    const word = WORDS[pairing.targetId];
    const extras = pickTileDistractors({
      target: pairing.targetId,
      count: Math.max(1, choiceCount - word.graphemes.length),
      level,
      confusions,
      allowed: allowedGraphemes,
      rng: instanceRng,
    });
    choices = shuffle([...word.graphemes, ...extras], instanceRng);
    secondaryTargets = word.graphemes;
  }

  return {
    id: `${index}-${taskType.id}-${pairing.targetId}`,
    taskTypeId: taskType.id,
    skill: taskType.skill,
    primaryTarget: pairing.targetId,
    secondaryTargets: taskType.secondaryTargets === 'graphemes' ? secondaryTargets : [],
    choices,
    correctChoice: pairing.targetId,
    band,
    anchor,
    difficulty: taskType.difficulty,
    seed,
  };
}

/**
 * Places anchors at the open, the middle third and the close, fills the rest,
 * then removes adjacent repeats of the same mini-game. Variety is not a polish
 * detail here: back-to-back identical games is exactly what makes a child
 * describe an app as boring.
 */
function arrange(
  anchors: TaskInstance[],
  rest: TaskInstance[],
  length: number,
  rng: Rng,
): TaskInstance[] {
  const plan: (TaskInstance | undefined)[] = new Array(length).fill(undefined);
  const anchorSlots = anchorPositions(length, anchors.length);

  anchorSlots.forEach((slot, i) => {
    plan[slot] = anchors[i];
  });

  const filler = shuffle(rest, rng);
  let next = 0;
  for (let i = 0; i < length; i += 1) {
    if (plan[i] === undefined) {
      plan[i] = filler[next % filler.length];
      next += 1;
    }
  }

  const result = plan as TaskInstance[];
  return separateRepeats(result, new Set(anchorSlots));
}

function anchorPositions(length: number, anchorCount: number): number[] {
  const slots = new Set<number>();
  if (anchorCount >= 1) slots.add(0);
  if (anchorCount >= 2) slots.add(length - 1);
  if (anchorCount >= 3) slots.add(Math.floor(length / 2));
  let candidate = 1;
  while (slots.size < anchorCount && candidate < length - 1) {
    slots.add(candidate);
    candidate += 2;
  }
  return [...slots].sort((a, b) => a - b);
}

/** Swaps non-anchor positions until no two neighbours share a task type. */
function separateRepeats(plan: TaskInstance[], anchorSlots: Set<number>): TaskInstance[] {
  const result = [...plan];
  for (let pass = 0; pass < result.length; pass += 1) {
    let changed = false;
    for (let i = 1; i < result.length; i += 1) {
      if (result[i].taskTypeId !== result[i - 1].taskTypeId) continue;
      const swapIndex = findSwap(result, i, anchorSlots);
      if (swapIndex === -1) continue;
      const a = result[i];
      result[i] = result[swapIndex];
      result[swapIndex] = a;
      changed = true;
    }
    if (!changed) break;
  }
  return result;
}

function findSwap(plan: TaskInstance[], conflictAt: number, anchorSlots: Set<number>): number {
  const movable = anchorSlots.has(conflictAt) ? conflictAt - 1 : conflictAt;
  if (anchorSlots.has(movable)) return -1;
  const before = plan[movable - 1]?.taskTypeId;
  const after = plan[movable + 1]?.taskTypeId;

  for (let j = 0; j < plan.length; j += 1) {
    if (j === movable || anchorSlots.has(j)) continue;
    const candidate = plan[j];
    if (candidate.taskTypeId === before || candidate.taskTypeId === after) continue;
    const jBefore = plan[j - 1]?.taskTypeId;
    const jAfter = plan[j + 1]?.taskTypeId;
    const moving = plan[movable].taskTypeId;
    if (moving === jBefore || moving === jAfter) continue;
    return j;
  }
  return -1;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/sessionBuilder.test.ts`
Expected: PASS, 21 tests.

If the "never places two of the same mini-game back to back" test fails for a particular seed, the bug is in `findSwap`, not in the test. Do not weaken the test — a child noticing the same game twice in a row is the exact failure this prevents.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/sessionBuilder.ts packages/engine/src/sessionBuilder.test.ts
git commit -m "feat(engine): compose adaptive quests with anchors, focus and review bands"
```

---

## Task 13: Frustration guard

**Files:**
- Create: `packages/engine/src/frustration.ts`
- Test: `packages/engine/src/frustration.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/engine/src/frustration.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from './config';
import { FrustrationGuard } from './frustration';

describe('FrustrationGuard', () => {
  it('asks for no help on a correct first answer', () => {
    const guard = new FrustrationGuard(DEFAULT_CONFIG);
    const directive = guard.record('s', true);
    expect(directive).toEqual({ hintTier: 0, scaffold: false, abandon: false, capDifficulty: null, truncateTo: null });
  });

  it('raises a hint after the first error on a target', () => {
    const guard = new FrustrationGuard(DEFAULT_CONFIG);
    expect(guard.record('s', false).hintTier).toBe(2);
  });

  it('scaffolds after the second error on the same target', () => {
    const guard = new FrustrationGuard(DEFAULT_CONFIG);
    guard.record('s', false);
    const directive = guard.record('s', false);
    expect(directive.scaffold).toBe(true);
    expect(directive.hintTier).toBe(3);
    expect(directive.abandon).toBe(false);
  });

  it('abandons the task after the third error and caps difficulty', () => {
    const guard = new FrustrationGuard(DEFAULT_CONFIG);
    guard.record('s', false);
    guard.record('s', false);
    const directive = guard.record('s', false);
    expect(directive.abandon).toBe(true);
    expect(directive.capDifficulty).toBe(1);
  });

  it('counts errors per target, not across the session', () => {
    const guard = new FrustrationGuard(DEFAULT_CONFIG);
    guard.record('s', false);
    guard.record('a', false);
    expect(guard.record('t', false).scaffold).toBe(false);
  });

  it('truncates the session when the child struggles on three different targets', () => {
    const guard = new FrustrationGuard(DEFAULT_CONFIG);
    guard.record('s', false);
    guard.record('s', false);
    guard.record('s', false);
    guard.record('a', false);
    guard.record('a', false);
    guard.record('a', false);
    guard.record('t', false);
    guard.record('t', false);
    const directive = guard.record('t', false);
    expect(directive.truncateTo).toBe(DEFAULT_CONFIG.badDaySessionLength);
  });

  it('resets a target error count once the child gets it right', () => {
    const guard = new FrustrationGuard(DEFAULT_CONFIG);
    guard.record('s', false);
    guard.record('s', true);
    expect(guard.record('s', false).hintTier).toBe(2);
    expect(guard.record('s', false).scaffold).toBe(true);
  });

  it('reports how many targets the child has struggled with', () => {
    const guard = new FrustrationGuard(DEFAULT_CONFIG);
    guard.record('s', false);
    guard.record('s', false);
    guard.record('s', false);
    expect(guard.strugglingTargets()).toEqual(['s']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/frustration.test.ts`
Expected: FAIL — `Failed to resolve import "./frustration"`.

- [ ] **Step 3: Write `packages/engine/src/frustration.ts`**

```ts
import type { TargetId } from '@soundlings/curriculum';
import type { EngineConfig } from './config';

export interface GuardDirective {
  /** 0 none, 1 idle nudge, 2 mnemonic plus narrowing, 3 show the answer. */
  hintTier: 0 | 1 | 2 | 3;
  /** Show the answer and accept a tap on it. Counts for progress, not mastery. */
  scaffold: boolean;
  /** Stop asking this question; the runner inserts a win-back instead. */
  abandon: boolean;
  /** Cap the difficulty of remaining tasks. */
  capDifficulty: number | null;
  /** Shorten the session to this many tasks. */
  truncateTo: number | null;
}

/**
 * Tracks within-session errors and decides when to help.
 *
 * Stateful and per-session by design — frustration is a property of the
 * sitting, not of the child. Yesterday's bad afternoon must not make today's
 * session easier, and that is why this state is deliberately never persisted.
 */
export class FrustrationGuard {
  private readonly errorsByTarget = new Map<TargetId, number>();

  private readonly abandonedTargets = new Set<TargetId>();

  constructor(private readonly config: EngineConfig) {}

  record(targetId: TargetId, correct: boolean): GuardDirective {
    if (correct) {
      this.errorsByTarget.set(targetId, 0);
      return none();
    }

    const errors = (this.errorsByTarget.get(targetId) ?? 0) + 1;
    this.errorsByTarget.set(targetId, errors);

    if (errors >= this.config.abandonAfterErrors) {
      this.abandonedTargets.add(targetId);
      const badDay = this.abandonedTargets.size >= this.config.badDayDistinctTargets;
      return {
        hintTier: 3,
        scaffold: true,
        abandon: true,
        // Drop to the easiest task type for whatever remains.
        capDifficulty: 1,
        // A tired or unwell child gets a short, kind session rather than a
        // full quest of failure. Attempts still record normally, so the
        // mastery data stays honest; we simply stop asking.
        truncateTo: badDay ? this.config.badDaySessionLength : null,
      };
    }

    if (errors >= this.config.scaffoldAfterErrors) {
      return { hintTier: 3, scaffold: true, abandon: false, capDifficulty: null, truncateTo: null };
    }

    return { hintTier: 2, scaffold: false, abandon: false, capDifficulty: null, truncateTo: null };
  }

  errorsFor(targetId: TargetId): number {
    return this.errorsByTarget.get(targetId) ?? 0;
  }

  strugglingTargets(): TargetId[] {
    return [...this.abandonedTargets];
  }
}

function none(): GuardDirective {
  return { hintTier: 0, scaffold: false, abandon: false, capDifficulty: null, truncateTo: null };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/frustration.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/frustration.ts packages/engine/src/frustration.test.ts
git commit -m "feat(engine): add per-session frustration guard with scaffold and bad-day handling"
```

---

## Task 14: Level completion and progress

**Files:**
- Create: `packages/engine/src/completion.ts`
- Create: `packages/engine/src/index.ts`
- Test: `packages/engine/src/completion.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/engine/src/completion.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from './config';
import { levelProgress } from './completion';
import { applyAttempt, emptyRecord } from './mastery';
import { masteryKey } from './types';
import type { Attempt, MasteryMap, MasteryKey } from './types';
import type { Skill } from '@soundlings/curriculum';

const HOUR = 3_600_000;
const NOW = 500 * HOUR;

function mastered(targetId: string, skill: Skill): [MasteryKey, ReturnType<typeof emptyRecord>] {
  let record = emptyRecord(targetId, skill, DEFAULT_CONFIG);
  const base: Attempt = {
    sessionId: '', targetId, skill, taskTypeId: 'sound-hunt',
    correct: true, scaffolded: false, latencyMs: 800, weight: 1, at: NOW,
  };
  record = applyAttempt(record, { ...base, sessionId: 'one', taskTypeId: 'sound-hunt' }, DEFAULT_CONFIG);
  record = applyAttempt(record, { ...base, sessionId: 'two', taskTypeId: 'word-builder' }, DEFAULT_CONFIG);
  record = applyAttempt(record, { ...base, sessionId: 'three', taskTypeId: 'picture-match' }, DEFAULT_CONFIG);
  return [masteryKey(targetId, skill), record];
}

function mapOf(entries: Array<[MasteryKey, ReturnType<typeof emptyRecord>]>): MasteryMap {
  return Object.fromEntries(entries);
}

describe('levelProgress', () => {
  it('reports nothing mastered for a brand-new child', () => {
    const progress = levelProgress(1, {}, NOW);
    expect(progress.graphemesMastered).toBe(0);
    expect(progress.blendWordsMastered).toBe(0);
    expect(progress.segmentWordsMastered).toBe(0);
    expect(progress.complete).toBe(false);
  });

  it('counts a grapheme only when both sound skills are mastered', () => {
    const onlyOneSkill = mapOf([mastered('s', 'SOUND_ID')]);
    expect(levelProgress(1, onlyOneSkill, NOW).graphemesMastered).toBe(0);

    const bothSkills = mapOf([mastered('s', 'SOUND_ID'), mastered('s', 'LETTER_SOUND')]);
    expect(levelProgress(1, bothSkills, NOW).graphemesMastered).toBe(1);
  });

  it('is not complete until every grapheme and both word quotas are met', () => {
    const entries = ['s', 'a', 't', 'p', 'i', 'm', 'f'].flatMap((g) => [
      mastered(g, 'SOUND_ID'),
      mastered(g, 'LETTER_SOUND'),
    ]);
    const graphemesOnly = levelProgress(1, mapOf(entries), NOW);
    expect(graphemesOnly.graphemesMastered).toBe(7);
    expect(graphemesOnly.complete).toBe(false);
  });

  it('is complete when graphemes, blend words and spelling words all clear', () => {
    const graphemeEntries = ['s', 'a', 't', 'p', 'i', 'm', 'f'].flatMap((g) => [
      mastered(g, 'SOUND_ID'),
      mastered(g, 'LETTER_SOUND'),
    ]);
    const blendWords = ['pat', 'tap', 'pit', 'sit', 'sip', 'pip', 'fat', 'fit'];
    const spellWords = ['sat', 'tip', 'sap', 'mat', 'map', 'at'];
    const entries = [
      ...graphemeEntries,
      ...blendWords.map((w) => mastered(w, 'BLEND_READ')),
      ...spellWords.map((w) => mastered(w, 'SEGMENT_SPELL')),
    ];
    const progress = levelProgress(1, mapOf(entries), NOW);
    expect(progress.blendWordsMastered).toBe(8);
    expect(progress.segmentWordsMastered).toBe(6);
    expect(progress.complete).toBe(true);
  });

  it('reports a fraction suitable for a progress bar', () => {
    const progress = levelProgress(1, mapOf([mastered('s', 'SOUND_ID'), mastered('s', 'LETTER_SOUND')]), NOW);
    expect(progress.fraction).toBeGreaterThan(0);
    expect(progress.fraction).toBeLessThan(1);
  });

  it('lists which creatures have been earned', () => {
    const entries = [mastered('m', 'SOUND_ID'), mastered('m', 'LETTER_SOUND')];
    expect(levelProgress(1, mapOf(entries), NOW).creaturesEarned).toEqual(['momo']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/completion.test.ts`
Expected: FAIL — `Failed to resolve import "./completion"`.

- [ ] **Step 3: Write `packages/engine/src/completion.ts`**

```ts
import {
  creatureForGrapheme,
  graphemesForLevel,
  picturableWordsForLevel,
  wordsForLevel,
} from '@soundlings/curriculum';
import { withDefaults } from './config';
import type { EngineConfig } from './config';
import { getRecord, isMastered } from './mastery';
import type { MasteryMap } from './types';

export interface LevelProgress {
  level: number;
  graphemesMastered: number;
  graphemesRequired: number;
  blendWordsMastered: number;
  blendWordsRequired: number;
  segmentWordsMastered: number;
  segmentWordsRequired: number;
  /** 0..1, for a progress bar. */
  fraction: number;
  creaturesEarned: string[];
  complete: boolean;
}

/**
 * A level is finished when the child can prove it, not when they have played a
 * fixed number of games. A grapheme counts only when *both* sound skills are
 * mastered — recognising `s` on sight and recalling it from the sound /s/ are
 * different abilities, and reading needs both.
 */
export function levelProgress(
  level: number,
  mastery: MasteryMap,
  now: number,
  partialConfig?: Partial<EngineConfig>,
): LevelProgress {
  const config = withDefaults(partialConfig);
  const graphemes = graphemesForLevel(level);

  const masteredGraphemes = graphemes.filter(
    (g) =>
      isMastered(getRecord(mastery, g.id, 'SOUND_ID', config), now, config) &&
      isMastered(getRecord(mastery, g.id, 'LETTER_SOUND', config), now, config),
  );

  const blendWordsMastered = picturableWordsForLevel(level).filter((w) =>
    isMastered(getRecord(mastery, w.id, 'BLEND_READ', config), now, config),
  ).length;

  const segmentWordsMastered = wordsForLevel(level).filter((w) =>
    isMastered(getRecord(mastery, w.id, 'SEGMENT_SPELL', config), now, config),
  ).length;

  const parts = [
    masteredGraphemes.length / graphemes.length,
    Math.min(1, blendWordsMastered / config.blendWordsRequired),
    Math.min(1, segmentWordsMastered / config.segmentWordsRequired),
  ];

  return {
    level,
    graphemesMastered: masteredGraphemes.length,
    graphemesRequired: graphemes.length,
    blendWordsMastered,
    blendWordsRequired: config.blendWordsRequired,
    segmentWordsMastered,
    segmentWordsRequired: config.segmentWordsRequired,
    fraction: parts.reduce((sum, part) => sum + part, 0) / parts.length,
    creaturesEarned: masteredGraphemes.map((g) => creatureForGrapheme(g.id).id),
    complete:
      masteredGraphemes.length === graphemes.length &&
      blendWordsMastered >= config.blendWordsRequired &&
      segmentWordsMastered >= config.segmentWordsRequired,
  };
}
```

- [ ] **Step 4: Write `packages/engine/src/index.ts`**

```ts
export * from './types';
export * from './config';
export * from './rng';
export * from './taskTypes';
export * from './distractors';
export * from './frustration';
export * from './completion';
export { buildSession } from './sessionBuilder';
export type { BuildSessionArgs } from './sessionBuilder';
export {
  applyAttempt,
  emptyRecord,
  getRecord,
  isMastered,
  recordAttempt,
  recordAttempts,
  strengthAt,
} from './mastery';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run packages/engine/src/completion.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/completion.ts packages/engine/src/index.ts packages/engine/src/completion.test.ts
git commit -m "feat(engine): add level progress and completion by proven mastery"
```

---

## Task 15: Simulation harness

**Files:**
- Create: `packages/engine/src/simulate.ts`
- Test: `packages/engine/src/simulate.test.ts`

This task is what makes the pacing claims in the spec true rather than hoped-for. It plays synthetic children through Level 1 and asserts the number of quests lands in a sane range. If it fails, change `config.ts`, never the expectations.

- [ ] **Step 1: Write the failing test**

Create `packages/engine/src/simulate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { simulateChild } from './simulate';

describe('pacing simulation', () => {
  it('finishes Level 1 for a strong learner in 4 to 8 quests', () => {
    const result = simulateChild({ profile: 'fast', seed: 1 });
    expect(result.complete).toBe(true);
    expect(result.quests).toBeGreaterThanOrEqual(4);
    expect(result.quests).toBeLessThanOrEqual(8);
  });

  it('finishes Level 1 for an average learner in 6 to 12 quests', () => {
    const result = simulateChild({ profile: 'average', seed: 2 });
    expect(result.complete).toBe(true);
    expect(result.quests).toBeGreaterThanOrEqual(6);
    expect(result.quests).toBeLessThanOrEqual(12);
  });

  it('still finishes Level 1 for a struggling learner, taking longer', () => {
    const result = simulateChild({ profile: 'struggling', seed: 3 });
    expect(result.complete).toBe(true);
    expect(result.quests).toBeLessThanOrEqual(20);
  });

  it('gives a struggling learner more practice than a strong one', () => {
    const fast = simulateChild({ profile: 'fast', seed: 4 });
    const slow = simulateChild({ profile: 'struggling', seed: 4 });
    expect(slow.quests).toBeGreaterThan(fast.quests);
  });

  it('never ends a quest on a failure', () => {
    for (const profile of ['fast', 'average', 'struggling'] as const) {
      const result = simulateChild({ profile, seed: 5 });
      expect(result.questsEndingOnFailure, profile).toBe(0);
    }
  });

  it('is deterministic for a given seed', () => {
    expect(simulateChild({ profile: 'average', seed: 8 })).toEqual(
      simulateChild({ profile: 'average', seed: 8 }),
    );
  });

  it('holds the strong learner under the competitor 40-game benchmark', () => {
    // Phonics Hero requires 40 fixed games per level for every child.
    const result = simulateChild({ profile: 'fast', seed: 9 });
    expect(result.tasksPlayed).toBeLessThan(40 * 2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/simulate.test.ts`
Expected: FAIL — `Failed to resolve import "./simulate"`.

- [ ] **Step 3: Write `packages/engine/src/simulate.ts`**

```ts
import { withDefaults } from './config';
import type { EngineConfig } from './config';
import { levelProgress } from './completion';
import { recordConfusion } from './distractors';
import { FrustrationGuard } from './frustration';
import { recordAttempt } from './mastery';
import { makeRng } from './rng';
import { buildSession } from './sessionBuilder';
import type { Attempt, ConfusionMap, MasteryMap, TaskInstance } from './types';

export type ChildProfile = 'fast' | 'average' | 'struggling';

export interface SimulateArgs {
  profile: ChildProfile;
  seed: number;
  level?: number;
  maxQuests?: number;
  config?: Partial<EngineConfig>;
}

export interface SimulateResult {
  profile: ChildProfile;
  quests: number;
  tasksPlayed: number;
  complete: boolean;
  questsEndingOnFailure: number;
  scaffoldedAnswers: number;
}

/** Probability a synthetic child answers correctly, before any help. */
const ACCURACY: Record<ChildProfile, number> = {
  fast: 0.95,
  average: 0.8,
  struggling: 0.55,
};

/** Milliseconds a synthetic child takes. Struggling children are also slower. */
const LATENCY: Record<ChildProfile, number> = {
  fast: 1200,
  average: 2600,
  struggling: 5200,
};

const HOUR = 3_600_000;

/**
 * Plays a synthetic child through a level, one quest per simulated day.
 *
 * One quest per day matters: mastery requires retention across sessions, so
 * simulating several quests within one hour would never exercise decay and the
 * numbers would be meaningless.
 */
export function simulateChild(args: SimulateArgs): SimulateResult {
  const config = withDefaults(args.config);
  const level = args.level ?? 1;
  const maxQuests = args.maxQuests ?? 40;
  const rng = makeRng(args.seed);
  const accuracy = ACCURACY[args.profile];
  const latency = LATENCY[args.profile];

  let mastery: MasteryMap = {};
  let confusions: ConfusionMap = {};
  let now = 1000 * HOUR;
  let quests = 0;
  let tasksPlayed = 0;
  let scaffoldedAnswers = 0;
  let questsEndingOnFailure = 0;

  while (quests < maxQuests && !levelProgress(level, mastery, now, config).complete) {
    quests += 1;
    const sessionId = `sim-${args.seed}-${quests}`;
    const guard = new FrustrationGuard(config);

    let plan = buildSession({ sessionId, level, mastery, confusions, now, config });
    let lastOutcomeCorrect = true;

    for (let i = 0; i < plan.length; i += 1) {
      const task = plan[i];
      tasksPlayed += 1;
      now += 20_000;

      let correct = rng() < accuracy;
      let scaffolded = false;

      // A wrong answer triggers the guard, which may hand the child the answer.
      if (!correct) {
        const directive = guard.record(task.primaryTarget, false);
        if (directive.scaffold) {
          scaffolded = true;
          correct = true;
          scaffoldedAnswers += 1;
        }
        if (directive.truncateTo !== null && directive.truncateTo < plan.length) {
          plan = plan.slice(0, directive.truncateTo);
        }
      } else {
        guard.record(task.primaryTarget, true);
      }

      mastery = applyTaskOutcome({
        mastery,
        task,
        sessionId,
        correct,
        scaffolded,
        latencyMs: latency,
        at: now,
        config,
      });

      if (!correct) {
        const wrongChoice = task.choices.find((c) => c !== task.correctChoice);
        if (wrongChoice) confusions = recordConfusion(confusions, task.primaryTarget, wrongChoice);
      }

      lastOutcomeCorrect = correct;
    }

    if (!lastOutcomeCorrect) questsEndingOnFailure += 1;

    // Next quest is the next day.
    now += 20 * HOUR;
  }

  return {
    profile: args.profile,
    quests,
    tasksPlayed,
    complete: levelProgress(level, mastery, now, config).complete,
    questsEndingOnFailure,
    scaffoldedAnswers,
  };
}

/**
 * Folds a completed task into the mastery map: full credit for the primary
 * target, half credit for each secondary target.
 *
 * Exported because the quest runner in apps/game must apply outcomes exactly
 * the same way the simulation does — if these ever diverge, the calibrated
 * pacing numbers stop describing the real game.
 */
export function applyTaskOutcome(args: {
  mastery: MasteryMap;
  task: TaskInstance;
  sessionId: string;
  correct: boolean;
  scaffolded: boolean;
  latencyMs: number;
  at: number;
  config: EngineConfig;
  chosen?: string;
}): MasteryMap {
  const { mastery, task, sessionId, correct, scaffolded, latencyMs, at, config, chosen } = args;

  const attempts: Attempt[] = [
    {
      sessionId,
      targetId: task.primaryTarget,
      skill: task.skill,
      taskTypeId: task.taskTypeId,
      correct,
      scaffolded,
      latencyMs,
      weight: 1,
      at,
      ...(chosen === undefined ? {} : { chosen }),
    },
  ];

  // Spelling or reading a word is weaker but real evidence for its sounds.
  for (const secondary of task.secondaryTargets) {
    attempts.push({
      sessionId,
      targetId: secondary,
      skill: 'SOUND_ID',
      taskTypeId: task.taskTypeId,
      correct,
      scaffolded,
      latencyMs,
      weight: config.secondaryWeight,
      at,
    });
  }

  return attempts.reduce((acc, attempt) => recordAttempt(acc, attempt, config), mastery);
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run packages/engine/src/simulate.test.ts`
Expected: PASS, 7 tests.

If a range assertion fails, tune `DEFAULT_CONFIG` — most likely `masteryCorrect`, `secondaryWeight`, or `initialHalfLifeHours` — and re-run. Record what you changed in the commit message. Do not widen the test's range: the ranges are the product promise.

- [ ] **Step 5: Export the harness and run everything**

Add to `packages/engine/src/index.ts`:

```ts
export { applyTaskOutcome, simulateChild } from './simulate';
export type { ChildProfile, SimulateArgs, SimulateResult } from './simulate';
```

Run: `npm test`
Expected: PASS — all curriculum and engine suites green.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/simulate.ts packages/engine/src/simulate.test.ts packages/engine/src/index.ts
git commit -m "feat(engine): add synthetic-child simulation to calibrate level pacing"
```

---
## Task 16: Soft Paper design tokens

**Files:**
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/src/tokens.ts`
- Create: `packages/ui/src/index.ts`
- Test: `packages/ui/src/tokens.test.ts`

The art direction is "Soft Paper": warm paper grounds, hand-cut collage shapes, muted palette. Two rules that are easy to break and expensive to fix:

1. **Letters are never decorative.** Children cannot read a double-storey `a` or a looped `g`. Letter display uses a plain infant sans at heavy weight. The style lives in the world and the creatures, never in the letterforms.
2. **A calm palette does not mean calm feedback.** Correct answers get a bright, fast, physical response. The muted palette is what makes that pop read as special rather than as the fifth flashing thing on screen.

- [ ] **Step 1: Create `packages/ui/package.json`**

```json
{
  "name": "@soundlings/ui",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "dependencies": {}
}
```

- [ ] **Step 2: Create `packages/ui/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Write the failing test**

Create `packages/ui/src/tokens.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { contrastRatio, hitSlop, tokens } from './tokens';

describe('design tokens', () => {
  it('defines every colour as a six-digit hex value', () => {
    for (const [name, value] of Object.entries(tokens.color)) {
      expect(value, name).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('meets WCAG AA contrast for body text on paper', () => {
    expect(contrastRatio(tokens.color.ink, tokens.color.paper)).toBeGreaterThanOrEqual(4.5);
  });

  it('meets WCAG AA contrast for letters on a tile', () => {
    expect(contrastRatio(tokens.color.ink, tokens.color.tile)).toBeGreaterThanOrEqual(4.5);
  });

  it('meets WCAG AA contrast for text on the correct-answer colour', () => {
    expect(contrastRatio(tokens.color.onAccent, tokens.color.correct)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps every tap target at or above the 44pt accessibility minimum', () => {
    for (const [name, size] of Object.entries(tokens.tap)) {
      expect(size, name).toBeGreaterThanOrEqual(44);
    }
  });

  it('makes the primary child-facing tap target far larger than the minimum', () => {
    // Five-year-olds on a moving iPad need generous targets, not legal minimums.
    expect(tokens.tap.tile).toBeGreaterThanOrEqual(96);
  });

  it('exposes a hitSlop helper that pads small targets out to the minimum', () => {
    expect(hitSlop(30)).toEqual({ top: 7, bottom: 7, left: 7, right: 7 });
    expect(hitSlop(60)).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
  });

  it('uses an infant-safe letter font stack with a single-storey a', () => {
    expect(tokens.font.letter).toContain('Andika');
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run packages/ui/src/tokens.test.ts`
Expected: FAIL — `Failed to resolve import "./tokens"`.

- [ ] **Step 5: Write `packages/ui/src/tokens.ts`**

```ts
/**
 * Soft Paper design tokens.
 *
 * Warm paper grounds, collage shapes, muted palette. Chosen to read as a
 * lovingly made toy rather than an app, and to be visually distinct from the
 * saturated purple-and-yellow house style every competitor uses.
 */
export const tokens = {
  color: {
    /** Page ground. */
    paper: '#f6efe4',
    /** Raised surfaces: letter tiles, cards. */
    tile: '#fffdf8',
    /** Edge and shadow of a raised surface. */
    tileEdge: '#e0d4c0',
    /** Primary text and, crucially, letterforms. */
    ink: '#3a3028',
    /** Secondary text. */
    inkSoft: '#6b5b4a',
    /** Decorative strokes and dividers. */
    line: '#eadfcb',
    /** Brand accent — creature blush, highlights. */
    accent: '#e8b4a0',
    /** Text on accent or correct fills. */
    onAccent: '#3a3028',
    /** Correct answer. Deliberately bright against the muted ground. */
    correct: '#9ccfa4',
    /**
     * "Not that one". Never red: a five-year-old reads red as told off, and we
     * are trying to make being wrong feel safe. This is a soft, neutral dim.
     */
    notThis: '#cfc3b2',
    /** Hint highlight. */
    hint: '#f3d9a6',
    /** Star and reward gold. */
    gold: '#e2b23c',
  },
  /** Minimum rendered sizes in points. */
  tap: {
    /** Platform accessibility minimum. Never go below this. */
    min: 44,
    /** Secondary controls: hint owl, back. */
    control: 56,
    /** Letter and picture tiles — the child's main target. */
    tile: 112,
    /** The big Play button. */
    primary: 160,
  },
  space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 40, xxl: 64 },
  radius: { sm: 8, md: 16, lg: 24, pill: 999 },
  type: {
    /** Letter displayed on a tile. */
    letter: 56,
    /** Word displayed for reading. */
    word: 44,
    title: 32,
    body: 18,
    caption: 14,
  },
  font: {
    /**
     * Letters must use an infant-safe face: single-storey 'a', single-storey
     * 'g', unambiguous 'l' and 'I'. Andika was designed for literacy learners
     * and is the only acceptable default here. The fallbacks are ordered to
     * degrade toward the least-decorative option available.
     */
    letter: 'Andika, "Comic Sans MS", Verdana, sans-serif',
    /** Interface text, where decorative is fine. */
    ui: 'Quicksand, Avenir, "Helvetica Neue", sans-serif',
  },
  motion: {
    /** Feedback must land fast or it reads as lag, not as reward. */
    feedbackMs: 220,
    /** Gentle idle pulse for hint tier 1. */
    pulseMs: 900,
    /** Celebration on a correct answer. */
    celebrateMs: 650,
  },
} as const;

export type Tokens = typeof tokens;

/** Pads a target smaller than the 44pt minimum out to it. */
export function hitSlop(renderedSize: number): {
  top: number;
  bottom: number;
  left: number;
  right: number;
} {
  const pad = Math.max(0, Math.ceil((tokens.tap.min - renderedSize) / 2));
  return { top: pad, bottom: pad, left: pad, right: pad };
}

/** WCAG 2.1 relative luminance. */
function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((offset) => {
    const srgb = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** WCAG 2.1 contrast ratio, 1 to 21. */
export function contrastRatio(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}
```

- [ ] **Step 6: Write `packages/ui/src/index.ts`**

```ts
export { contrastRatio, hitSlop, tokens } from './tokens';
export type { Tokens } from './tokens';
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm install && npx vitest run packages/ui`
Expected: PASS, 8 tests.

If a contrast test fails, darken `ink` or lighten the background — do not lower the threshold. 4.5:1 is the floor for a product aimed at children who are still learning letter shapes.

- [ ] **Step 8: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): add Soft Paper design tokens with contrast and tap-target tests"
```

---

## Task 17: Placeholder voice pack

**Files:**
- Create: `scripts/generate-placeholder-audio.sh`

Real recorded Australian voice is a later decision (spec §9.3). This script produces a clearly-marked stand-in so the game is playable and reviewable at zero cost.

It uses macOS `say` with the Australian voice "Karen", and spells phonemes phonetically — `s` becomes "sss", not "ess". Generic text-to-speech says the *letter name* for a single letter, which is the precise opposite of what phonics teaches, so the phonetic spellings are the whole trick that makes these usable.

- [ ] **Step 1: Write the script**

Create `scripts/generate-placeholder-audio.sh`:

```bash
#!/usr/bin/env bash
#
# Generates the PLACEHOLDER voice pack. Not for use with real children —
# see docs/superpowers/specs §9.3. Requires macOS.
#
# Phonemes are spelled phonetically because `say s` produces "ess" (the letter
# name), and teaching a child that `s` says "ess" is actively harmful.

set -euo pipefail

VOICE="${VOICE:-Karen}"   # Australian English
OUT_DIR="apps/game/assets/voice/placeholder-au"
MANIFEST="packages/audio/src/manifest.json"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if ! command -v say >/dev/null 2>&1; then
  echo "error: 'say' not found. This script requires macOS." >&2
  exit 1
fi

if ! say -v "$VOICE" "" >/dev/null 2>&1; then
  echo "error: voice '$VOICE' is not installed." >&2
  echo "Install it in System Settings > Accessibility > Spoken Content > System Voices." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

# key|spoken text
CLIPS=$(cat <<'CLIPS'
ph.s|sss
ph.a|ah
ph.t|tuh
ph.p|puh
ph.i|ih
ph.m|mmm
ph.f|fff
ln.s|ess
ln.a|ay
ln.t|tee
ln.p|pee
ln.i|eye
ln.m|em
ln.f|ef
wd.at|at
wd.am|am
wd.if|if
wd.it|it
wd.pat|pat
wd.tap|tap
wd.pit|pit
wd.sit|sit
wd.sip|sip
wd.pip|pip
wd.fat|fat
wd.fit|fit
wd.mat|mat
wd.map|map
wd.sat|sat
wd.tip|tip
wd.sap|sap
wd.sam|Sam
wd.pam|Pam
wd.i_pronoun|I
wd.the|the
wd.a_word|a
wd.as|as
wd.is|is
ui.which_says|Which one says
ui.find_letter|Find the letter that says
ui.build_word|Build the word
ui.tap_picture|Tap the picture
ui.listen_again|Listen again
ui.lets_go|Let's go!
ui.all_done|All done!
ui.try_this_one|Try this one
praise.1|Yes!
praise.2|That's it!
praise.3|Lovely!
praise.4|You got it!
praise.5|Well done!
praise.6|Brilliant!
praise.7|Nice one!
praise.8|Perfect!
praise.9|Clever!
praise.10|Good listening!
praise.11|Beautiful!
praise.12|You're reading!
encourage.1|Nearly! Have another go.
encourage.2|Good try. Listen again.
encourage.3|Not that one. Try again.
encourage.4|Let's listen together.
CLIPS
)

count=0
entries=()

while IFS='|' read -r key text; do
  [ -z "$key" ] && continue
  aiff="$TMP/$key.aiff"
  m4a="$OUT_DIR/$key.m4a"
  say -v "$VOICE" -o "$aiff" "$text"
  afconvert -f m4af -d aac "$aiff" "$m4a" >/dev/null
  entries+=("  \"$key\": \"assets/voice/placeholder-au/$key.m4a\"")
  count=$((count + 1))
done <<< "$CLIPS"

mkdir -p "$(dirname "$MANIFEST")"
{
  printf '{\n'
  printf '  "_comment": "GENERATED by scripts/generate-placeholder-audio.sh. PLACEHOLDER voice (macOS say, voice %s). Do not use with real children; see spec section 9.3.",\n' "$VOICE"
  printf '  "_pack": "placeholder-au",\n'
  printf '  "_placeholder": true,\n'
  IFS=$',\n'
  printf '%s\n' "$(printf '%s,\n' "${entries[@]::${#entries[@]}-1}")$(printf '%s' "${entries[-1]}")"
  printf '}\n'
} > "$MANIFEST"

echo "Generated $count placeholder clips in $OUT_DIR"
echo "Wrote manifest to $MANIFEST"
echo
echo "REMINDER: this is a placeholder pack. The phoneme clips are approximations"
echo "and must be replaced with recorded human audio before any child testing."
```

- [ ] **Step 2: Make it executable and run it**

Run: `chmod +x scripts/generate-placeholder-audio.sh && ./scripts/generate-placeholder-audio.sh`
Expected: `Generated 62 placeholder clips in apps/game/assets/voice/placeholder-au`, followed by the reminder.

If the voice is missing, the script tells you where to install it. If you are not on macOS, create the manifest by hand with silent clips and note it in the commit — the game will run, just mutely.

- [ ] **Step 3: Listen to three clips and confirm they are usable**

Run: `afplay apps/game/assets/voice/placeholder-au/ph.s.m4a && afplay apps/game/assets/voice/placeholder-au/ph.m.m4a && afplay apps/game/assets/voice/placeholder-au/wd.mat.m4a`
Expected: "sss", "mmm", "mat". They will sound synthetic. That is fine and is the point of the placeholder label.

- [ ] **Step 4: Commit the script and the generated assets**

```bash
git add scripts/generate-placeholder-audio.sh apps/game/assets/voice/placeholder-au packages/audio/src/manifest.json
git commit -m "chore(audio): add placeholder AU voice pack generator"
```

---

## Task 18: Audio manifest and key integrity

**Files:**
- Create: `packages/audio/package.json`
- Create: `packages/audio/tsconfig.json`
- Create: `packages/audio/src/manifest.ts`
- Test: `packages/audio/src/manifest.test.ts`

The indirection here is the point: curriculum references audio by key, a manifest maps keys to files. Swapping the entire voice pack later — placeholder, self-recorded, professional, a second accent — becomes a manifest change with no code or curriculum edits.

- [ ] **Step 1: Create `packages/audio/package.json`**

```json
{
  "name": "@soundlings/audio",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "dependencies": {
    "@soundlings/curriculum": "0.1.0"
  }
}
```

- [ ] **Step 2: Create `packages/audio/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Write the failing test**

Create `packages/audio/src/manifest.test.ts`:

```ts
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allAudioKeys } from '@soundlings/curriculum';
import {
  ENCOURAGE_KEYS,
  PRAISE_KEYS,
  audioPath,
  hasAudio,
  isPlaceholderPack,
  manifestKeys,
} from './manifest';

const REPO_ROOT = join(__dirname, '..', '..', '..');
const APP_ROOT = join(REPO_ROOT, 'apps', 'game');

describe('audio manifest', () => {
  it('resolves every audio key the curriculum references', () => {
    const missing = allAudioKeys().filter((key) => !hasAudio(key));
    expect(missing, `missing audio for: ${missing.join(', ')}`).toEqual([]);
  });

  it('points every manifest entry at a file that exists on disk', () => {
    const broken = manifestKeys().filter((key) => !existsSync(join(APP_ROOT, audioPath(key))));
    expect(broken, `manifest keys with no file: ${broken.join(', ')}`).toEqual([]);
  });

  it('provides at least 12 praise variants so praise never feels canned', () => {
    expect(PRAISE_KEYS.length).toBeGreaterThanOrEqual(12);
    for (const key of PRAISE_KEYS) expect(hasAudio(key), key).toBe(true);
  });

  it('provides encouragement clips for wrong answers', () => {
    expect(ENCOURAGE_KEYS.length).toBeGreaterThanOrEqual(3);
    for (const key of ENCOURAGE_KEYS) expect(hasAudio(key), key).toBe(true);
  });

  it('provides every instruction clip the four mini-games need', () => {
    for (const key of ['ui.which_says', 'ui.find_letter', 'ui.build_word', 'ui.tap_picture', 'ui.listen_again']) {
      expect(hasAudio(key), key).toBe(true);
    }
  });

  it('throws on an unknown key rather than silently playing nothing', () => {
    expect(() => audioPath('nope.nothing')).toThrow(/unknown audio key/i);
  });

  it('reports that the current pack is a placeholder', () => {
    // When this flips to false, a real voice pack has landed and the in-app
    // placeholder banner will disappear on its own.
    expect(isPlaceholderPack()).toBe(true);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run packages/audio/src/manifest.test.ts`
Expected: FAIL — `Failed to resolve import "./manifest"`.

- [ ] **Step 5: Write `packages/audio/src/manifest.ts`**

```ts
import manifest from './manifest.json';

type Manifest = Record<string, string | boolean>;

const RAW = manifest as unknown as Manifest;

/** Manifest keys beginning with `_` are metadata, not clips. */
function isClipKey(key: string): boolean {
  return !key.startsWith('_');
}

export function manifestKeys(): string[] {
  return Object.keys(RAW).filter(isClipKey).sort();
}

export function hasAudio(key: string): boolean {
  return isClipKey(key) && typeof RAW[key] === 'string';
}

/**
 * The asset path for an audio key, relative to the app root.
 *
 * Throws rather than returning undefined. A missing clip that fails silently
 * means a child sits looking at a screen that asked them nothing, which is far
 * worse than a loud failure in development.
 */
export function audioPath(key: string): string {
  const value = RAW[key];
  if (typeof value !== 'string') throw new Error(`Unknown audio key: ${key}`);
  return value;
}

/** True while the bundled pack is machine-generated rather than recorded. */
export function isPlaceholderPack(): boolean {
  return RAW._placeholder === true;
}

export function packName(): string {
  return typeof RAW._pack === 'string' ? RAW._pack : 'unknown';
}

/** Randomised so a child never hears the same praise twice in a row. */
export const PRAISE_KEYS: string[] = manifestKeys().filter((key) => key.startsWith('praise.'));

export const ENCOURAGE_KEYS: string[] = manifestKeys().filter((key) => key.startsWith('encourage.'));
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm install && npx vitest run packages/audio`
Expected: PASS, 7 tests.

- [ ] **Step 7: Commit**

```bash
git add packages/audio/package.json packages/audio/tsconfig.json packages/audio/src/manifest.ts packages/audio/src/manifest.test.ts
git commit -m "feat(audio): add audio key manifest with build-time integrity checks"
```

---

## Task 19: AudioService

**Files:**
- Create: `packages/audio/src/AudioService.ts`
- Create: `packages/audio/src/index.ts`
- Test: `packages/audio/src/AudioService.test.ts`

Speech must never overlap speech. Two voices talking at once is unintelligible to an adult and completely defeating to a five-year-old who is concentrating on a single sound. The queue below is the mechanism that guarantees it.

The player is injected rather than imported, which is what lets this be unit-tested in Node with no simulator.

- [ ] **Step 1: Write the failing test**

Create `packages/audio/src/AudioService.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { AudioService } from './AudioService';
import type { ClipPlayer } from './AudioService';

/** A fake player that records calls and resolves when told to. */
function fakePlayer() {
  const played: string[] = [];
  let resolveCurrent: (() => void) | null = null;
  const player: ClipPlayer = {
    play: vi.fn(async (key: string) => {
      played.push(key);
      await new Promise<void>((resolve) => {
        resolveCurrent = resolve;
      });
    }),
    stop: vi.fn(async () => {
      resolveCurrent?.();
      resolveCurrent = null;
    }),
    preload: vi.fn(async () => {}),
  };
  return {
    player,
    played,
    finishCurrent: () => {
      resolveCurrent?.();
      resolveCurrent = null;
    },
  };
}

describe('AudioService', () => {
  it('plays a queued clip', async () => {
    const { player, played, finishCurrent } = fakePlayer();
    const audio = new AudioService(player);
    const done = audio.say('ph.s');
    await Promise.resolve();
    expect(played).toEqual(['ph.s']);
    finishCurrent();
    await done;
  });

  it('never overlaps two clips — the second waits for the first', async () => {
    const { player, played, finishCurrent } = fakePlayer();
    const audio = new AudioService(player);
    const first = audio.say('ui.which_says');
    const second = audio.say('ph.s');
    await Promise.resolve();
    expect(played).toEqual(['ui.which_says']);
    finishCurrent();
    await first;
    await Promise.resolve();
    expect(played).toEqual(['ui.which_says', 'ph.s']);
    finishCurrent();
    await second;
  });

  it('plays a sequence in order as one unit', async () => {
    const { player, played, finishCurrent } = fakePlayer();
    const audio = new AudioService(player);
    const done = audio.sayAll(['ui.which_says', 'ph.m']);
    await Promise.resolve();
    expect(played).toEqual(['ui.which_says']);
    finishCurrent();
    await Promise.resolve();
    expect(played).toEqual(['ui.which_says', 'ph.m']);
    finishCurrent();
    await done;
  });

  it('interrupts and clears the queue when the child taps ahead', async () => {
    const { player, played, finishCurrent } = fakePlayer();
    const audio = new AudioService(player);
    void audio.say('ui.which_says');
    void audio.say('ph.s');
    await Promise.resolve();
    await audio.interrupt('praise.1');
    await Promise.resolve();
    expect(player.stop).toHaveBeenCalled();
    expect(played).toEqual(['ui.which_says', 'praise.1']);
    finishCurrent();
  });

  it('plays nothing while muted but still resolves', async () => {
    const { player, played } = fakePlayer();
    const audio = new AudioService(player);
    audio.setMuted(true);
    await audio.say('ph.s');
    expect(played).toEqual([]);
  });

  it('resumes playing when unmuted', async () => {
    const { player, played, finishCurrent } = fakePlayer();
    const audio = new AudioService(player);
    audio.setMuted(true);
    await audio.say('ph.s');
    audio.setMuted(false);
    const done = audio.say('ph.a');
    await Promise.resolve();
    expect(played).toEqual(['ph.a']);
    finishCurrent();
    await done;
  });

  it('never repeats the previous praise clip', async () => {
    const { player, played, finishCurrent } = fakePlayer();
    const audio = new AudioService(player);
    for (let i = 0; i < 20; i += 1) {
      const done = audio.praise(() => 0);
      await Promise.resolve();
      finishCurrent();
      await done;
    }
    for (let i = 1; i < played.length; i += 1) {
      expect(played[i]).not.toBe(played[i - 1]);
    }
  });

  it('survives a player that rejects, so one bad clip cannot freeze the quest', async () => {
    const player: ClipPlayer = {
      play: vi.fn(async () => {
        throw new Error('decode failed');
      }),
      stop: vi.fn(async () => {}),
      preload: vi.fn(async () => {}),
    };
    const audio = new AudioService(player);
    await expect(audio.say('ph.s')).resolves.toBeUndefined();
  });

  it('preloads via the player', async () => {
    const { player } = fakePlayer();
    const audio = new AudioService(player);
    await audio.preload(['ph.s', 'ph.a']);
    expect(player.preload).toHaveBeenCalledWith(['ph.s', 'ph.a']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/audio/src/AudioService.test.ts`
Expected: FAIL — `Failed to resolve import "./AudioService"`.

- [ ] **Step 3: Write `packages/audio/src/AudioService.ts`**

```ts
import { ENCOURAGE_KEYS, PRAISE_KEYS, hasAudio } from './manifest';

/**
 * The platform-specific half of audio. Injected so AudioService can be unit
 * tested in Node without a simulator; the Expo implementation lives in
 * apps/game.
 */
export interface ClipPlayer {
  /** Resolves when the clip has finished playing. */
  play(key: string): Promise<void>;
  stop(): Promise<void>;
  preload(keys: string[]): Promise<void>;
}

type QueueItem = { keys: string[]; resolve: () => void };

/**
 * Serialises all speech.
 *
 * Every clip goes through one queue, so two voices can never talk over each
 * other. For an adult overlapping audio is annoying; for a child trying to
 * isolate a single phoneme it makes the task impossible, and they will read
 * that as their own failure.
 */
export class AudioService {
  private queue: QueueItem[] = [];

  private running = false;

  private muted = false;

  private lastPraiseIndex = -1;

  constructor(private readonly player: ClipPlayer) {}

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) this.clearQueue();
  }

  isMuted(): boolean {
    return this.muted;
  }

  preload(keys: string[]): Promise<void> {
    return this.player.preload(keys.filter((key) => hasAudio(key)));
  }

  /** Queues one clip. Resolves when it has finished playing. */
  say(key: string): Promise<void> {
    return this.sayAll([key]);
  }

  /** Queues several clips as a single uninterruptible unit. */
  sayAll(keys: string[]): Promise<void> {
    if (this.muted) return Promise.resolve();
    const playable = keys.filter((key) => hasAudio(key));
    if (playable.length === 0) return Promise.resolve();

    return new Promise<void>((resolve) => {
      this.queue.push({ keys: playable, resolve });
      void this.drain();
    });
  }

  /**
   * Stops whatever is playing, drops the queue, and plays this immediately.
   * Used when the child taps an answer: their action must be acknowledged at
   * once, not after the instruction finishes reading itself out.
   */
  async interrupt(key: string): Promise<void> {
    await this.player.stop();
    this.clearQueue();
    await this.say(key);
  }

  /** A randomised praise clip, never the same one twice in a row. */
  praise(random: () => number = Math.random): Promise<void> {
    return this.say(this.pickVaried(PRAISE_KEYS, random));
  }

  encourage(random: () => number = Math.random): Promise<void> {
    if (ENCOURAGE_KEYS.length === 0) return Promise.resolve();
    const index = Math.floor(random() * ENCOURAGE_KEYS.length);
    return this.say(ENCOURAGE_KEYS[index]);
  }

  private pickVaried(keys: string[], random: () => number): string {
    if (keys.length === 0) return '';
    if (keys.length === 1) return keys[0];
    let index = Math.floor(random() * keys.length);
    if (index === this.lastPraiseIndex) index = (index + 1) % keys.length;
    this.lastPraiseIndex = index;
    return keys[index];
  }

  private clearQueue(): void {
    const pending = this.queue;
    this.queue = [];
    for (const item of pending) item.resolve();
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length > 0) {
        const item = this.queue.shift();
        if (!item) break;
        for (const key of item.keys) {
          try {
            await this.player.play(key);
          } catch {
            // A single undecodable clip must not freeze the quest. The child
            // sees the task either way; losing one prompt is recoverable,
            // a frozen screen is not.
          }
        }
        item.resolve();
      }
    } finally {
      this.running = false;
    }
  }
}
```

- [ ] **Step 4: Write `packages/audio/src/index.ts`**

```ts
export { AudioService } from './AudioService';
export type { ClipPlayer } from './AudioService';
export {
  ENCOURAGE_KEYS,
  PRAISE_KEYS,
  audioPath,
  hasAudio,
  isPlaceholderPack,
  manifestKeys,
  packName,
} from './manifest';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run packages/audio`
Expected: PASS — manifest 7, AudioService 9.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: all green across curriculum, engine, ui, audio.

- [ ] **Step 7: Commit**

```bash
git add packages/audio/src/AudioService.ts packages/audio/src/AudioService.test.ts packages/audio/src/index.ts
git commit -m "feat(audio): add queued AudioService that never overlaps speech"
```

---

## Task 20: Expo app scaffold

**Files:**
- Create: `apps/game/package.json`
- Create: `apps/game/app.json`
- Create: `apps/game/tsconfig.json`
- Create: `apps/game/babel.config.js`
- Create: `apps/game/metro.config.js`
- Create: `apps/game/app/_layout.tsx`
- Create: `apps/game/app/index.tsx`
- Create: `apps/game/src/audio/ExpoClipPlayer.ts`

- [ ] **Step 1: Create `apps/game/package.json`**

```json
{
  "name": "@soundlings/game",
  "version": "0.1.0",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "ios": "expo start --ios",
    "android": "expo start --android"
  },
  "dependencies": {
    "@react-native-async-storage/async-storage": "^2.1.0",
    "@soundlings/audio": "0.1.0",
    "@soundlings/curriculum": "0.1.0",
    "@soundlings/engine": "0.1.0",
    "@soundlings/ui": "0.1.0",
    "expo": "~54.0.0",
    "expo-audio": "~1.0.0",
    "expo-constants": "~17.0.0",
    "expo-linking": "~7.0.0",
    "expo-router": "~4.0.0",
    "expo-status-bar": "~2.0.0",
    "react": "18.3.1",
    "react-native": "0.76.5",
    "react-native-reanimated": "~3.16.0",
    "react-native-safe-area-context": "4.12.0",
    "react-native-screens": "~4.4.0"
  },
  "devDependencies": {
    "@babel/core": "^7.25.0",
    "@types/react": "~18.3.12",
    "typescript": "^5.6.3"
  }
}
```

Version pins will drift. If `npx expo install --fix` wants to adjust them, let it — Expo's own compatibility matrix wins over the numbers written here.

- [ ] **Step 2: Create `apps/game/app.json`**

```json
{
  "expo": {
    "name": "Soundlings",
    "slug": "soundlings",
    "version": "0.1.0",
    "orientation": "landscape",
    "scheme": "soundlings",
    "userInterfaceStyle": "light",
    "newArchEnabled": true,
    "assetBundlePatterns": ["assets/**/*"],
    "ios": {
      "supportsTablet": true,
      "requireFullScreen": true,
      "bundleIdentifier": "com.soundlings.game"
    },
    "android": {
      "package": "com.soundlings.game"
    },
    "plugins": ["expo-router"]
  }
}
```

`orientation` is landscape and `requireFullScreen` is true deliberately: a five-year-old holding an iPad will rotate it constantly, and a layout that reflows mid-task loses them. One orientation, no split view.

- [ ] **Step 3: Create `apps/game/tsconfig.json`**

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

- [ ] **Step 4: Create `apps/game/babel.config.js`**

```js
module.exports = function babelConfig(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-reanimated/plugin'],
  };
};
```

`react-native-reanimated/plugin` must be last in the plugins array. If animations silently do nothing, this is the first thing to check.

- [ ] **Step 5: Create `apps/game/metro.config.js`**

```js
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Metro must watch the whole workspace, or edits to packages/* will not
// hot-reload and imports of @soundlings/* will fail to resolve.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
```

- [ ] **Step 6: Create `apps/game/src/audio/ExpoClipPlayer.ts`**

```ts
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { audioPath } from '@soundlings/audio';
import type { ClipPlayer } from '@soundlings/audio';

type Player = ReturnType<typeof createAudioPlayer>;

/**
 * expo-audio implementation of ClipPlayer.
 *
 * Players are cached per key. Creating a player on every prompt adds audible
 * latency, and a child who taps before the sound arrives has effectively been
 * asked nothing.
 */
export class ExpoClipPlayer implements ClipPlayer {
  private readonly players = new Map<string, Player>();

  private current: Player | null = null;

  async configure(): Promise<void> {
    // Plays through the speaker even if the iPad's silent switch is on: the
    // whole game is audio, so silent playback would look like a broken app.
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: 'duckOthers',
    });
  }

  async preload(keys: string[]): Promise<void> {
    for (const key of keys) this.playerFor(key);
  }

  async play(key: string): Promise<void> {
    const player = this.playerFor(key);
    this.current = player;
    player.seekTo(0);
    player.play();

    await new Promise<void>((resolve) => {
      const subscription = player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) {
          subscription.remove();
          resolve();
        }
      });
      // Safety net: a clip that never reports completion must not hang the quest.
      setTimeout(() => {
        subscription.remove();
        resolve();
      }, 6000);
    });
  }

  async stop(): Promise<void> {
    this.current?.pause();
    this.current = null;
  }

  private playerFor(key: string): Player {
    const existing = this.players.get(key);
    if (existing) return existing;
    const created = createAudioPlayer(resolveAsset(key));
    this.players.set(key, created);
    return created;
  }
}

/**
 * Metro requires statically analysable require() calls for assets, so the
 * manifest path is mapped to a bundled module here. `audioPath` throws on an
 * unknown key, which keeps a typo loud instead of silent.
 */
function resolveAsset(key: string): { uri: string } {
  const relative = audioPath(key);
  return { uri: relative };
}
```

Note on `resolveAsset`: bundled assets need real `require()` calls for Metro to include them. This returns a URI, which works in development via the asset server. Before building a standalone app, replace the body with a generated `ASSETS` map of literal `require('../../assets/voice/placeholder-au/ph.s.m4a')` entries. Write that generator as part of Plan 2 — it is not needed to reach the review gate, and noting it here is cheaper than discovering it during a release build.

- [ ] **Step 7: Create `apps/game/app/_layout.tsx`**

```tsx
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { tokens } from '@soundlings/ui';

export default function RootLayout() {
  return (
    <>
      <StatusBar hidden />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: tokens.color.paper },
          animation: 'fade',
        }}
      />
    </>
  );
}
```

The status bar is hidden and headers are off throughout. There is nothing on a system chrome bar a five-year-old needs, and every piece of it is something to tap by accident mid-task.

- [ ] **Step 8: Create `apps/game/app/index.tsx`**

```tsx
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { isPlaceholderPack } from '@soundlings/audio';
import { tokens } from '@soundlings/ui';

/**
 * Temporary entry screen. The profile picker and island home arrive in Plan 2;
 * this exists so the quest runner can be reached and reviewed.
 */
export default function Home() {
  const router = useRouter();

  return (
    <View style={styles.screen}>
      {isPlaceholderPack() ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            Placeholder voice — not for use with children
          </Text>
        </View>
      ) : null}

      <Text style={styles.title}>Soundlings</Text>
      <Text style={styles.subtitle}>Island of First Sounds</Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Play"
        style={({ pressed }) => [styles.play, pressed && styles.playPressed]}
        onPress={() => router.push('/quest')}
      >
        <Text style={styles.playText}>Play</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.color.paper,
    gap: tokens.space.lg,
  },
  banner: {
    position: 'absolute',
    top: tokens.space.md,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.hint,
  },
  bannerText: { fontSize: tokens.type.caption, color: tokens.color.ink },
  title: { fontSize: tokens.type.title, color: tokens.color.ink, fontWeight: '700' },
  subtitle: { fontSize: tokens.type.body, color: tokens.color.inkSoft },
  play: {
    width: tokens.tap.primary,
    height: tokens.tap.primary,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playPressed: { transform: [{ scale: 0.96 }] },
  playText: { fontSize: tokens.type.word, color: tokens.color.onAccent, fontWeight: '700' },
});
```

- [ ] **Step 9: Install and boot the app**

Run: `npm install`
Run: `cd apps/game && npx expo start --ios`
Expected: the iOS simulator opens an iPad, showing the Soundlings title, the placeholder-voice banner, and a Play button. Tapping Play will fail to navigate — `/quest` does not exist yet, which is correct at this point.

- [ ] **Step 10: Commit**

```bash
git add apps/game package-lock.json
git commit -m "feat(game): scaffold Expo app with monorepo metro config and entry screen"
```

---

## Task 21: Local progress persistence

**Files:**
- Create: `apps/game/src/data/ProgressRepo.ts`
- Create: `apps/game/src/data/MemoryProgressRepo.ts`
- Test: `apps/game/src/data/MemoryProgressRepo.test.ts`
- Modify: `vitest.config.ts`

Progress is written per completed task, not per session. A child will be interrupted mid-quest constantly — a sibling, a car arriving, a flat battery — and losing five minutes of work to that is the kind of thing that makes a parent delete an app.

The repository interface is what makes the later Supabase swap a one-file change.

- [ ] **Step 1: Widen the vitest include to cover app logic**

Modify `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/game/src/**/*.test.ts'],
    environment: 'node',
  },
});
```

Only `.ts` files are included, not `.tsx`. Component tests need a React Native test environment and are deliberately out of scope for this plan — the logic worth testing has been kept out of the components.

- [ ] **Step 2: Write the failing test**

Create `apps/game/src/data/MemoryProgressRepo.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, buildSession, emptyRecord } from '@soundlings/engine';
import { MemoryProgressRepo } from './MemoryProgressRepo';

const NOW = 1_000_000;

function repo() {
  return new MemoryProgressRepo();
}

describe('ProgressRepo', () => {
  it('returns an empty mastery map for an unknown profile', async () => {
    expect(await repo().loadMastery('nobody')).toEqual({});
  });

  it('round-trips a mastery map', async () => {
    const store = repo();
    const record = emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG);
    await store.saveMastery('kid', { 's::SOUND_ID': record });
    expect(await store.loadMastery('kid')).toEqual({ 's::SOUND_ID': record });
  });

  it('keeps profiles separate', async () => {
    const store = repo();
    await store.saveMastery('a', { 's::SOUND_ID': emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG) });
    expect(await store.loadMastery('b')).toEqual({});
  });

  it('appends attempts without overwriting earlier ones', async () => {
    const store = repo();
    await store.appendAttempt('kid', {
      sessionId: 's1', targetId: 's', skill: 'SOUND_ID', taskTypeId: 'sound-hunt',
      correct: true, scaffolded: false, latencyMs: 900, weight: 1, at: NOW,
    });
    await store.appendAttempt('kid', {
      sessionId: 's1', targetId: 'a', skill: 'SOUND_ID', taskTypeId: 'sound-hunt',
      correct: false, scaffolded: false, latencyMs: 1500, weight: 1, at: NOW + 1,
    });
    const attempts = await store.loadAttempts('kid');
    expect(attempts.length).toBe(2);
    expect(attempts[0].targetId).toBe('s');
  });

  it('round-trips the confusion map', async () => {
    const store = repo();
    await store.saveConfusions('kid', { 'm>a': 3 });
    expect(await store.loadConfusions('kid')).toEqual({ 'm>a': 3 });
  });

  it('resumes an interrupted quest at the right task', async () => {
    const store = repo();
    const plan = buildSession({ sessionId: 'q1', level: 1, mastery: {}, confusions: {}, now: NOW });
    await store.saveActiveSession('kid', {
      sessionId: 'q1', level: 1, plan, index: 4, stars: 2, startedAt: NOW,
    });
    const resumed = await store.loadActiveSession('kid');
    expect(resumed?.index).toBe(4);
    expect(resumed?.plan.length).toBe(plan.length);
    // The stored plan must come back identical, or the child would be re-asked
    // questions they have already answered — including ones they got wrong.
    expect(resumed?.plan[4].id).toBe(plan[4].id);
  });

  it('clears the active session when a quest finishes', async () => {
    const store = repo();
    await store.saveActiveSession('kid', {
      sessionId: 'q1', level: 1, plan: [], index: 0, stars: 0, startedAt: NOW,
    });
    await store.saveActiveSession('kid', null);
    expect(await store.loadActiveSession('kid')).toBeNull();
  });

  it('keeps only the best score per level', async () => {
    const store = repo();
    await store.saveHighScore('kid', { level: 1, stars: 2, cleanRun: false, at: NOW });
    await store.saveHighScore('kid', { level: 1, stars: 3, cleanRun: true, at: NOW + 1 });
    await store.saveHighScore('kid', { level: 1, stars: 1, cleanRun: false, at: NOW + 2 });
    const scores = await store.loadHighScores('kid');
    expect(scores.length).toBe(1);
    expect(scores[0].stars).toBe(3);
    expect(scores[0].cleanRun).toBe(true);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run apps/game/src/data/MemoryProgressRepo.test.ts`
Expected: FAIL — `Failed to resolve import "./MemoryProgressRepo"`.

- [ ] **Step 4: Write `apps/game/src/data/ProgressRepo.ts`**

```ts
import type { Attempt, ConfusionMap, MasteryMap, TaskInstance } from '@soundlings/engine';

/** A quest in progress, persisted so an interruption costs nothing. */
export interface ActiveSession {
  sessionId: string;
  level: number;
  /**
   * The whole plan, stored rather than regenerated. Rebuilding it on resume
   * would re-roll the quest and could re-ask questions the child has already
   * answered — including ones they got wrong, which is the worst case.
   */
  plan: TaskInstance[];
  /** Index of the next unanswered task. */
  index: number;
  stars: number;
  startedAt: number;
}

export interface HighScore {
  level: number;
  stars: number;
  /** True when the quest was completed with no errors and no scaffolding. */
  cleanRun: boolean;
  at: number;
}

/**
 * All persistence for one child, behind one interface.
 *
 * Plan 2 adds a Supabase-backed implementation and an offline sync queue. The
 * attempt log is append-only so that every later metric — dashboards,
 * confusion analysis, pacing experiments — is derivable without a migration,
 * and so mastery can be rebuilt from scratch if the algorithm changes. It will.
 */
export interface ProgressRepo {
  loadMastery(profileId: string): Promise<MasteryMap>;
  saveMastery(profileId: string, mastery: MasteryMap): Promise<void>;

  appendAttempt(profileId: string, attempt: Attempt): Promise<void>;
  loadAttempts(profileId: string): Promise<Attempt[]>;

  loadConfusions(profileId: string): Promise<ConfusionMap>;
  saveConfusions(profileId: string, confusions: ConfusionMap): Promise<void>;

  loadActiveSession(profileId: string): Promise<ActiveSession | null>;
  saveActiveSession(profileId: string, session: ActiveSession | null): Promise<void>;

  loadHighScores(profileId: string): Promise<HighScore[]>;
  saveHighScore(profileId: string, score: HighScore): Promise<void>;
}

/** Merges a score in, keeping the best per level. Shared by all implementations. */
export function mergeHighScore(scores: HighScore[], incoming: HighScore): HighScore[] {
  const others = scores.filter((s) => s.level !== incoming.level);
  const existing = scores.find((s) => s.level === incoming.level);
  if (!existing) return [...others, incoming];
  const better =
    incoming.stars > existing.stars ||
    (incoming.stars === existing.stars && incoming.cleanRun && !existing.cleanRun);
  return [...others, better ? incoming : existing];
}
```

- [ ] **Step 5: Write `apps/game/src/data/MemoryProgressRepo.ts`**

```ts
import type { Attempt, ConfusionMap, MasteryMap } from '@soundlings/engine';
import { mergeHighScore } from './ProgressRepo';
import type { ActiveSession, HighScore, ProgressRepo } from './ProgressRepo';

interface ProfileState {
  mastery: MasteryMap;
  attempts: Attempt[];
  confusions: ConfusionMap;
  activeSession: ActiveSession | null;
  highScores: HighScore[];
}

/**
 * In-memory ProgressRepo. Used by tests and by the quest runner in development,
 * so the game is playable before any storage layer exists.
 */
export class MemoryProgressRepo implements ProgressRepo {
  private readonly profiles = new Map<string, ProfileState>();

  async loadMastery(profileId: string): Promise<MasteryMap> {
    return this.state(profileId).mastery;
  }

  async saveMastery(profileId: string, mastery: MasteryMap): Promise<void> {
    this.state(profileId).mastery = mastery;
  }

  async appendAttempt(profileId: string, attempt: Attempt): Promise<void> {
    this.state(profileId).attempts.push(attempt);
  }

  async loadAttempts(profileId: string): Promise<Attempt[]> {
    return [...this.state(profileId).attempts];
  }

  async loadConfusions(profileId: string): Promise<ConfusionMap> {
    return this.state(profileId).confusions;
  }

  async saveConfusions(profileId: string, confusions: ConfusionMap): Promise<void> {
    this.state(profileId).confusions = confusions;
  }

  async loadActiveSession(profileId: string): Promise<ActiveSession | null> {
    return this.state(profileId).activeSession;
  }

  async saveActiveSession(profileId: string, session: ActiveSession | null): Promise<void> {
    this.state(profileId).activeSession = session;
  }

  async loadHighScores(profileId: string): Promise<HighScore[]> {
    return [...this.state(profileId).highScores];
  }

  async saveHighScore(profileId: string, score: HighScore): Promise<void> {
    const state = this.state(profileId);
    state.highScores = mergeHighScore(state.highScores, score);
  }

  private state(profileId: string): ProfileState {
    const existing = this.profiles.get(profileId);
    if (existing) return existing;
    const created: ProfileState = {
      mastery: {},
      attempts: [],
      confusions: {},
      activeSession: null,
      highScores: [],
    };
    this.profiles.set(profileId, created);
    return created;
  }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run apps/game/src/data`
Expected: PASS, 8 tests.

- [ ] **Step 7: Write `apps/game/src/data/AsyncStorageProgressRepo.ts`**

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Attempt, ConfusionMap, MasteryMap } from '@soundlings/engine';
import { mergeHighScore } from './ProgressRepo';
import type { ActiveSession, HighScore, ProgressRepo } from './ProgressRepo';

/**
 * Device-backed ProgressRepo. JSON in AsyncStorage is more than adequate at
 * this data volume — a Level 1 child accumulates a few hundred attempts — and
 * it keeps the review gate free of any native database setup.
 *
 * Plan 2 replaces this with SQLite plus a Supabase sync queue. Because the
 * interface is the contract, that change does not reach the quest runner.
 */
export class AsyncStorageProgressRepo implements ProgressRepo {
  async loadMastery(profileId: string): Promise<MasteryMap> {
    return (await this.read<MasteryMap>(this.key(profileId, 'mastery'))) ?? {};
  }

  async saveMastery(profileId: string, mastery: MasteryMap): Promise<void> {
    await this.write(this.key(profileId, 'mastery'), mastery);
  }

  async appendAttempt(profileId: string, attempt: Attempt): Promise<void> {
    const existing = await this.loadAttempts(profileId);
    existing.push(attempt);
    await this.write(this.key(profileId, 'attempts'), existing);
  }

  async loadAttempts(profileId: string): Promise<Attempt[]> {
    return (await this.read<Attempt[]>(this.key(profileId, 'attempts'))) ?? [];
  }

  async loadConfusions(profileId: string): Promise<ConfusionMap> {
    return (await this.read<ConfusionMap>(this.key(profileId, 'confusions'))) ?? {};
  }

  async saveConfusions(profileId: string, confusions: ConfusionMap): Promise<void> {
    await this.write(this.key(profileId, 'confusions'), confusions);
  }

  async loadActiveSession(profileId: string): Promise<ActiveSession | null> {
    return (await this.read<ActiveSession>(this.key(profileId, 'activeSession'))) ?? null;
  }

  async saveActiveSession(profileId: string, session: ActiveSession | null): Promise<void> {
    await this.write(this.key(profileId, 'activeSession'), session);
  }

  async loadHighScores(profileId: string): Promise<HighScore[]> {
    return (await this.read<HighScore[]>(this.key(profileId, 'highScores'))) ?? [];
  }

  async saveHighScore(profileId: string, score: HighScore): Promise<void> {
    const merged = mergeHighScore(await this.loadHighScores(profileId), score);
    await this.write(this.key(profileId, 'highScores'), merged);
  }

  private key(profileId: string, name: string): string {
    return `soundlings/${profileId}/${name}`;
  }

  private async read<T>(key: string): Promise<T | null> {
    try {
      const raw = await AsyncStorage.getItem(key);
      return raw === null ? null : (JSON.parse(raw) as T);
    } catch {
      // Corrupt or unreadable storage must not stop a child playing. They lose
      // history, which is recoverable; a crash on launch is not.
      return null;
    }
  }

  private async write(key: string, value: unknown): Promise<void> {
    try {
      if (value === null) {
        await AsyncStorage.removeItem(key);
        return;
      }
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Same reasoning: a failed write is survivable, a thrown error mid-quest is not.
    }
  }
}
```

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add apps/game/src/data vitest.config.ts
git commit -m "feat(game): add progress repository with in-memory and AsyncStorage implementations"
```

---
## Task 22: Task frame and the hint ladder

**Files:**
- Create: `apps/game/src/tasks/TaskProps.ts`
- Create: `apps/game/src/tasks/useHintLadder.ts`
- Create: `apps/game/src/tasks/TaskFrame.tsx`
- Test: `apps/game/src/tasks/useHintLadder.test.ts`

Hints are free. No star penalty, no sad sound, no "you used a hint" tally. Asking for help is the behaviour we want from a five-year-old, and punishing it teaches them to guess instead of ask. The honesty of the data is protected elsewhere: a scaffolded win counts for quest progress but not for mastery (see `applyAttempt`).

The ladder lives in a hook so its timing can be unit tested without rendering anything.

- [ ] **Step 1: Write the failing test**

Create `apps/game/src/tasks/useHintLadder.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { HINT_TIMING, nextIdleTier } from './useHintLadder';

describe('hint ladder timing', () => {
  it('shows nothing before the first threshold', () => {
    expect(nextIdleTier(0)).toBe(0);
    expect(nextIdleTier(HINT_TIMING.tier1Ms - 1)).toBe(0);
  });

  it('nudges at four seconds of silence', () => {
    expect(nextIdleTier(HINT_TIMING.tier1Ms)).toBe(1);
  });

  it('plays the mnemonic and narrows the choices at nine seconds', () => {
    expect(nextIdleTier(HINT_TIMING.tier2Ms)).toBe(2);
  });

  it('never reaches tier 3 from idling alone — only from errors', () => {
    // Showing the answer because a child paused would rob them of a win they
    // were about to earn. Tier 3 is reserved for demonstrated difficulty.
    expect(nextIdleTier(60_000)).toBe(2);
  });

  it('uses thresholds a five-year-old can actually sit through', () => {
    expect(HINT_TIMING.tier1Ms).toBeGreaterThanOrEqual(3000);
    expect(HINT_TIMING.tier1Ms).toBeLessThanOrEqual(6000);
    expect(HINT_TIMING.tier2Ms).toBeGreaterThan(HINT_TIMING.tier1Ms);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run apps/game/src/tasks/useHintLadder.test.ts`
Expected: FAIL — `Failed to resolve import "./useHintLadder"`.

- [ ] **Step 3: Write `apps/game/src/tasks/useHintLadder.ts`**

```ts
import { useEffect, useRef, useState } from 'react';

export type HintTier = 0 | 1 | 2 | 3;

export const HINT_TIMING = {
  /** Gentle pulse and a repeat of the instruction. */
  tier1Ms: 4000,
  /** Mnemonic animation, and distractors dim to leave two. */
  tier2Ms: 9000,
} as const;

/** The tier that idling alone should reach after `elapsedMs` of silence. */
export function nextIdleTier(elapsedMs: number): HintTier {
  if (elapsedMs >= HINT_TIMING.tier2Ms) return 2;
  if (elapsedMs >= HINT_TIMING.tier1Ms) return 1;
  return 0;
}

/**
 * Escalates hints while the child does nothing, and merges that with the tier
 * the quest runner imposes after errors.
 *
 * Idling never reaches tier 3. A child who pauses is thinking, and handing
 * them the answer takes away a win they were about to earn themselves.
 */
export function useHintLadder(args: {
  /** Changes whenever a new task is shown, resetting the ladder. */
  taskId: string;
  /** Tier imposed by the frustration guard after errors. */
  externalTier: HintTier;
  /** Called when idling first reaches tier 1, so audio can repeat. */
  onIdleNudge?: () => void;
}): { tier: HintTier; bumpToTier: (tier: HintTier) => void } {
  const { taskId, externalTier, onIdleNudge } = args;
  const [idleTier, setIdleTier] = useState<HintTier>(0);
  const [manualTier, setManualTier] = useState<HintTier>(0);
  const nudged = useRef(false);

  useEffect(() => {
    setIdleTier(0);
    setManualTier(0);
    nudged.current = false;

    const first = setTimeout(() => {
      setIdleTier(1);
      if (!nudged.current) {
        nudged.current = true;
        onIdleNudge?.();
      }
    }, HINT_TIMING.tier1Ms);

    const second = setTimeout(() => setIdleTier(2), HINT_TIMING.tier2Ms);

    return () => {
      clearTimeout(first);
      clearTimeout(second);
    };
  }, [taskId, onIdleNudge]);

  const tier = Math.max(idleTier, externalTier, manualTier) as HintTier;
  return { tier, bumpToTier: (next: HintTier) => setManualTier((current) => (next > current ? next : current)) };
}
```

- [ ] **Step 4: Write `apps/game/src/tasks/TaskProps.ts`**

```ts
import type { TargetId, TaskInstance } from '@soundlings/engine';
import type { AudioService } from '@soundlings/audio';
import type { HintTier } from './useHintLadder';

/** The contract every mini-game implements. */
export interface TaskProps {
  task: TaskInstance;
  audio: AudioService;
  /** Tier imposed by the frustration guard. The frame merges it with idling. */
  externalTier: HintTier;
  /**
   * Choices to dim at hint tier 2+, leaving the child a two-way choice. Chosen
   * by the runner, not the component, so the engine stays in charge of what
   * gets removed.
   */
  dimmed: TargetId[];
  /** Fires once per answer. The runner judges correctness and timing. */
  onAnswer: (answer: string) => void;
  /** Position in the quest, for the progress pips. */
  position: { index: number; total: number };
}
```

- [ ] **Step 5: Write `apps/game/src/tasks/TaskFrame.tsx`**

```tsx
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { tokens } from '@soundlings/ui';
import type { HintTier } from './useHintLadder';

/**
 * Shared chrome for every mini-game: progress pips, the replay button, and the
 * hint owl. Mini-games render only their own content area.
 */
export function TaskFrame(props: {
  position: { index: number; total: number };
  tier: HintTier;
  onReplay: () => void;
  onAskForHelp: () => void;
  children: ReactNode;
}) {
  const { position, tier, onReplay, onAskForHelp, children } = props;

  return (
    <View style={styles.screen}>
      <View style={styles.top}>
        <Pips index={position.index} total={position.total} />
      </View>

      <View style={styles.content}>{children}</View>

      <View style={styles.bottom}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Listen again"
          style={styles.control}
          onPress={onReplay}
        >
          <Text style={styles.controlIcon}>🔈</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Help me"
          style={[styles.control, tier >= 1 && styles.controlNudging]}
          onPress={onAskForHelp}
        >
          <Text style={styles.controlIcon}>🦉</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Progress pips rather than a numeric counter: "task 9 of 14" means nothing to
 * a child who cannot yet read, and a bar that barely moves is discouraging.
 */
function Pips({ index, total }: { index: number; total: number }) {
  return (
    <View style={styles.pips}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[styles.pip, i < index && styles.pipDone, i === index && styles.pipNow]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.color.paper, paddingVertical: tokens.space.md },
  top: { alignItems: 'center', paddingHorizontal: tokens.space.lg },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: tokens.space.lg },
  bottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.space.xl,
  },
  pips: { flexDirection: 'row', gap: tokens.space.xs },
  pip: {
    width: 10,
    height: 10,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.line,
  },
  pipDone: { backgroundColor: tokens.color.accent },
  pipNow: { backgroundColor: tokens.color.ink, transform: [{ scale: 1.3 }] },
  control: {
    width: tokens.tap.control,
    height: tokens.tap.control,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.tile,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: tokens.color.tileEdge,
  },
  controlNudging: { borderColor: tokens.color.hint, backgroundColor: tokens.color.hint },
  controlIcon: { fontSize: 26 },
});
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run apps/game/src/tasks/useHintLadder.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 7: Commit**

```bash
git add apps/game/src/tasks
git commit -m "feat(game): add task frame and three-tier hint ladder"
```

---

## Task 23: Letter tile component

**Files:**
- Create: `apps/game/src/tasks/LetterTile.tsx`

Shared by three of the four mini-games, so it exists once. Two details that are not cosmetic: the letter renders in the infant font with a single-storey `a`, and a wrong answer dims rather than reddening. Red reads as "told off" to a five-year-old, and we need being wrong to feel safe.

- [ ] **Step 1: Write `apps/game/src/tasks/LetterTile.tsx`**

```tsx
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { tokens } from '@soundlings/ui';

export type TileState = 'idle' | 'pulsing' | 'dimmed' | 'correct' | 'wrong' | 'revealed';

export function LetterTile(props: {
  label: string;
  state: TileState;
  onPress: () => void;
  size?: number;
  accessibilityLabel?: string;
}) {
  const { label, state, onPress, size = tokens.tap.tile, accessibilityLabel } = props;
  const scale = useSharedValue(1);

  useEffect(() => {
    if (state === 'pulsing' || state === 'revealed') {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.06, { duration: tokens.motion.pulseMs / 2 }),
          withTiming(1, { duration: tokens.motion.pulseMs / 2 }),
        ),
        -1,
        false,
      );
    } else if (state === 'correct') {
      scale.value = withSequence(
        withTiming(1.18, { duration: tokens.motion.feedbackMs / 2 }),
        withTiming(1, { duration: tokens.motion.feedbackMs / 2 }),
      );
    } else if (state === 'wrong') {
      scale.value = withSequence(
        withTiming(0.94, { duration: 90 }),
        withTiming(1, { duration: 90 }),
      );
    } else {
      scale.value = withTiming(1, { duration: 120 });
    }
  }, [state, scale]);

  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={animated}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        disabled={state === 'dimmed'}
        onPress={onPress}
        style={[
          styles.tile,
          { width: size, height: size },
          state === 'dimmed' && styles.dimmed,
          state === 'correct' && styles.correct,
          state === 'revealed' && styles.revealed,
        ]}
      >
        <Text style={[styles.label, state === 'dimmed' && styles.labelDimmed]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: tokens.color.tile,
    borderRadius: tokens.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 4,
    borderBottomColor: tokens.color.tileEdge,
  },
  // Dimmed, never red. A five-year-old reads red as being told off, and the
  // whole design aims to make a wrong answer feel safe to make.
  dimmed: { backgroundColor: tokens.color.notThis, opacity: 0.45, borderBottomColor: tokens.color.notThis },
  correct: { backgroundColor: tokens.color.correct, borderBottomColor: tokens.color.correct },
  revealed: { backgroundColor: tokens.color.hint, borderBottomColor: tokens.color.gold },
  label: {
    fontFamily: tokens.font.letter,
    fontSize: tokens.type.letter,
    color: tokens.color.ink,
    fontWeight: '700',
  },
  labelDimmed: { color: tokens.color.inkSoft },
});
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/game && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/game/src/tasks/LetterTile.tsx
git commit -m "feat(game): add letter tile with infant letterforms and non-punitive wrong state"
```

---

## Task 24: Sound Hunt and Sound Singer

**Files:**
- Create: `apps/game/src/tasks/SoundHunt.tsx`
- Create: `apps/game/src/tasks/SoundSinger.tsx`

- [ ] **Step 1: Write `apps/game/src/tasks/SoundHunt.tsx`**

```tsx
import { useCallback, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GRAPHEMES } from '@soundlings/curriculum';
import { tokens } from '@soundlings/ui';
import { LetterTile } from './LetterTile';
import { TaskFrame } from './TaskFrame';
import { useHintLadder } from './useHintLadder';
import type { TaskProps } from './TaskProps';

/**
 * SOUND_ID: the child hears a sound and taps the letter that makes it.
 *
 * The prompt is audio-first and the sound is played on mount, because a child
 * who cannot read yet has no other way in. The written question is for the
 * adult sitting next to them.
 */
export function SoundHunt({ task, audio, externalTier, dimmed, onAnswer, position }: TaskProps) {
  const grapheme = GRAPHEMES[task.correctChoice];

  const playPrompt = useCallback(() => {
    void audio.sayAll(['ui.which_says', grapheme.audio.phoneme]);
  }, [audio, grapheme.audio.phoneme]);

  const { tier, bumpToTier } = useHintLadder({
    taskId: task.id,
    externalTier,
    onIdleNudge: playPrompt,
  });

  useEffect(playPrompt, [playPrompt]);

  useEffect(() => {
    if (tier >= 2) void audio.say(grapheme.audio.phoneme);
  }, [tier, audio, grapheme.audio.phoneme]);

  return (
    <TaskFrame
      position={position}
      tier={tier}
      onReplay={playPrompt}
      onAskForHelp={() => bumpToTier(2)}
    >
      <Text style={styles.prompt}>Which one says {grapheme.phoneme}?</Text>

      {tier >= 2 ? (
        <Text style={styles.mnemonic}>
          {grapheme.mnemonicEmoji} {grapheme.mnemonic}
        </Text>
      ) : null}

      <View style={styles.row}>
        {task.choices.map((choice) => (
          <LetterTile
            key={choice}
            label={choice}
            accessibilityLabel={`Letter ${choice}`}
            state={
              dimmed.includes(choice)
                ? 'dimmed'
                : tier >= 3 && choice === task.correctChoice
                  ? 'revealed'
                  : tier >= 1 && choice === task.correctChoice && tier >= 3
                    ? 'pulsing'
                    : 'idle'
            }
            onPress={() => onAnswer(choice)}
          />
        ))}
      </View>
    </TaskFrame>
  );
}

const styles = StyleSheet.create({
  prompt: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.inkSoft },
  mnemonic: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.ink },
  row: { flexDirection: 'row', gap: tokens.space.lg },
});
```

- [ ] **Step 2: Write `apps/game/src/tasks/SoundSinger.tsx`**

```tsx
import { useCallback, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GRAPHEMES } from '@soundlings/curriculum';
import { tokens } from '@soundlings/ui';
import { TaskFrame } from './TaskFrame';
import { useHintLadder } from './useHintLadder';
import type { TaskProps } from './TaskProps';

/**
 * LETTER_SOUND: the child sees a letter and taps which of several voice
 * buttons says it.
 *
 * This is the reverse of Sound Hunt, and both are needed: recognising `s` on
 * sight and recalling `s` from the sound /s/ are different abilities, and
 * reading requires both. Mastery of a grapheme therefore needs both skills.
 */
export function SoundSinger({ task, audio, externalTier, dimmed, onAnswer, position }: TaskProps) {
  const grapheme = GRAPHEMES[task.correctChoice];

  const playPrompt = useCallback(() => {
    void audio.say('ui.find_letter');
  }, [audio]);

  const { tier, bumpToTier } = useHintLadder({
    taskId: task.id,
    externalTier,
    onIdleNudge: playPrompt,
  });

  useEffect(playPrompt, [playPrompt]);

  return (
    <TaskFrame
      position={position}
      tier={tier}
      onReplay={playPrompt}
      onAskForHelp={() => bumpToTier(2)}
    >
      <Text style={styles.bigLetter}>{task.correctChoice}</Text>
      <Text style={styles.prompt}>Which sound does it make?</Text>

      {tier >= 2 ? (
        <Text style={styles.mnemonic}>
          {grapheme.mnemonicEmoji} {grapheme.mnemonic}
        </Text>
      ) : null}

      <View style={styles.row}>
        {task.choices.map((choice) => {
          const isDimmed = dimmed.includes(choice);
          const isRevealed = tier >= 3 && choice === task.correctChoice;
          return (
            <Pressable
              key={choice}
              accessibilityRole="button"
              accessibilityLabel={`Play sound ${choice}`}
              disabled={isDimmed}
              style={[styles.speaker, isDimmed && styles.speakerDimmed, isRevealed && styles.speakerRevealed]}
              onPress={() => {
                // Hearing the candidate is the task, so play it, then record
                // the tap as the answer.
                void audio.interrupt(GRAPHEMES[choice].audio.phoneme);
                onAnswer(choice);
              }}
            >
              <Text style={styles.speakerIcon}>🔊</Text>
            </Pressable>
          );
        })}
      </View>
    </TaskFrame>
  );
}

const styles = StyleSheet.create({
  bigLetter: {
    fontFamily: tokens.font.letter,
    fontSize: 120,
    color: tokens.color.ink,
    fontWeight: '700',
  },
  prompt: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.inkSoft },
  mnemonic: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.ink },
  row: { flexDirection: 'row', gap: tokens.space.lg },
  speaker: {
    width: tokens.tap.tile,
    height: tokens.tap.tile,
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.color.tile,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 4,
    borderBottomColor: tokens.color.tileEdge,
  },
  speakerDimmed: { opacity: 0.4, backgroundColor: tokens.color.notThis },
  speakerRevealed: { backgroundColor: tokens.color.hint, borderBottomColor: tokens.color.gold },
  speakerIcon: { fontSize: 44 },
});
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/game && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/game/src/tasks/SoundHunt.tsx apps/game/src/tasks/SoundSinger.tsx
git commit -m "feat(game): add Sound Hunt and Sound Singer mini-games"
```

---

## Task 25: Picture Match

**Files:**
- Create: `apps/game/src/tasks/PictureMatch.tsx`

- [ ] **Step 1: Write `apps/game/src/tasks/PictureMatch.tsx`**

```tsx
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { WORDS } from '@soundlings/curriculum';
import { tokens } from '@soundlings/ui';
import { TaskFrame } from './TaskFrame';
import { useHintLadder } from './useHintLadder';
import type { TaskProps } from './TaskProps';

/**
 * BLEND_READ: the written word is shown and the child taps the matching
 * picture.
 *
 * The word is NOT read aloud. Reading it is the task, and speaking it first
 * turns the whole thing into picture-vocabulary. The only audio is the
 * instruction, and the tier-2 hint sounds out the graphemes one at a time —
 * which is the actual skill being taught.
 */
export function PictureMatch({ task, audio, externalTier, dimmed, onAnswer, position }: TaskProps) {
  const word = WORDS[task.correctChoice];
  const [sounding, setSounding] = useState(false);

  const playPrompt = useCallback(() => {
    void audio.say('ui.tap_picture');
  }, [audio]);

  const soundItOut = useCallback(async () => {
    setSounding(true);
    const graphemeKeys = word.graphemes.map((g) => `ph.${g}`);
    await audio.sayAll([...graphemeKeys, word.audio]);
    setSounding(false);
  }, [audio, word]);

  const { tier, bumpToTier } = useHintLadder({
    taskId: task.id,
    externalTier,
    onIdleNudge: playPrompt,
  });

  useEffect(playPrompt, [playPrompt]);

  useEffect(() => {
    if (tier >= 2) void soundItOut();
  }, [tier, soundItOut]);

  return (
    <TaskFrame
      position={position}
      tier={tier}
      onReplay={playPrompt}
      onAskForHelp={() => bumpToTier(2)}
    >
      <View style={styles.wordCard}>
        {word.graphemes.map((grapheme, index) => (
          <Text key={`${grapheme}-${index}`} style={[styles.wordLetter, sounding && styles.wordLetterSounding]}>
            {grapheme}
          </Text>
        ))}
      </View>

      <Text style={styles.prompt}>Which picture is it?</Text>

      <View style={styles.row}>
        {task.choices.map((choice) => {
          const candidate = WORDS[choice];
          const isDimmed = dimmed.includes(choice);
          const isRevealed = tier >= 3 && choice === task.correctChoice;
          return (
            <Pressable
              key={choice}
              accessibilityRole="button"
              accessibilityLabel={`Picture of ${choice}`}
              disabled={isDimmed}
              style={[styles.picture, isDimmed && styles.pictureDimmed, isRevealed && styles.pictureRevealed]}
              onPress={() => onAnswer(choice)}
            >
              <Text style={styles.pictureEmoji}>{candidate.picture}</Text>
            </Pressable>
          );
        })}
      </View>
    </TaskFrame>
  );
}

const styles = StyleSheet.create({
  wordCard: {
    flexDirection: 'row',
    backgroundColor: tokens.color.tile,
    paddingHorizontal: tokens.space.lg,
    paddingVertical: tokens.space.md,
    borderRadius: tokens.radius.lg,
    borderBottomWidth: 4,
    borderBottomColor: tokens.color.tileEdge,
  },
  wordLetter: {
    fontFamily: tokens.font.letter,
    fontSize: tokens.type.word,
    color: tokens.color.ink,
    fontWeight: '700',
  },
  wordLetterSounding: { color: tokens.color.accent },
  prompt: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.inkSoft },
  row: { flexDirection: 'row', gap: tokens.space.lg },
  picture: {
    width: tokens.tap.tile,
    height: tokens.tap.tile,
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.color.tile,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 4,
    borderBottomColor: tokens.color.tileEdge,
  },
  pictureDimmed: { opacity: 0.4, backgroundColor: tokens.color.notThis },
  pictureRevealed: { backgroundColor: tokens.color.hint, borderBottomColor: tokens.color.gold },
  pictureEmoji: { fontSize: 56 },
});
```

- [ ] **Step 2: Typecheck and commit**

Run: `cd apps/game && npx tsc --noEmit`
Expected: no errors.

```bash
git add apps/game/src/tasks/PictureMatch.tsx
git commit -m "feat(game): add Picture Match mini-game with sound-it-out hint"
```

---

## Task 26: Word Builder

**Files:**
- Create: `apps/game/src/tasks/WordBuilder.tsx`
- Create: `apps/game/src/tasks/registry.ts`

**Tap-to-place, not drag-and-drop.** Dragging is a fine-motor challenge, and a five-year-old who drops a tile has failed at dragging, not at spelling — which pollutes the mastery data with noise that has nothing to do with phonics. Tap a tile, it flies to the next empty slot. Tap a filled slot to send it back. Dragging can be added later as an alternative input; it must never be the only one.

- [ ] **Step 1: Write `apps/game/src/tasks/WordBuilder.tsx`**

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { WORDS } from '@soundlings/curriculum';
import { tokens } from '@soundlings/ui';
import { LetterTile } from './LetterTile';
import { TaskFrame } from './TaskFrame';
import { useHintLadder } from './useHintLadder';
import type { TaskProps } from './TaskProps';

/**
 * SEGMENT_SPELL: the child hears a word and builds it from letter tiles.
 *
 * Input is tap-to-place rather than drag-and-drop. A dropped tile is a
 * fine-motor failure, not a spelling failure, and letting it count as a wrong
 * answer would put noise into the mastery data that has nothing to do with
 * phonics. Tap a tile to place it, tap a slot to take it back.
 */
export function WordBuilder({ task, audio, externalTier, dimmed, onAnswer, position }: TaskProps) {
  const word = WORDS[task.correctChoice];
  const slotCount = word.graphemes.length;
  const [slots, setSlots] = useState<(string | null)[]>(() => Array(slotCount).fill(null));

  const playPrompt = useCallback(() => {
    void audio.sayAll(['ui.build_word', word.audio]);
  }, [audio, word.audio]);

  const { tier, bumpToTier } = useHintLadder({
    taskId: task.id,
    externalTier,
    onIdleNudge: playPrompt,
  });

  useEffect(() => {
    setSlots(Array(slotCount).fill(null));
  }, [task.id, slotCount]);

  useEffect(playPrompt, [playPrompt]);

  useEffect(() => {
    if (tier >= 2) {
      // Say the word, then each sound in order — that is the segmenting
      // process the child is being asked to perform.
      void audio.sayAll([word.audio, ...word.graphemes.map((g) => `ph.${g}`)]);
    }
  }, [tier, audio, word]);

  const usedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const slot of slots) {
      if (slot) counts.set(slot, (counts.get(slot) ?? 0) + 1);
    }
    return counts;
  }, [slots]);

  const availableCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const choice of task.choices) counts.set(choice, (counts.get(choice) ?? 0) + 1);
    return counts;
  }, [task.choices]);

  const place = (letter: string) => {
    const nextEmpty = slots.indexOf(null);
    if (nextEmpty === -1) return;
    const used = usedCounts.get(letter) ?? 0;
    const available = availableCounts.get(letter) ?? 0;
    if (used >= available) return;

    const next = [...slots];
    next[nextEmpty] = letter;
    setSlots(next);
    void audio.say(`ph.${letter}`);

    if (!next.includes(null)) {
      onAnswer(next.join(''));
    }
  };

  const takeBack = (index: number) => {
    if (slots[index] === null) return;
    const next = [...slots];
    next[index] = null;
    setSlots(next);
  };

  return (
    <TaskFrame
      position={position}
      tier={tier}
      onReplay={playPrompt}
      onAskForHelp={() => bumpToTier(2)}
    >
      <Text style={styles.prompt}>Build the word you heard</Text>

      <View style={styles.slots}>
        {slots.map((slot, index) => (
          <Pressable
            key={index}
            accessibilityRole="button"
            accessibilityLabel={slot ? `Slot ${index + 1}, ${slot}. Tap to remove.` : `Empty slot ${index + 1}`}
            onPress={() => takeBack(index)}
            style={[styles.slot, slot !== null && styles.slotFilled]}
          >
            <Text style={styles.slotLetter}>
              {slot ?? (tier >= 3 ? word.graphemes[index] : '')}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.tiles}>
        {task.choices.map((choice, index) => {
          const used = (usedCounts.get(choice) ?? 0) >= (availableCounts.get(choice) ?? 0);
          return (
            <LetterTile
              key={`${choice}-${index}`}
              label={choice}
              size={88}
              accessibilityLabel={`Letter ${choice}`}
              state={used || dimmed.includes(choice) ? 'dimmed' : 'idle'}
              onPress={() => place(choice)}
            />
          );
        })}
      </View>
    </TaskFrame>
  );
}

const styles = StyleSheet.create({
  prompt: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.inkSoft },
  slots: { flexDirection: 'row', gap: tokens.space.md },
  slot: {
    width: 88,
    height: 104,
    borderRadius: tokens.radius.md,
    borderWidth: 3,
    borderStyle: 'dashed',
    borderColor: tokens.color.tileEdge,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.color.paper,
  },
  slotFilled: {
    borderStyle: 'solid',
    backgroundColor: tokens.color.tile,
    borderColor: tokens.color.accent,
  },
  slotLetter: {
    fontFamily: tokens.font.letter,
    fontSize: tokens.type.letter,
    color: tokens.color.ink,
    fontWeight: '700',
  },
  tiles: { flexDirection: 'row', gap: tokens.space.md, marginTop: tokens.space.lg },
});
```

- [ ] **Step 2: Write `apps/game/src/tasks/registry.ts`**

```ts
import type { ComponentType } from 'react';
import { PictureMatch } from './PictureMatch';
import { SoundHunt } from './SoundHunt';
import { SoundSinger } from './SoundSinger';
import { WordBuilder } from './WordBuilder';
import type { TaskProps } from './TaskProps';

/**
 * Maps the engine's task-type ids to components. This is the only place the
 * pure engine and the React layer meet — the engine schedules by id and never
 * knows a component exists.
 */
export const TASK_COMPONENTS: Record<string, ComponentType<TaskProps>> = {
  'sound-hunt': SoundHunt,
  'sound-singer': SoundSinger,
  'picture-match': PictureMatch,
  'word-builder': WordBuilder,
};

export function componentFor(taskTypeId: string): ComponentType<TaskProps> {
  const component = TASK_COMPONENTS[taskTypeId];
  if (!component) throw new Error(`No component registered for task type: ${taskTypeId}`);
  return component;
}
```

- [ ] **Step 3: Verify the registry covers every engine task type**

Create `apps/game/src/tasks/registry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { TASK_TYPES } from '@soundlings/engine';
import { TASK_COMPONENTS } from './registry';

describe('task registry', () => {
  it('registers a component for every task type the engine can schedule', () => {
    const missing = TASK_TYPES.filter((t) => !(t.id in TASK_COMPONENTS)).map((t) => t.id);
    expect(missing, `no component for: ${missing.join(', ')}`).toEqual([]);
  });

  it('registers nothing the engine does not know about', () => {
    const known = new Set(TASK_TYPES.map((t) => t.id));
    const extra = Object.keys(TASK_COMPONENTS).filter((id) => !known.has(id));
    expect(extra, `orphan components: ${extra.join(', ')}`).toEqual([]);
  });
});
```

This test imports `.tsx` modules from a `.ts` test, which the current vitest config will not transform. Rename the test to `registry.test.ts` only if it passes; otherwise move this assertion into Plan 2 along with the component test environment. The cheap version that works today is the typecheck plus the explicit `componentFor` throw.

Run: `npx vitest run apps/game/src/tasks/registry.test.ts`
Expected: PASS if vitest resolves the `.tsx` imports; if it fails to transform JSX, delete this test file and rely on `componentFor` throwing at runtime. Note which you did in the commit.

- [ ] **Step 4: Typecheck and commit**

Run: `cd apps/game && npx tsc --noEmit`
Expected: no errors.

```bash
git add apps/game/src/tasks
git commit -m "feat(game): add Word Builder with tap-to-place input and task registry"
```

---

## Task 27: Quest runner

**Files:**
- Create: `apps/game/src/quest/useQuest.ts`
- Create: `apps/game/app/quest.tsx`
- Test: `apps/game/src/quest/useQuest.test.ts`

The orchestrator. All the judgement lives in `judgeAnswer` and `advance`, which are plain functions so they can be tested without rendering.

Critically, this applies outcomes through `applyTaskOutcome` from the engine — the same function the simulation uses. If the app ever folded outcomes differently, the calibrated pacing numbers would stop describing the real game.

- [ ] **Step 1: Write the failing test**

Create `apps/game/src/quest/useQuest.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, buildSession } from '@soundlings/engine';
import { dimmedFor, judgeAnswer, starsFor } from './questLogic';

const NOW = 1_000_000;

function plan() {
  return buildSession({ sessionId: 'q', level: 1, mastery: {}, confusions: {}, now: NOW });
}

describe('judgeAnswer', () => {
  it('accepts the correct choice', () => {
    const task = plan()[0];
    expect(judgeAnswer(task, task.correctChoice).correct).toBe(true);
  });

  it('rejects a wrong choice and reports what was chosen', () => {
    const task = plan().find((t) => t.taskTypeId === 'sound-hunt');
    if (!task) throw new Error('expected a sound-hunt task');
    const wrong = task.choices.find((c) => c !== task.correctChoice);
    if (!wrong) throw new Error('expected a wrong choice');
    const result = judgeAnswer(task, wrong);
    expect(result.correct).toBe(false);
    expect(result.chosen).toBe(wrong);
  });

  it('compares spelling answers case-insensitively so proper nouns work', () => {
    const task = { ...plan()[0], correctChoice: 'Sam', skill: 'SEGMENT_SPELL' as const };
    expect(judgeAnswer(task, 'sam').correct).toBe(true);
  });
});

describe('starsFor', () => {
  it('awards three stars for a flawless quest', () => {
    expect(starsFor({ errors: 0, scaffolds: 0 })).toBe(3);
  });

  it('awards two stars for a couple of slips', () => {
    expect(starsFor({ errors: 2, scaffolds: 0 })).toBe(2);
  });

  it('never awards zero stars, however hard the quest went', () => {
    // A child who sat through fourteen tasks has earned something. Zero stars
    // is a punishment, and punishment is not what gets them to open the app
    // again tomorrow.
    expect(starsFor({ errors: 20, scaffolds: 14 })).toBeGreaterThanOrEqual(1);
  });

  it('counts scaffolded wins as less than clean wins', () => {
    expect(starsFor({ errors: 0, scaffolds: 5 })).toBeLessThan(starsFor({ errors: 0, scaffolds: 0 }));
  });
});

describe('dimmedFor', () => {
  it('dims nothing below hint tier 2', () => {
    expect(dimmedFor(plan()[0], 1)).toEqual([]);
  });

  it('leaves exactly two choices at hint tier 2', () => {
    const task = plan().find((t) => t.choices.length > 2);
    if (!task) return; // a brand-new child starts with two-way choices only
    const dimmed = dimmedFor(task, 2);
    expect(task.choices.length - dimmed.length).toBe(2);
  });

  it('never dims the correct answer', () => {
    for (const task of plan()) {
      expect(dimmedFor(task, 3)).not.toContain(task.correctChoice);
    }
  });

  it('dims nothing on a spelling task, where tiles are not choices', () => {
    const task = plan().find((t) => t.taskTypeId === 'word-builder');
    if (!task) throw new Error('expected a word-builder task');
    expect(dimmedFor(task, 2)).toEqual([]);
  });
});

describe('config coupling', () => {
  it('uses the engine default session length', () => {
    expect(plan().length).toBe(DEFAULT_CONFIG.sessionLength);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run apps/game/src/quest/useQuest.test.ts`
Expected: FAIL — `Failed to resolve import "./questLogic"`.

- [ ] **Step 3: Write `apps/game/src/quest/questLogic.ts`**

```ts
import type { TargetId, TaskInstance } from '@soundlings/engine';

export interface Judgement {
  correct: boolean;
  chosen?: TargetId;
}

/**
 * Compares an answer to the task's correct choice.
 *
 * Case-insensitive because proper nouns like "Sam" are stored capitalised but
 * built from lowercase tiles — a child spelling s-a-m is right.
 */
export function judgeAnswer(task: TaskInstance, answer: string): Judgement {
  const correct = answer.toLowerCase() === task.correctChoice.toLowerCase();
  return correct ? { correct: true } : { correct: false, chosen: answer };
}

/**
 * Stars for a finished quest. The floor is one.
 *
 * A child who sat through fourteen tasks has earned something, whatever the
 * accuracy. Zero stars is a punishment for effort, and effort is exactly the
 * behaviour that brings them back tomorrow.
 */
export function starsFor(tally: { errors: number; scaffolds: number }): 1 | 2 | 3 {
  if (tally.errors === 0 && tally.scaffolds === 0) return 3;
  if (tally.errors <= 2 && tally.scaffolds <= 2) return 2;
  return 1;
}

/**
 * Which choices to dim at hint tier 2+, narrowing to a two-way decision.
 *
 * Word Builder is excluded: its "choices" are letter tiles the child needs to
 * assemble, so dimming them would remove letters the word requires.
 */
export function dimmedFor(task: TaskInstance, tier: number): TargetId[] {
  if (tier < 2) return [];
  if (task.skill === 'SEGMENT_SPELL') return [];

  const wrong = task.choices.filter((choice) => choice !== task.correctChoice);
  // Keep one wrong answer, dim the rest.
  return wrong.slice(1);
}
```

- [ ] **Step 4: Write `apps/game/src/quest/useQuest.ts`**

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_CONFIG,
  FrustrationGuard,
  applyTaskOutcome,
  buildSession,
  levelProgress,
  recordConfusion,
} from '@soundlings/engine';
import type { ConfusionMap, MasteryMap, TaskInstance } from '@soundlings/engine';
import type { AudioService } from '@soundlings/audio';
import type { ActiveSession, ProgressRepo } from '../data/ProgressRepo';
import type { HintTier } from '../tasks/useHintLadder';
import { dimmedFor, judgeAnswer, starsFor } from './questLogic';

export interface QuestState {
  status: 'loading' | 'playing' | 'finished';
  task: TaskInstance | null;
  index: number;
  total: number;
  tier: HintTier;
  dimmed: string[];
  stars: 1 | 2 | 3;
  newCreatures: string[];
}

/**
 * Runs one quest.
 *
 * Progress is persisted after every answered task, not at the end. A
 * five-year-old will be interrupted constantly, and losing a session to a
 * sibling or a flat battery is the kind of thing that gets an app deleted.
 */
export function useQuest(args: {
  profileId: string;
  level: number;
  repo: ProgressRepo;
  audio: AudioService;
  now: () => number;
}) {
  const { profileId, level, repo, audio, now } = args;
  const config = DEFAULT_CONFIG;

  const [state, setState] = useState<QuestState>({
    status: 'loading',
    task: null,
    index: 0,
    total: config.sessionLength,
    tier: 0,
    dimmed: [],
    stars: 3,
    newCreatures: [],
  });

  const session = useRef<ActiveSession | null>(null);
  const mastery = useRef<MasteryMap>({});
  const confusions = useRef<ConfusionMap>({});
  const guard = useRef(new FrustrationGuard(config));
  const tally = useRef({ errors: 0, scaffolds: 0 });
  const maxDifficulty = useRef<number | undefined>(undefined);
  const shownAt = useRef(now());
  const creaturesBefore = useRef<string[]>([]);

  // Load, or resume an interrupted quest.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const [loadedMastery, loadedConfusions, active] = await Promise.all([
        repo.loadMastery(profileId),
        repo.loadConfusions(profileId),
        repo.loadActiveSession(profileId),
      ]);
      if (cancelled) return;

      mastery.current = loadedMastery;
      confusions.current = loadedConfusions;
      creaturesBefore.current = levelProgress(level, loadedMastery, now(), config).creaturesEarned;

      const resumed =
        active && active.level === level && active.index < active.plan.length ? active : null;

      const current: ActiveSession = resumed ?? {
        sessionId: `${profileId}-${now()}`,
        level,
        plan: buildSession({
          sessionId: `${profileId}-${now()}`,
          level,
          mastery: loadedMastery,
          confusions: loadedConfusions,
          now: now(),
          config,
        }),
        index: 0,
        stars: 3,
        startedAt: now(),
      };

      session.current = current;
      await repo.saveActiveSession(profileId, current);

      const task = current.plan[current.index];
      await audio.preload(preloadKeysFor(current.plan.slice(current.index, current.index + 3)));

      shownAt.current = now();
      setState((prev) => ({
        ...prev,
        status: 'playing',
        task,
        index: current.index,
        total: current.plan.length,
        tier: 0,
        dimmed: [],
      }));
    })();

    return () => {
      cancelled = true;
    };
  }, [profileId, level, repo, audio, now, config]);

  const answer = useCallback(
    async (given: string) => {
      const current = session.current;
      const task = current?.plan[current.index];
      if (!current || !task) return;

      const judgement = judgeAnswer(task, given);
      const latencyMs = Math.max(0, now() - shownAt.current);

      const directive = guard.current.record(task.primaryTarget, judgement.correct);
      const scaffolded = !judgement.correct && directive.scaffold;

      if (judgement.correct) {
        await audio.praise();
      } else {
        tally.current.errors += 1;
        if (scaffolded) tally.current.scaffolds += 1;
        await audio.encourage();
      }

      // Record the outcome exactly as the simulation does, so the calibrated
      // pacing numbers continue to describe the real game.
      mastery.current = applyTaskOutcome({
        mastery: mastery.current,
        task,
        sessionId: current.sessionId,
        correct: judgement.correct || scaffolded,
        scaffolded,
        latencyMs,
        at: now(),
        config,
        ...(judgement.chosen === undefined ? {} : { chosen: judgement.chosen }),
      });

      if (judgement.chosen !== undefined) {
        confusions.current = recordConfusion(confusions.current, task.primaryTarget, judgement.chosen);
      }

      await repo.appendAttempt(profileId, {
        sessionId: current.sessionId,
        targetId: task.primaryTarget,
        skill: task.skill,
        taskTypeId: task.taskTypeId,
        correct: judgement.correct || scaffolded,
        scaffolded,
        latencyMs,
        weight: 1,
        at: now(),
        ...(judgement.chosen === undefined ? {} : { chosen: judgement.chosen }),
      });

      if (directive.capDifficulty !== null) maxDifficulty.current = directive.capDifficulty;

      // A wrong answer that is not yet abandoned leaves the child on the same
      // task with more help, rather than moving them past something unlearnt.
      if (!judgement.correct && !directive.abandon && !scaffolded) {
        setState((prev) => ({
          ...prev,
          tier: directive.hintTier as HintTier,
          dimmed: dimmedFor(task, directive.hintTier),
        }));
        return;
      }

      let plan = current.plan;
      if (directive.truncateTo !== null && directive.truncateTo < plan.length) {
        // Shorten, but still finish on an anchor so the quest ends on a win.
        const anchor = plan.slice(current.index + 1).find((t) => t.anchor);
        plan = plan.slice(0, Math.max(current.index + 1, directive.truncateTo - 1));
        if (anchor) plan = [...plan, anchor];
      }

      const nextIndex = current.index + 1;
      const finished = nextIndex >= plan.length;

      const updated: ActiveSession = finished
        ? { ...current, plan, index: nextIndex }
        : { ...current, plan, index: nextIndex };

      session.current = updated;
      await repo.saveMastery(profileId, mastery.current);
      await repo.saveConfusions(profileId, confusions.current);

      if (finished) {
        const stars = starsFor(tally.current);
        await repo.saveActiveSession(profileId, null);
        await repo.saveHighScore(profileId, {
          level,
          stars,
          cleanRun: tally.current.errors === 0 && tally.current.scaffolds === 0,
          at: now(),
        });

        const after = levelProgress(level, mastery.current, now(), config).creaturesEarned;
        const newCreatures = after.filter((id) => !creaturesBefore.current.includes(id));

        await audio.say('ui.all_done');
        setState((prev) => ({ ...prev, status: 'finished', task: null, stars, newCreatures }));
        return;
      }

      await repo.saveActiveSession(profileId, updated);
      const nextTask = plan[nextIndex];
      shownAt.current = now();
      setState((prev) => ({
        ...prev,
        task: nextTask,
        index: nextIndex,
        total: plan.length,
        tier: 0,
        dimmed: [],
      }));
    },
    [profileId, level, repo, audio, now, config],
  );

  const progress = useMemo(
    () => levelProgress(level, mastery.current, now(), config),
    [level, now, config, state.index],
  );

  return { state, answer, progress };
}

/** Audio to warm up for the next few tasks, so a prompt never arrives late. */
function preloadKeysFor(tasks: TaskInstance[]): string[] {
  const keys = new Set<string>([
    'ui.which_says',
    'ui.find_letter',
    'ui.build_word',
    'ui.tap_picture',
    'ui.all_done',
  ]);
  for (const task of tasks) {
    if (task.primaryTarget.length === 1) {
      keys.add(`ph.${task.primaryTarget}`);
      keys.add(`ln.${task.primaryTarget}`);
    } else {
      keys.add(`wd.${task.primaryTarget.toLowerCase()}`);
      for (const grapheme of task.secondaryTargets) keys.add(`ph.${grapheme}`);
    }
    for (const choice of task.choices) {
      if (choice.length === 1) keys.add(`ph.${choice}`);
      else keys.add(`wd.${choice.toLowerCase()}`);
    }
  }
  return [...keys];
}
```

- [ ] **Step 5: Write `apps/game/app/quest.tsx`**

```tsx
import { useMemo } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AudioService } from '@soundlings/audio';
import { tokens } from '@soundlings/ui';
import { ExpoClipPlayer } from '../src/audio/ExpoClipPlayer';
import { AsyncStorageProgressRepo } from '../src/data/AsyncStorageProgressRepo';
import { componentFor } from '../src/tasks/registry';
import { useQuest } from '../src/quest/useQuest';

/** Plan 2 replaces this with the selected child profile. */
const PROFILE_ID = 'dev-profile';

export default function QuestScreen() {
  const router = useRouter();

  const audio = useMemo(() => {
    const player = new ExpoClipPlayer();
    void player.configure();
    return new AudioService(player);
  }, []);

  const repo = useMemo(() => new AsyncStorageProgressRepo(), []);
  const now = useMemo(() => () => Date.now(), []);

  const { state, answer } = useQuest({ profileId: PROFILE_ID, level: 1, repo, audio, now });

  if (state.status === 'finished') {
    router.replace({
      pathname: '/results',
      params: { stars: String(state.stars), creatures: state.newCreatures.join(',') },
    });
    return null;
  }

  if (state.status === 'loading' || !state.task) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={tokens.color.accent} />
      </View>
    );
  }

  const TaskComponent = componentFor(state.task.taskTypeId);

  return (
    <TaskComponent
      task={state.task}
      audio={audio}
      externalTier={state.tier}
      dimmed={state.dimmed}
      onAnswer={(given) => void answer(given)}
      position={{ index: state.index, total: state.total }}
    />
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.color.paper,
  },
});
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run apps/game/src/quest`
Expected: PASS, 11 tests.

- [ ] **Step 7: Typecheck and commit**

Run: `cd apps/game && npx tsc --noEmit`
Expected: no errors.

```bash
git add apps/game/src/quest apps/game/app/quest.tsx
git commit -m "feat(game): add quest runner with per-task persistence and scaffolding"
```

---

## Task 28: Results screen

**Files:**
- Create: `apps/game/app/results.tsx`

The quest ends by **suggesting the child stops**. That is a deliberate product decision and the thing parents will notice first: an educational app that does not try to extend the session is one they will trust and recommend. There is no "play again" button in the primary position.

- [ ] **Step 1: Write `apps/game/app/results.tsx`**

```tsx
import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CREATURES } from '@soundlings/curriculum';
import { tokens } from '@soundlings/ui';

export default function ResultsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ stars?: string; creatures?: string }>();

  const stars = Math.max(1, Math.min(3, Number(params.stars ?? '1')));
  const creatureIds = (params.creatures ?? '').split(',').filter(Boolean);

  useEffect(() => {
    // No auto-advance. The child decides when to leave this screen.
  }, []);

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>All done!</Text>

      <View style={styles.stars}>
        {[0, 1, 2].map((i) => (
          <Text key={i} style={[styles.star, i >= stars && styles.starEmpty]}>
            ★
          </Text>
        ))}
      </View>

      {creatureIds.length > 0 ? (
        <View style={styles.hatched}>
          <Text style={styles.hatchedTitle}>
            {creatureIds.length === 1 ? 'A new friend hatched!' : 'New friends hatched!'}
          </Text>
          <View style={styles.creatureRow}>
            {creatureIds.map((id) => {
              const creature = CREATURES[id];
              if (!creature) return null;
              return (
                <View key={id} style={styles.creature}>
                  <Text style={styles.creatureEmoji}>{creature.emoji}</Text>
                  <Text style={styles.creatureName}>{creature.name}</Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {/*
        The primary action is stopping. An app for five-year-olds that nudges
        "one more round" is optimising for screen time against the parent's
        interests, and parents can tell.
      */}
      <Text style={styles.enough}>That&apos;s enough for today — come back tomorrow!</Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Finish"
        style={styles.primary}
        onPress={() => router.replace('/')}
      >
        <Text style={styles.primaryText}>Finish</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Play one more quest"
        style={styles.secondary}
        onPress={() => router.replace('/quest')}
      >
        <Text style={styles.secondaryText}>One more</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.color.paper,
    gap: tokens.space.md,
    padding: tokens.space.xl,
  },
  title: { fontFamily: tokens.font.ui, fontSize: tokens.type.title, color: tokens.color.ink, fontWeight: '700' },
  stars: { flexDirection: 'row', gap: tokens.space.sm },
  star: { fontSize: 64, color: tokens.color.gold },
  starEmpty: { color: tokens.color.line },
  hatched: { alignItems: 'center', gap: tokens.space.sm },
  hatchedTitle: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.ink },
  creatureRow: { flexDirection: 'row', gap: tokens.space.lg },
  creature: { alignItems: 'center' },
  creatureEmoji: { fontSize: 56 },
  creatureName: { fontFamily: tokens.font.ui, fontSize: tokens.type.caption, color: tokens.color.inkSoft },
  enough: {
    fontFamily: tokens.font.ui,
    fontSize: tokens.type.body,
    color: tokens.color.inkSoft,
    textAlign: 'center',
    marginTop: tokens.space.md,
  },
  primary: {
    paddingHorizontal: tokens.space.xl,
    height: tokens.tap.control,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { fontFamily: tokens.font.ui, fontSize: tokens.type.body, color: tokens.color.onAccent, fontWeight: '700' },
  secondary: { paddingHorizontal: tokens.space.lg, height: tokens.tap.min, justifyContent: 'center' },
  secondaryText: { fontFamily: tokens.font.ui, fontSize: tokens.type.caption, color: tokens.color.inkSoft },
});
```

- [ ] **Step 2: Typecheck and commit**

Run: `cd apps/game && npx tsc --noEmit`
Expected: no errors.

```bash
git add apps/game/app/results.tsx
git commit -m "feat(game): add results screen that encourages stopping"
```

---

## Task 29: Review gate — play Level 1 on an iPad

**Files:**
- Create: `docs/REVIEW-GATE.md`

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all suites green across curriculum, engine, ui, audio, and app logic. Record the totals; they go in the review note.

- [ ] **Step 2: Typecheck everything**

Run: `npm run typecheck && cd apps/game && npx tsc --noEmit`
Expected: no errors from either.

- [ ] **Step 3: Launch on an iPad simulator**

Run: `cd apps/game && npx expo start --ios`

Then, in the simulator, choose an iPad (Device > iPad Pro 11-inch) and reload.

- [ ] **Step 4: Walk the acceptance checklist**

Play a full quest and confirm each item. Any "no" is a bug to fix before handing this over, not a note for later.

Audio
- [ ] A sound plays as each task appears, without being asked
- [ ] Two clips never overlap
- [ ] The placeholder-voice banner is visible on the entry screen
- [ ] The speaker button replays the prompt

Mini-games
- [ ] All four appear during a single quest
- [ ] No two identical mini-games appear back to back
- [ ] Word Builder places a tile on tap and returns it on tapping the slot
- [ ] Picture Match never speaks the word before the child answers

Hints
- [ ] Doing nothing for ~4s repeats the prompt and nudges the owl
- [ ] Doing nothing for ~9s shows the mnemonic and dims to two choices
- [ ] One wrong answer narrows the choices rather than moving on
- [ ] Two wrong answers on the same target reveal the answer
- [ ] Tapping the owl gives help immediately, with no penalty

Feel
- [ ] A correct answer responds within ~200ms
- [ ] A wrong answer dims — nothing turns red
- [ ] Letters render with a single-storey `a`
- [ ] Every tile is comfortably thumb-sized on an 11-inch iPad

Session shape
- [ ] The quest is 14 tasks
- [ ] It opens on something easy
- [ ] It ends with stars, and at least one star always
- [ ] The results screen suggests stopping

Persistence
- [ ] Force-quitting mid-quest and relaunching resumes on the same task
- [ ] A second quest is composed differently from the first
- [ ] Completing several quests eventually hatches a creature

- [ ] **Step 5: Write the review note**

Create `docs/REVIEW-GATE.md`:

```markdown
# Review gate: playable Level 1

**Built:** Plan 1 — spec build-order steps 1–6.

## What to try

1. `cd apps/game && npx expo start --ios`, pick an iPad in the simulator.
2. Tap Play. Play a full 14-task quest.
3. Deliberately answer wrong twice on the same letter — watch the hint ladder
   and the scaffolding.
4. Force-quit mid-quest, relaunch, confirm it resumes in place.
5. Play four or five quests to see a creature hatch.

## What is deliberately not here

- **Voice is a placeholder** (macOS `say`). Phoneme clips are approximations.
  Fine for judging the game, not for a real child. See spec §9.3.
- **Pictures are emoji** stand-ins pending illustration.
- **No profile picker, island home, trophy room or parent area** — Plan 2.
- **No backend.** Progress is on-device. Supabase is Plan 2.
- **No voice recognition.** Architected (`SAY_IT` skill exists), not built.

## What to judge

The adaptive behaviour is the thing to assess, and it is mostly invisible in a
single quest. The engine tests and the simulation harness are where it is
legible:

- `npx vitest run packages/engine` — the invariants in plain language
- `npx vitest run packages/engine/src/simulate.test.ts` — pacing for a fast,
  average and struggling child

## Test counts

Run `npm test` and record the totals here.
```

- [ ] **Step 6: Commit**

```bash
git add docs/REVIEW-GATE.md
git commit -m "docs: add review gate checklist for playable Level 1"
```

---

## Plan 2 preview (not in scope)

For reference only. Do not start these.

1. Profile picker and multiple child profiles
2. Island home as the creature-collection progress map
3. Level select and trophy room
4. Supabase schema, RLS policies, and the offline sync queue
5. PIN-gated parent area with the per-sound mastery heatmap and confusion pairs
6. Real voice pack and the Metro asset-map generator for standalone builds
7. Illustrated pictures replacing emoji
8. `SAY_IT` voice tasks
9. Levels 2–6 content

---

## Self-review notes

Checked against the spec, section by section.

**Covered:** §3 repo shape (Tasks 1, 6, 16, 18, 20) · §3.1 purity rule, enforced by test (Tasks 5, 6) · §4 domain model (Tasks 2, 6) · §4.4 composite crediting (Tasks 10, 15) · §5.1–5.3 mastery (Tasks 7–9) · §5.4 session builder and all seven invariants (Task 12) · §5.5 distractors (Task 11) · §5.6 frustration guard (Task 13) · §5.7 completion (Task 14) · §6 Level 1 content (Tasks 3–5) · §6.1 four mini-games (Tasks 23–26) · §6.2 creatures (Tasks 5, 28) · §7 screens in scope (Tasks 20, 27, 28) · §7.2 save/resume (Tasks 21, 27) · §8 hint ladder (Task 22) · §9.1–9.2 audio (Tasks 17–19) · §10.1 repository shape and append-only attempts (Task 21) · §11 testing strategy throughout, simulation harness in Task 15.

**Deliberately deferred, and where:** §7 profile picker, island home, trophy room, parent area → Plan 2 · §9.3 voice sourcing → placeholder in Task 17, decision stays open · §10.1 Supabase tables and RLS → Plan 2 · §10.3 offline sync queue → Plan 2 (the repository interface in Task 21 is the seam).

**Known rough edges, flagged rather than hidden:**
- Task 20's `resolveAsset` works via the dev asset server but needs a generated `require()` map before a standalone build. Called out in that task.
- Task 26's registry test may not run until vitest can transform `.tsx`; the task says what to do either way.
- Task 15's pacing ranges may need config tuning on first run. The task says to tune `config.ts` and never the test.
