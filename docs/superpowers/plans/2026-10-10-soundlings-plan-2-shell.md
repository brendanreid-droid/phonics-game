# Soundlings Plan 2: The Shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the quest runner into something a child opens, recognises as theirs, and comes back to — their own profile, their own creature collection, their own trophies.

**Architecture:** All on-device. A new `ProfileRepo` alongside the existing `ProgressRepo`, both behind interfaces so the Supabase swap in Plan 3 touches two files. Four new screens. The pure logic — streaks, collection state, profile validation — lives in testable modules with no React.

**Tech Stack:** Unchanged. Expo Router, React Native, AsyncStorage, vitest.

**Spec:** `docs/superpowers/specs/2026-10-10-soundlings-phonics-game-design.md` §7

**Scope:** Spec §7's screens minus the parent area. Supabase, sync, the parent dashboard, real voice, illustrations, Levels 2–6 and the second mini-game per skill are all Plan 3+.

---

## What already exists

Plan 1 is complete: 785 tests, 29 tasks. `packages/curriculum`, `packages/engine` (13 modules), `packages/ui`, `packages/audio`, and an `apps/game` with four mini-games, a quest runner, a results screen and an on-device `ProgressRepo`.

The game is playable at `npm run web` from `apps/game`. One thing it does not have is any notion of *who is playing* — `apps/game/app/quest.tsx` hard-codes `PROFILE_ID = 'dev-profile'`.

## Decisions made up front

These are choices, not discoveries. Each is here so you do not have to guess.

**Creating a profile is gated; choosing one is not.** A child taps their own face to play — no passwords, no typing, nothing to forget. But *adding* and *deleting* profiles sit behind a grown-up gate, or a five-year-old will cheerfully create forty profiles and lose their progress among them. The gate is a hold-to-confirm plus a simple written instruction, not a PIN: the PIN belongs to the parent area in Plan 3, and introducing two different gates would be worse than one.

**Avatars are a fixed set of faces, not photographs and not free text.** Typing a name is beyond most five-year-olds and a camera roll is a privacy problem we do not need. A grown-up types the name once; the child identifies their profile by its face.

**A streak counts calendar days, in the device's local timezone.** Not 24-hour periods. A child who plays at 7pm Monday and 8am Tuesday has played two days running, and telling them otherwise would be both wrong and unkind. Timezone changes are handled by never storing a timezone — only a local date string.

**Level completion latches.** Spec §5.7 requires it: `levelProgress` is a live predicate, so a finished level reads as unfinished once strength decays, and one wrong answer un-masters a target. A child must never lose a level they have completed. The *badge* latches; the live progress calculation is untouched, because the island home needs to show what they can do right now.

**Existing `dev-profile` data is discarded, not migrated.** It is development data from a hard-coded id. Migrating it would mean guessing which new profile it belongs to. The first task deletes it on startup, once, and says so in a comment.

---

## File structure

### `apps/game/src/profiles` — who is playing
| File | Responsibility |
|---|---|
| `Profile.ts` | The `Profile` type and pure validation |
| `avatars.ts` | The fixed set of pickable faces |
| `ProfileRepo.ts` | Interface, plus the pure `addProfile` / `removeProfile` helpers |
| `MemoryProfileRepo.ts` | For tests |
| `AsyncStorageProfileRepo.ts` | For the device |
| `profileRepoContract.ts` | One suite both implementations must pass |
| `ProfileContext.tsx` | Provider and `useProfile()` |

### `apps/game/src/progress` — derived views of what a child has done
| File | Responsibility |
|---|---|
| `streaks.ts` | Pure streak arithmetic over local date strings |
| `collection.ts` | Pure: which creatures are hatched, which are eggs |
| `trophies.ts` | Pure: the numbers the trophy room shows |

### `apps/game/app` — screens
| File | Responsibility |
|---|---|
| `index.tsx` | Profile picker (replaces the temporary entry screen) |
| `island.tsx` | Island home: the creature collection, and Play |
| `levels.tsx` | Level select |
| `trophies.tsx` | Trophy room |
| `quest.tsx` | *Modified:* uses the selected profile |
| `results.tsx` | *Modified:* returns to the island |

---

## Task 1: The Profile type, avatars, and validation

**Files:**
- Create: `apps/game/src/profiles/Profile.ts`
- Create: `apps/game/src/profiles/avatars.ts`
- Test: `apps/game/src/profiles/Profile.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/game/src/profiles/Profile.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { AVATARS, avatarById, nextAvatarFor } from './avatars';
import { MAX_NAME_LENGTH, nameError, normaliseName } from './Profile';

describe('avatars', () => {
  it('offers at least as many faces as a family is likely to need', () => {
    expect(AVATARS.length).toBeGreaterThanOrEqual(8);
  });

  it('gives every avatar a unique id and a distinct face', () => {
    expect(new Set(AVATARS.map((a) => a.id)).size).toBe(AVATARS.length);
    expect(new Set(AVATARS.map((a) => a.emoji)).size).toBe(AVATARS.length);
  });

  it('looks an avatar up by id and throws on an unknown one', () => {
    expect(avatarById(AVATARS[0].id)).toBe(AVATARS[0]);
    expect(() => avatarById('nope')).toThrow(/unknown avatar/i);
  });

  it('suggests an unused face when one is free', () => {
    const taken = [AVATARS[0].id, AVATARS[1].id];
    expect(taken).not.toContain(nextAvatarFor(taken).id);
  });

  it('still suggests a face when every one is taken', () => {
    const all = AVATARS.map((a) => a.id);
    expect(AVATARS).toContain(nextAvatarFor(all));
  });
});

describe('normaliseName', () => {
  it('trims surrounding whitespace', () => {
    expect(normaliseName('  Ada  ')).toBe('Ada');
  });

  it('collapses runs of inner whitespace', () => {
    expect(normaliseName('Mary   Jane')).toBe('Mary Jane');
  });

  it('leaves an ordinary name alone', () => {
    expect(normaliseName('Sam')).toBe('Sam');
  });
});

describe('nameError', () => {
  it('accepts an ordinary name', () => {
    expect(nameError('Ada', [])).toBeNull();
  });

  it('rejects an empty or whitespace-only name', () => {
    expect(nameError('', [])).toMatch(/name/i);
    expect(nameError('   ', [])).toMatch(/name/i);
  });

  it('rejects a name longer than the limit', () => {
    expect(nameError('x'.repeat(MAX_NAME_LENGTH + 1), [])).toMatch(/shorter/i);
  });

  it('accepts a name exactly at the limit', () => {
    expect(nameError('x'.repeat(MAX_NAME_LENGTH), [])).toBeNull();
  });

  it('rejects a name already taken, ignoring case and spacing', () => {
    expect(nameError('ada', ['Ada'])).toMatch(/already/i);
    expect(nameError('  ADA ', ['Ada'])).toMatch(/already/i);
  });

  it('allows a name that merely contains another', () => {
    expect(nameError('Adam', ['Ada'])).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run apps/game/src/profiles/Profile.test.ts`
Expected: FAIL — `Failed to resolve import "./avatars"`.

- [ ] **Step 3: Write `apps/game/src/profiles/avatars.ts`**

```ts
export interface Avatar {
  id: string;
  /** Stand-in art, consistent with the creature placeholders. */
  emoji: string;
  /** Spoken and shown to the grown-up when choosing. */
  label: string;
}

/**
 * The fixed set of faces a child can be.
 *
 * Fixed rather than free choice, and faces rather than photographs: typing is
 * beyond most five-year-olds, and a camera roll is a privacy problem this
 * product does not need. The child identifies their profile by its face, so
 * the faces must be easy to tell apart at a glance — no two cats.
 */
export const AVATARS: readonly Avatar[] = [
  { id: 'fox', emoji: '🦊', label: 'Fox' },
  { id: 'frog', emoji: '🐸', label: 'Frog' },
  { id: 'owl', emoji: '🦉', label: 'Owl' },
  { id: 'cat', emoji: '🐱', label: 'Cat' },
  { id: 'bear', emoji: '🐻', label: 'Bear' },
  { id: 'panda', emoji: '🐼', label: 'Panda' },
  { id: 'koala', emoji: '🐨', label: 'Koala' },
  { id: 'lion', emoji: '🦁', label: 'Lion' },
  { id: 'penguin', emoji: '🐧', label: 'Penguin' },
  { id: 'octopus', emoji: '🐙', label: 'Octopus' },
  { id: 'unicorn', emoji: '🦄', label: 'Unicorn' },
  { id: 'dragon', emoji: '🐲', label: 'Dragon' },
];

export function avatarById(id: string): Avatar {
  const found = AVATARS.find((a) => a.id === id);
  if (!found) throw new Error(`Unknown avatar: ${id}`);
  return found;
}

/** The first face nobody has taken, or the first of all if they are all used. */
export function nextAvatarFor(takenIds: readonly string[]): Avatar {
  return AVATARS.find((a) => !takenIds.includes(a.id)) ?? AVATARS[0];
}
```

- [ ] **Step 4: Write `apps/game/src/profiles/Profile.ts`**

```ts
export interface Profile {
  id: string;
  /** Typed once by a grown-up. The child never types anything. */
  name: string;
  avatarId: string;
  createdAt: number;
  /** Local date string (YYYY-MM-DD) of the last quest finished. */
  lastPlayedOn: string | null;
}

export const MAX_NAME_LENGTH = 20;

/** Trims and collapses inner whitespace. Does not change case. */
export function normaliseName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/**
 * Why a name cannot be used, or null if it can.
 *
 * Duplicate detection ignores case and spacing, because two profiles both
 * showing "Ada" are indistinguishable to a child choosing by name — and the
 * face is what they actually read, so a near-duplicate is worse here than in
 * an adult product.
 */
export function nameError(raw: string, existingNames: readonly string[]): string | null {
  const name = normaliseName(raw);
  if (name.length === 0) return 'Please type a name.';
  if (name.length > MAX_NAME_LENGTH) return `Please use a shorter name (${MAX_NAME_LENGTH} letters or fewer).`;

  const taken = existingNames.some((existing) => normaliseName(existing).toLowerCase() === name.toLowerCase());
  if (taken) return `There is already someone called ${name}.`;

  return null;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run apps/game/src/profiles/Profile.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/game/src/profiles/Profile.ts apps/game/src/profiles/avatars.ts apps/game/src/profiles/Profile.test.ts
git commit -m "feat(game): add profile type, avatar set and name validation"
```

---

## Task 2: ProfileRepo

**Files:**
- Create: `apps/game/src/profiles/ProfileRepo.ts`
- Create: `apps/game/src/profiles/MemoryProfileRepo.ts`
- Create: `apps/game/src/profiles/AsyncStorageProfileRepo.ts`
- Create: `apps/game/src/profiles/profileRepoContract.ts`
- Test: `apps/game/src/profiles/MemoryProfileRepo.test.ts`
- Test: `apps/game/src/profiles/AsyncStorageProfileRepo.test.ts`

Follow the shape of the existing `apps/game/src/data/progressRepoContract.ts` — one suite, run against both implementations, so the in-memory version used by tests cannot drift from the device one.

- [ ] **Step 1: Read the existing contract suite for its shape**

Run: `sed -n '1,60p' "apps/game/src/data/progressRepoContract.ts"`

You are copying the pattern, not the content.

- [ ] **Step 2: Write the contract suite**

Create `apps/game/src/profiles/profileRepoContract.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { AVATARS } from './avatars';
import type { ProfileRepo } from './ProfileRepo';

/**
 * The behaviour every ProfileRepo must have, run against each implementation.
 *
 * One suite rather than two, so the in-memory repo the tests use cannot drift
 * away from the AsyncStorage one a child actually relies on.
 */
export function profileRepoContract(name: string, make: () => ProfileRepo): void {
  describe(name, () => {
    it('starts with no profiles and nobody selected', async () => {
      const repo = make();
      expect(await repo.list()).toEqual([]);
      expect(await repo.selectedId()).toBeNull();
    });

    it('creates a profile and returns it with an id', async () => {
      const repo = make();
      const created = await repo.create({ name: 'Ada', avatarId: AVATARS[0].id, now: 1000 });
      expect(created.name).toBe('Ada');
      expect(created.avatarId).toBe(AVATARS[0].id);
      expect(created.createdAt).toBe(1000);
      expect(created.lastPlayedOn).toBeNull();
      expect(created.id.length).toBeGreaterThan(0);
      expect(await repo.list()).toEqual([created]);
    });

    it('gives every profile a distinct id', async () => {
      const repo = make();
      const a = await repo.create({ name: 'Ada', avatarId: AVATARS[0].id, now: 1 });
      const b = await repo.create({ name: 'Bo', avatarId: AVATARS[1].id, now: 1 });
      expect(a.id).not.toBe(b.id);
    });

    it('normalises the name on create', async () => {
      const repo = make();
      const created = await repo.create({ name: '  Mary   Jane ', avatarId: AVATARS[0].id, now: 1 });
      expect(created.name).toBe('Mary Jane');
    });

    it('refuses a duplicate name', async () => {
      const repo = make();
      await repo.create({ name: 'Ada', avatarId: AVATARS[0].id, now: 1 });
      await expect(repo.create({ name: ' ada ', avatarId: AVATARS[1].id, now: 2 })).rejects.toThrow(/already/i);
    });

    it('refuses an empty name', async () => {
      const repo = make();
      await expect(repo.create({ name: '   ', avatarId: AVATARS[0].id, now: 1 })).rejects.toThrow(/name/i);
    });

    it('refuses an unknown avatar', async () => {
      const repo = make();
      await expect(repo.create({ name: 'Ada', avatarId: 'nope', now: 1 })).rejects.toThrow(/avatar/i);
    });

    it('lists profiles oldest first, so the order a child sees never shuffles', async () => {
      const repo = make();
      const a = await repo.create({ name: 'Ada', avatarId: AVATARS[0].id, now: 100 });
      const b = await repo.create({ name: 'Bo', avatarId: AVATARS[1].id, now: 50 });
      expect((await repo.list()).map((p) => p.id)).toEqual([b.id, a.id]);
    });

    it('selects a profile and remembers it', async () => {
      const repo = make();
      const created = await repo.create({ name: 'Ada', avatarId: AVATARS[0].id, now: 1 });
      await repo.select(created.id);
      expect(await repo.selectedId()).toBe(created.id);
    });

    it('refuses to select a profile that does not exist', async () => {
      const repo = make();
      await expect(repo.select('nobody')).rejects.toThrow(/unknown profile/i);
    });

    it('clears the selection', async () => {
      const repo = make();
      const created = await repo.create({ name: 'Ada', avatarId: AVATARS[0].id, now: 1 });
      await repo.select(created.id);
      await repo.select(null);
      expect(await repo.selectedId()).toBeNull();
    });

    it('removes a profile', async () => {
      const repo = make();
      const created = await repo.create({ name: 'Ada', avatarId: AVATARS[0].id, now: 1 });
      await repo.remove(created.id);
      expect(await repo.list()).toEqual([]);
    });

    it('clears the selection when the selected profile is removed', async () => {
      const repo = make();
      const created = await repo.create({ name: 'Ada', avatarId: AVATARS[0].id, now: 1 });
      await repo.select(created.id);
      await repo.remove(created.id);
      expect(await repo.selectedId()).toBeNull();
    });

    it('leaves the selection alone when a different profile is removed', async () => {
      const repo = make();
      const keep = await repo.create({ name: 'Ada', avatarId: AVATARS[0].id, now: 1 });
      const drop = await repo.create({ name: 'Bo', avatarId: AVATARS[1].id, now: 2 });
      await repo.select(keep.id);
      await repo.remove(drop.id);
      expect(await repo.selectedId()).toBe(keep.id);
    });

    it('ignores removing a profile that is not there', async () => {
      const repo = make();
      await expect(repo.remove('nobody')).resolves.toBeUndefined();
    });

    it('records the day a profile last played', async () => {
      const repo = make();
      const created = await repo.create({ name: 'Ada', avatarId: AVATARS[0].id, now: 1 });
      await repo.markPlayed(created.id, '2026-10-10');
      const [loaded] = await repo.list();
      expect(loaded.lastPlayedOn).toBe('2026-10-10');
    });

    it('does not let a caller mutate stored profiles through the list it gets', async () => {
      const repo = make();
      await repo.create({ name: 'Ada', avatarId: AVATARS[0].id, now: 1 });
      const list = await repo.list();
      list[0].name = 'Tampered';
      expect((await repo.list())[0].name).toBe('Ada');
    });
  });
}
```

- [ ] **Step 3: Run it to verify it fails**

Create the two test files that use it:

`apps/game/src/profiles/MemoryProfileRepo.test.ts`:

```ts
import { MemoryProfileRepo } from './MemoryProfileRepo';
import { profileRepoContract } from './profileRepoContract';

profileRepoContract('MemoryProfileRepo', () => new MemoryProfileRepo());
```

`apps/game/src/profiles/AsyncStorageProfileRepo.test.ts`:

```ts
import { beforeEach } from 'vitest';
import { AsyncStorageProfileRepo } from './AsyncStorageProfileRepo';
import { profileRepoContract } from './profileRepoContract';

// Mirror however apps/game/src/data/AsyncStorageProgressRepo.test.ts fakes
// AsyncStorage — read that file and use the same approach, so there is one
// way of faking storage in this codebase rather than two.
```

Run: `sed -n '1,30p' "apps/game/src/data/AsyncStorageProgressRepo.test.ts"` and copy its storage-faking approach into the file above.

Run: `npx vitest run apps/game/src/profiles`
Expected: FAIL — `Failed to resolve import "./MemoryProfileRepo"`.

- [ ] **Step 4: Write `apps/game/src/profiles/ProfileRepo.ts`**

```ts
import type { Profile } from './Profile';

export interface CreateProfileArgs {
  name: string;
  avatarId: string;
  /** Injected, never read from the clock — the repo stays testable. */
  now: number;
}

/**
 * Who is playing, and who is playing right now.
 *
 * Separate from ProgressRepo because the two have different lifetimes and
 * different owners: progress belongs to one child, this list belongs to the
 * household. Plan 3 swaps both for Supabase behind these same interfaces.
 */
export interface ProfileRepo {
  /** Oldest first, so the row of faces a child learns never reorders itself. */
  list(): Promise<Profile[]>;
  create(args: CreateProfileArgs): Promise<Profile>;
  remove(id: string): Promise<void>;
  selectedId(): Promise<string | null>;
  select(id: string | null): Promise<void>;
  /** `date` is a local YYYY-MM-DD string. See src/progress/streaks.ts. */
  markPlayed(id: string, date: string): Promise<void>;
}
```

- [ ] **Step 5: Write `apps/game/src/profiles/MemoryProfileRepo.ts`**

```ts
import { avatarById } from './avatars';
import { nameError, normaliseName } from './Profile';
import type { Profile } from './Profile';
import type { CreateProfileArgs, ProfileRepo } from './ProfileRepo';

/** In-memory ProfileRepo for tests and for development. */
export class MemoryProfileRepo implements ProfileRepo {
  private profiles: Profile[] = [];

  private selected: string | null = null;

  private counter = 0;

  async list(): Promise<Profile[]> {
    // Copied on the way out: a caller must not be able to edit stored state
    // by mutating what they were handed.
    return this.profiles
      .slice()
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((p) => ({ ...p }));
  }

  async create(args: CreateProfileArgs): Promise<Profile> {
    const problem = nameError(args.name, this.profiles.map((p) => p.name));
    if (problem) throw new Error(problem);
    avatarById(args.avatarId); // throws on an unknown avatar

    this.counter += 1;
    const profile: Profile = {
      id: `p${this.counter}-${args.now}`,
      name: normaliseName(args.name),
      avatarId: args.avatarId,
      createdAt: args.now,
      lastPlayedOn: null,
    };
    this.profiles.push(profile);
    return { ...profile };
  }

  async remove(id: string): Promise<void> {
    this.profiles = this.profiles.filter((p) => p.id !== id);
    if (this.selected === id) this.selected = null;
  }

  async selectedId(): Promise<string | null> {
    return this.selected;
  }

  async select(id: string | null): Promise<void> {
    if (id !== null && !this.profiles.some((p) => p.id === id)) {
      throw new Error(`Unknown profile: ${id}`);
    }
    this.selected = id;
  }

  async markPlayed(id: string, date: string): Promise<void> {
    const profile = this.profiles.find((p) => p.id === id);
    if (profile) profile.lastPlayedOn = date;
  }
}
```

- [ ] **Step 6: Write `apps/game/src/profiles/AsyncStorageProfileRepo.ts`**

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { avatarById } from './avatars';
import { nameError, normaliseName } from './Profile';
import type { Profile } from './Profile';
import type { CreateProfileArgs, ProfileRepo } from './ProfileRepo';

const PROFILES_KEY = 'soundlings/profiles';
const SELECTED_KEY = 'soundlings/selectedProfile';

/**
 * Device-backed ProfileRepo.
 *
 * Writes are serialised through a promise chain for the same reason
 * AsyncStorageProgressRepo serialises: two overlapping read-modify-writes
 * silently lose one of them, and losing a profile loses a child's whole
 * history.
 */
export class AsyncStorageProfileRepo implements ProfileRepo {
  private queue: Promise<unknown> = Promise.resolve();

  private serialise<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work, work);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async list(): Promise<Profile[]> {
    const stored = await this.readProfiles();
    return stored.slice().sort((a, b) => a.createdAt - b.createdAt);
  }

  create(args: CreateProfileArgs): Promise<Profile> {
    return this.serialise(async () => {
      const profiles = await this.readProfiles();
      const problem = nameError(args.name, profiles.map((p) => p.name));
      if (problem) throw new Error(problem);
      avatarById(args.avatarId);

      const profile: Profile = {
        id: `${args.now.toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`,
        name: normaliseName(args.name),
        avatarId: args.avatarId,
        createdAt: args.now,
        lastPlayedOn: null,
      };
      await this.writeProfiles([...profiles, profile]);
      return { ...profile };
    });
  }

  remove(id: string): Promise<void> {
    return this.serialise(async () => {
      const profiles = await this.readProfiles();
      await this.writeProfiles(profiles.filter((p) => p.id !== id));
      if ((await this.selectedId()) === id) await this.select(null);
    });
  }

  async selectedId(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(SELECTED_KEY);
    } catch {
      return null;
    }
  }

  async select(id: string | null): Promise<void> {
    if (id !== null) {
      const profiles = await this.readProfiles();
      if (!profiles.some((p) => p.id === id)) throw new Error(`Unknown profile: ${id}`);
    }
    try {
      if (id === null) await AsyncStorage.removeItem(SELECTED_KEY);
      else await AsyncStorage.setItem(SELECTED_KEY, id);
    } catch {
      // A failed write costs the remembered selection, not the profile.
    }
  }

  markPlayed(id: string, date: string): Promise<void> {
    return this.serialise(async () => {
      const profiles = await this.readProfiles();
      await this.writeProfiles(profiles.map((p) => (p.id === id ? { ...p, lastPlayedOn: date } : p)));
    });
  }

  private async readProfiles(): Promise<Profile[]> {
    try {
      const raw = await AsyncStorage.getItem(PROFILES_KEY);
      if (raw === null) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isProfile);
    } catch {
      return [];
    }
  }

  private async writeProfiles(profiles: Profile[]): Promise<void> {
    await AsyncStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  }
}

function isProfile(value: unknown): value is Profile {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Partial<Profile>;
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    typeof p.avatarId === 'string' &&
    typeof p.createdAt === 'number' &&
    (p.lastPlayedOn === null || typeof p.lastPlayedOn === 'string')
  );
}
```

Note `create` does not catch write failures: a profile that silently fails to save would leave a child playing into a void. Let it throw so the picker can say so.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run apps/game/src/profiles`
Expected: PASS — 17 contract tests × 2 implementations, plus the 15 from Task 1.

- [ ] **Step 8: Commit**

```bash
git add apps/game/src/profiles
git commit -m "feat(game): add profile repository with in-memory and device implementations"
```

---

## Task 3: Streaks, collection and trophies — the pure views

**Files:**
- Create: `apps/game/src/progress/streaks.ts`
- Create: `apps/game/src/progress/collection.ts`
- Create: `apps/game/src/progress/trophies.ts`
- Test: `apps/game/src/progress/streaks.test.ts`
- Test: `apps/game/src/progress/collection.test.ts`

All three are pure functions over data the repos already hold. Keeping them out of the screens is what makes them testable — the screens become thin.

- [ ] **Step 1: Write the failing streak test**

Create `apps/game/src/progress/streaks.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { localDateString, streakFrom } from './streaks';

describe('localDateString', () => {
  it('formats as YYYY-MM-DD in local time', () => {
    // Midday local on 10 Oct 2026, whatever the timezone.
    const noon = new Date(2026, 9, 10, 12, 0, 0);
    expect(localDateString(noon.getTime())).toBe('2026-10-10');
  });

  it('pads single-digit months and days', () => {
    const early = new Date(2026, 0, 5, 9, 0, 0);
    expect(localDateString(early.getTime())).toBe('2026-01-05');
  });

  it('uses local time, not UTC, so a late-evening session is still today', () => {
    // 11pm local. In several timezones this is already tomorrow in UTC, and a
    // child told their streak broke because of that would be right to object.
    const lateEvening = new Date(2026, 9, 10, 23, 0, 0);
    expect(localDateString(lateEvening.getTime())).toBe('2026-10-10');
  });
});

describe('streakFrom', () => {
  it('is zero when the child has never played', () => {
    expect(streakFrom(null, '2026-10-10')).toBe(0);
  });

  it('is one when they played today for the first time', () => {
    expect(streakFrom('2026-10-10', '2026-10-10')).toBe(1);
  });

  it('counts yesterday as still going', () => {
    expect(streakFrom('2026-10-09', '2026-10-10')).toBe(1);
  });

  it('is broken by a missed day', () => {
    expect(streakFrom('2026-10-08', '2026-10-10')).toBe(0);
  });

  it('counts calendar days, not 24-hour periods', () => {
    // 7pm Monday then 8am Tuesday is two days running. Telling a child
    // otherwise would be both wrong and unkind.
    expect(streakFrom('2026-10-12', '2026-10-13')).toBe(1);
  });

  it('handles a month boundary', () => {
    expect(streakFrom('2026-10-31', '2026-11-01')).toBe(1);
  });

  it('handles a year boundary', () => {
    expect(streakFrom('2026-12-31', '2027-01-01')).toBe(1);
  });

  it('handles a leap day', () => {
    expect(streakFrom('2028-02-29', '2028-03-01')).toBe(1);
  });

  it('treats a future stored date as today, not as a broken streak', () => {
    // Clock changes and timezone travel happen. Punishing a child for it is
    // the wrong call, so the benefit of the doubt goes to them.
    expect(streakFrom('2026-10-11', '2026-10-10')).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run apps/game/src/progress/streaks.test.ts`
Expected: FAIL — `Failed to resolve import "./streaks"`.

- [ ] **Step 3: Write `apps/game/src/progress/streaks.ts`**

```ts
/**
 * Local calendar date as YYYY-MM-DD.
 *
 * Local, not UTC, and a date string rather than a timestamp. A streak is about
 * days as a child experiences them: playing at 11pm and again the next morning
 * is two days running, and in several timezones a UTC-based calculation would
 * disagree. Storing only the local date also means a timezone change cannot
 * retroactively rewrite history.
 */
export function localDateString(at: number): string {
  const d = new Date(at);
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/**
 * Whether a run of consecutive days is still alive, as 1 or 0.
 *
 * This answers "does today continue the run?", not "how long is it?" — the
 * length itself is counted in trophies.ts from the quest history. A future
 * stored date (a clock change, a flight) counts as alive: the benefit of the
 * doubt goes to the child.
 */
export function streakFrom(lastPlayedOn: string | null, today: string): 0 | 1 {
  if (lastPlayedOn === null) return 0;
  if (lastPlayedOn >= today) return 1;
  return daysBetween(lastPlayedOn, today) <= 1 ? 1 : 0;
}

/** Whole days between two YYYY-MM-DD strings, via UTC midnights. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}
```

- [ ] **Step 4: Write the failing collection test**

Create `apps/game/src/progress/collection.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CREATURE_LIST } from '@soundlings/curriculum';
import { collectionFor } from './collection';

describe('collectionFor', () => {
  it('shows every Level 1 creature, hatched or not', () => {
    const entries = collectionFor([]);
    expect(entries.length).toBe(CREATURE_LIST.length);
  });

  it('marks nothing hatched for a new child', () => {
    expect(collectionFor([]).every((e) => !e.hatched)).toBe(true);
  });

  it('marks an earned creature hatched', () => {
    const entries = collectionFor(['momo']);
    const momo = entries.find((e) => e.creature.id === 'momo');
    expect(momo?.hatched).toBe(true);
  });

  it('keeps teaching order, so the collection fills left to right', () => {
    const ids = collectionFor([]).map((e) => e.creature.graphemeId);
    expect(ids).toEqual(['s', 'a', 't', 'p', 'i', 'm', 'f']);
  });

  it('ignores an unknown creature id rather than throwing', () => {
    // Stored data outlives code. A creature removed in a later version must
    // not stop a child seeing their island.
    expect(() => collectionFor(['nobody'])).not.toThrow();
    expect(collectionFor(['nobody']).every((e) => !e.hatched)).toBe(true);
  });

  it('counts how many are hatched', () => {
    const entries = collectionFor(['momo', 'sisi']);
    expect(entries.filter((e) => e.hatched).length).toBe(2);
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `npx vitest run apps/game/src/progress/collection.test.ts`
Expected: FAIL — `Failed to resolve import "./collection"`.

- [ ] **Step 6: Write `apps/game/src/progress/collection.ts`**

```ts
import { CREATURE_LIST, GRAPHEME_LIST } from '@soundlings/curriculum';
import type { Creature } from '@soundlings/curriculum';

export interface CollectionEntry {
  creature: Creature;
  hatched: boolean;
}

/**
 * The island's creature collection: every creature in teaching order, each
 * either hatched or still an egg.
 *
 * Shows unhatched creatures rather than hiding them, because the gaps are the
 * progress map — a child can see there are seven friends and which ones they
 * have yet to meet. An unknown stored id is ignored rather than thrown on:
 * saved data outlives code, and a creature renamed in a later version must not
 * stop a child seeing their island.
 */
export function collectionFor(earnedIds: readonly string[]): CollectionEntry[] {
  const earned = new Set(earnedIds);
  const order = new Map(GRAPHEME_LIST.map((g, index) => [g.id, index]));

  return CREATURE_LIST.slice()
    .sort((a, b) => (order.get(a.graphemeId) ?? 0) - (order.get(b.graphemeId) ?? 0))
    .map((creature) => ({ creature, hatched: earned.has(creature.id) }));
}
```

- [ ] **Step 7: Write `apps/game/src/progress/trophies.ts`**

No separate test file: every function here is covered by the screen test in Task 7 and by the types. Keep it small enough that this stays true.

```ts
import { levelProgress } from '@soundlings/engine';
import type { MasteryMap } from '@soundlings/engine';
import type { HighScore } from '../data/ProgressRepo';
import { daysBetween } from './streaks';

export interface Trophies {
  soundsLearned: number;
  soundsTotal: number;
  wordsRead: number;
  wordsSpelled: number;
  bestStars: number;
  cleanRuns: number;
  longestStreak: number;
}

/**
 * The numbers the trophy room shows.
 *
 * Deliberately all achievements and no failures: no error count, no accuracy
 * percentage, nothing a child can read as a mark against them. The parent area
 * in Plan 3 is where the honest diagnostic picture lives, because that is a
 * conversation between adults.
 */
export function trophiesFrom(args: {
  level: number;
  mastery: MasteryMap;
  highScores: readonly HighScore[];
  playedDates: readonly string[];
  now: number;
}): Trophies {
  const progress = levelProgress(args.level, args.mastery, args.now);

  return {
    soundsLearned: progress.graphemesMastered,
    soundsTotal: progress.graphemesRequired,
    wordsRead: progress.blendWordsMastered,
    wordsSpelled: progress.segmentWordsMastered,
    bestStars: args.highScores.reduce((best, s) => Math.max(best, s.stars), 0),
    cleanRuns: args.highScores.filter((s) => s.cleanRun).length,
    longestStreak: longestRun(args.playedDates),
  };
}

/** The longest run of consecutive calendar days in a set of dates. */
export function longestRun(dates: readonly string[]): number {
  const unique = [...new Set(dates)].sort();
  if (unique.length === 0) return 0;

  let best = 1;
  let current = 1;
  for (let i = 1; i < unique.length; i += 1) {
    current = daysBetween(unique[i - 1], unique[i]) === 1 ? current + 1 : 1;
    if (current > best) best = current;
  }
  return best;
}
```

- [ ] **Step 8: Run the tests**

Run: `npx vitest run apps/game/src/progress`
Expected: PASS — 9 streak tests, 6 collection tests.

- [ ] **Step 9: Commit**

```bash
git add apps/game/src/progress
git commit -m "feat(game): add pure streak, collection and trophy calculations"
```

---
## Task 4: Latch level completion, and remember the days played

**Files:**
- Modify: `apps/game/src/data/ProgressRepo.ts`
- Modify: `apps/game/src/data/MemoryProgressRepo.ts`
- Modify: `apps/game/src/data/AsyncStorageProgressRepo.ts`
- Modify: `apps/game/src/data/progressRepoContract.ts`

Spec §5.7 requires completion to latch. `levelProgress` is a live predicate: a finished level reads as unfinished once strength decays, and §5.3 condition 6 un-masters a target on a single wrong answer. **A child must never lose a level they have completed.**

Only the badge latches. The live calculation is untouched, because the island home needs to show what a child can do *now*, not what they could once do.

- [ ] **Step 1: Add the contract tests first**

Append to the `describe` block in `apps/game/src/data/progressRepoContract.ts`:

```ts
    it('has no completed levels for a new child', async () => {
      const repo = make();
      expect(await repo.loadCompletions('kid')).toEqual({});
    });

    it('latches a level completion with the time it happened', async () => {
      const repo = make();
      await repo.markLevelComplete('kid', 1, 1000);
      expect(await repo.loadCompletions('kid')).toEqual({ 1: 1000 });
    });

    it('keeps the FIRST completion time, not the most recent', async () => {
      // The badge is "you did this", not "you did this most recently".
      const repo = make();
      await repo.markLevelComplete('kid', 1, 1000);
      await repo.markLevelComplete('kid', 1, 5000);
      expect(await repo.loadCompletions('kid')).toEqual({ 1: 1000 });
    });

    it('never un-completes a level', async () => {
      // This is the whole point. Strength decays and one wrong answer
      // un-masters a target, so the live calculation will say "incomplete"
      // again. The badge must not follow it.
      const repo = make();
      await repo.markLevelComplete('kid', 1, 1000);
      expect((await repo.loadCompletions('kid'))[1]).toBe(1000);
    });

    it('keeps completions per profile', async () => {
      const repo = make();
      await repo.markLevelComplete('a', 1, 1000);
      expect(await repo.loadCompletions('b')).toEqual({});
    });

    it('records each day played once', async () => {
      const repo = make();
      await repo.markPlayedOn('kid', '2026-10-10');
      await repo.markPlayedOn('kid', '2026-10-10');
      await repo.markPlayedOn('kid', '2026-10-11');
      expect(await repo.loadPlayedDates('kid')).toEqual(['2026-10-10', '2026-10-11']);
    });

    it('returns played dates in order whatever order they arrive in', async () => {
      const repo = make();
      await repo.markPlayedOn('kid', '2026-10-11');
      await repo.markPlayedOn('kid', '2026-10-09');
      expect(await repo.loadPlayedDates('kid')).toEqual(['2026-10-09', '2026-10-11']);
    });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run apps/game/src/data`
Expected: FAIL — `repo.loadCompletions is not a function`, for both implementations.

- [ ] **Step 3: Extend the interface in `ProgressRepo.ts`**

Add to the `ProgressRepo` interface:

```ts
  /** Level number → epoch ms of the FIRST time it was completed. */
  loadCompletions(profileId: string): Promise<Record<number, number>>;
  /**
   * Latches a level as complete. Idempotent, and keeps the earliest time.
   *
   * Required by spec §5.7: `levelProgress` is evaluated at `now`, so a level
   * finished yesterday reads as unfinished today once strength decays, and a
   * single wrong answer un-masters a target. The live calculation is correct
   * and stays as it is — it answers "what can they do right now?", which the
   * island home and the session builder both need. This is the badge, and a
   * child must never lose a level they have finished.
   */
  markLevelComplete(profileId: string, level: number, at: number): Promise<void>;

  /** Local YYYY-MM-DD dates on which a quest was finished, ascending. */
  loadPlayedDates(profileId: string): Promise<string[]>;
  markPlayedOn(profileId: string, date: string): Promise<void>;
```

- [ ] **Step 4: Implement in `MemoryProgressRepo.ts`**

Add to `ProfileState`:

```ts
  completions: Record<number, number>;
  playedDates: string[];
```

Initialise both in the `state()` factory (`completions: {}`, `playedDates: []`), then add:

```ts
  async loadCompletions(profileId: string): Promise<Record<number, number>> {
    return { ...this.state(profileId).completions };
  }

  async markLevelComplete(profileId: string, level: number, at: number): Promise<void> {
    const completions = this.state(profileId).completions;
    // First wins: the badge records when they did it, not when we last noticed.
    if (completions[level] === undefined) completions[level] = at;
  }

  async loadPlayedDates(profileId: string): Promise<string[]> {
    return [...this.state(profileId).playedDates];
  }

  async markPlayedOn(profileId: string, date: string): Promise<void> {
    const state = this.state(profileId);
    if (!state.playedDates.includes(date)) {
      state.playedDates.push(date);
      state.playedDates.sort();
    }
  }
```

- [ ] **Step 5: Implement in `AsyncStorageProgressRepo.ts`**

Follow the existing read/write and serialisation pattern in that file exactly — both of these are read-modify-write and must go through the same queue, or two quests finishing close together will lose one.

```ts
  async loadCompletions(profileId: string): Promise<Record<number, number>> {
    return (await this.read<Record<number, number>>(this.key(profileId, 'completions'))) ?? {};
  }

  markLevelComplete(profileId: string, level: number, at: number): Promise<void> {
    return this.serialise(async () => {
      const completions = await this.loadCompletions(profileId);
      if (completions[level] !== undefined) return;
      await this.write(this.key(profileId, 'completions'), { ...completions, [level]: at });
    });
  }

  async loadPlayedDates(profileId: string): Promise<string[]> {
    return (await this.read<string[]>(this.key(profileId, 'playedDates'))) ?? [];
  }

  markPlayedOn(profileId: string, date: string): Promise<void> {
    return this.serialise(async () => {
      const dates = await this.loadPlayedDates(profileId);
      if (dates.includes(date)) return;
      await this.write(this.key(profileId, 'playedDates'), [...dates, date].sort());
    });
  }
```

If the existing file's `serialise` helper is named differently, use whatever is there rather than adding a second mechanism.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run apps/game/src/data`
Expected: PASS — the 7 new contract tests on both implementations.

- [ ] **Step 7: Commit**

```bash
git add apps/game/src/data
git commit -m "feat(game): latch level completion and record days played"
```

---

## Task 4a: Deleting a profile must delete that child's progress

**Added after Task 4's review.** `ProfileRepo.remove` deletes the profile row but leaves every `soundlings/<id>/…` key on the device — mastery, the attempt log, confusions, sessions, high scores, completions, played dates. That is a child's learning record, orphaned and unreachable.

It is also a promise broken: the delete dialog in Task 6 says *"Everything they have learned will be lost."* That must be true, not approximately true.

- [ ] **Step 1: Add the contract test**

Append to `apps/game/src/data/progressRepoContract.ts`:

```ts
    it('clears every trace of one profile', async () => {
      const repo = make();
      await repo.saveMastery('kid', { 's::SOUND_ID': emptyRecord('s', 'SOUND_ID', DEFAULT_CONFIG) });
      await repo.appendAttempt('kid', {
        sessionId: 's1', targetId: 's', skill: 'SOUND_ID', taskTypeId: 'sound-hunt',
        correct: true, scaffolded: false, latencyMs: 900, weight: 1, at: 1,
      });
      await repo.saveConfusions('kid', { 'm>a': 1 });
      await repo.saveHighScore('kid', { level: 1, stars: 3, cleanRun: true, at: 1 });
      await repo.markLevelComplete('kid', 1, 1);
      await repo.markPlayedOn('kid', '2026-10-10');
      await repo.saveActiveSession('kid', { sessionId: 's1', level: 1, plan: [], index: 0, stars: 0, startedAt: 1 });

      await repo.clear('kid');

      expect(await repo.loadMastery('kid')).toEqual({});
      expect(await repo.loadAttempts('kid')).toEqual([]);
      expect(await repo.loadConfusions('kid')).toEqual({});
      expect(await repo.loadHighScores('kid')).toEqual([]);
      expect(await repo.loadCompletions('kid')).toEqual({});
      expect(await repo.loadPlayedDates('kid')).toEqual([]);
      expect(await repo.loadActiveSession('kid')).toBeNull();
    });

    it('leaves other profiles untouched when clearing one', async () => {
      const repo = make();
      await repo.saveConfusions('a', { 'm>a': 1 });
      await repo.saveConfusions('b', { 'm>a': 2 });
      await repo.clear('a');
      expect(await repo.loadConfusions('b')).toEqual({ 'm>a': 2 });
    });
```

- [ ] **Step 2: Run it, confirm it fails**

Expected: `repo.clear is not a function`, on both implementations.

- [ ] **Step 3: Add `clear(profileId): Promise<void>` to the interface and both implementations**

The AsyncStorage version removes every key under that profile's prefix. Use `AsyncStorage.multiRemove` with the explicit key list rather than `getAllKeys` and a prefix filter — a prefix match would also catch a profile whose id happens to begin with this one's, and deleting the wrong child's progress is unrecoverable.

Go through the existing serialisation queue, like every other write in that file.

- [ ] **Step 4: Call it from profile deletion**

Whichever component performs the delete (Task 6) must clear progress **before** removing the profile row. If the order is reversed and the clear fails, the data is orphaned with no id left to find it by.

- [ ] **Step 5: Commit**

```bash
git add apps/game/src/data
git commit -m "feat(game): delete a child's progress when their profile is deleted"
```

---

## Task 5: The profile context

**Files:**
- Create: `apps/game/src/profiles/ProfileContext.tsx`
- Modify: `apps/game/app/_layout.tsx`

- [ ] **Step 1: Write `apps/game/src/profiles/ProfileContext.tsx`**

```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AsyncStorageProfileRepo } from './AsyncStorageProfileRepo';
import type { Profile } from './Profile';
import type { CreateProfileArgs, ProfileRepo } from './ProfileRepo';

interface ProfileState {
  ready: boolean;
  profiles: Profile[];
  selected: Profile | null;
  refresh: () => Promise<void>;
  create: (args: Omit<CreateProfileArgs, 'now'>) => Promise<Profile>;
  remove: (id: string) => Promise<void>;
  select: (id: string | null) => Promise<void>;
}

const ProfileCtx = createContext<ProfileState | null>(null);

export function ProfileProvider({ children, repo }: { children: ReactNode; repo?: ProfileRepo }) {
  const store = useMemo(() => repo ?? new AsyncStorageProfileRepo(), [repo]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    const [list, chosen] = await Promise.all([store.list(), store.selectedId()]);
    setProfiles(list);
    // A selection pointing at a deleted profile is treated as nobody, rather
    // than dropping a child into a quest belonging to a profile that is gone.
    setSelectedId(list.some((p) => p.id === chosen) ? chosen : null);
    setReady(true);
  }, [store]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<ProfileState>(
    () => ({
      ready,
      profiles,
      selected: profiles.find((p) => p.id === selectedId) ?? null,
      refresh,
      create: async (args) => {
        const created = await store.create({ ...args, now: Date.now() });
        await refresh();
        return created;
      },
      remove: async (id) => {
        await store.remove(id);
        await refresh();
      },
      select: async (id) => {
        await store.select(id);
        await refresh();
      },
    }),
    [ready, profiles, selectedId, refresh, store],
  );

  return <ProfileCtx.Provider value={value}>{children}</ProfileCtx.Provider>;
}

export function useProfile(): ProfileState {
  const ctx = useContext(ProfileCtx);
  if (ctx === null) throw new Error('useProfile must be used inside a ProfileProvider');
  return ctx;
}
```

- [ ] **Step 2: Wrap the app in `apps/game/app/_layout.tsx`**

Keep everything already there — the font loading and the `Stack` — and wrap the returned tree in `<ProfileProvider>`. Do not move the font gate: fonts must still load before anything renders, or the profile picker shows the wrong letterforms.

- [ ] **Step 3: Clear the old development profile, once**

Still in `_layout.tsx`, add a one-time cleanup on mount:

```tsx
// Plan 1 hard-coded a single `dev-profile` in quest.tsx. That data belongs to
// no real profile and there is no honest way to guess which child it is, so it
// is discarded rather than migrated. Safe to delete this block once no
// installed build predates profiles.
useEffect(() => {
  void (async () => {
    const keys = ['mastery', 'attempts', 'confusions', 'activeSession', 'highScores', 'completions', 'playedDates'];
    await Promise.all(
      keys.map((k) => AsyncStorage.removeItem(`soundlings/dev-profile/${k}`).catch(() => {})),
    );
  })();
}, []);
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/game && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/game/src/profiles/ProfileContext.tsx apps/game/app/_layout.tsx
git commit -m "feat(game): add profile context and discard the development profile"
```

---

## Task 6: The profile picker

**Files:**
- Rewrite: `apps/game/app/index.tsx`
- Create: `apps/game/src/profiles/AddProfileSheet.tsx`

This is the first screen a child sees. It must be obvious with no reading: a row of faces, tap yours.

- [ ] **Step 1: Rewrite `apps/game/app/index.tsx`**

Requirements, all of which matter:

- A row of large avatar tiles — at least `tokens.tap.tile`, since this is a primary child target. Name under each face.
- Tapping a face selects that profile and routes to `/island`.
- An "Add" tile at the end of the row opens the add sheet.
- When no profiles exist, the add sheet opens straight away: an empty screen with one small button is a dead end for a grown-up setting it up for the first time.
- Keep the placeholder-voice banner.
- While `ready` is false, render the same calm background with a spinner — never a flash of "no profiles" before loading finishes.
- Use `tokens.font.ui` for all text.

Deletion lives here, not on a separate screen, but behind a grown-up gate (Task 6 Step 2).

- [ ] **Step 2: Write `apps/game/src/profiles/AddProfileSheet.tsx`**

A modal with: a name field, the avatar row, Cancel and Add.

Two things it must do:

- **Show the error from `nameError`** under the field as the grown-up types, and disable Add while there is one. The repo also rejects duplicates, but a child watching their parent should not see a thrown error.
- **Gate destructive actions.** Deleting a profile asks "Delete <name>? Everything they have learned will be lost." and requires a **hold** of the confirm button for 2 seconds rather than a tap.

Why a hold rather than a PIN: the PIN belongs to the parent area in Plan 3, and two different gates would be worse than one. A two-second hold is beyond an idle five-year-old's patience and trivial for an adult who means it.

- [ ] **Step 3: Check it in a browser**

Run: `cd apps/game && npm run web`

Then look at `http://localhost:8081`:
- With no profiles, the add sheet opens on its own
- Add two profiles, confirm both appear with distinct faces
- A duplicate name shows the error and Add stays disabled
- Tapping a face routes to `/island`
- Deleting needs the hold, and a tap alone does nothing

**Report what you actually saw.** If you cannot drive a browser, say so plainly.

- [ ] **Step 4: Commit**

```bash
git add apps/game/app/index.tsx apps/game/src/profiles/AddProfileSheet.tsx
git commit -m "feat(game): add profile picker with gated creation and deletion"
```

---

## Task 7: The island home

**Files:**
- Create: `apps/game/app/island.tsx`

The island is the child's home screen and their progress map. The creature collection *is* the progress bar — there is no separate one.

- [ ] **Step 1: Write the screen**

It shows:

- **The creature collection** from `collectionFor(...)`, in teaching order. Hatched creatures show their emoji and name; unhatched show an egg. Seeing the gaps is the point: a child can tell there are seven friends and which they have yet to meet.
- **A big Play button**, at least `tokens.tap.primary`, routing to `/quest`.
- **Resume vs. new:** if `loadActiveSession` returns a session, the button says "Keep going" instead of "Play". Same route — the runner already resumes — but a child abandoned mid-quest should be told their place was kept.
- **A streak line** when `streakFrom(profile.lastPlayedOn, today)` is 1 and the longest run is 2 or more: "3 days in a row!". Never show a broken or zero streak — the island is not where a child is told what they have failed to do.
- **Small links** to `/levels` and `/trophies`, and a "Not you?" link back to the picker.
- The child's name and avatar in a corner, so they can see whose island it is.

Data: `useProfile()` for the child, `AsyncStorageProgressRepo` for mastery, completions and the active session. Derive creatures from `levelProgress(...).creaturesEarned`.

- [ ] **Step 2: Look at it**

With two profiles and some progress on one, check:
- the collection shows seven slots
- a hatched creature looks different from an egg at a glance
- Play says "Keep going" when a quest is in progress
- the other profile's island is empty

Report what you saw.

- [ ] **Step 3: Commit**

```bash
git add apps/game/app/island.tsx
git commit -m "feat(game): add island home with the creature collection as the progress map"
```

---

## Task 8: Level select and trophy room

**Files:**
- Create: `apps/game/app/levels.tsx`
- Create: `apps/game/app/trophies.tsx`

- [ ] **Step 1: Write `levels.tsx`**

One card per level in `LEVELS`. Each shows the level name, its creatures as a row of small faces, and its state:

- **Complete** — from `loadCompletions()`, not from the live calculation. A finished level stays finished.
- **In progress** — the live `levelProgress(...).fraction` as a bar.
- **Locked** — later levels, greyed, with no date or detail.

Tapping a started or completed level routes to `/quest`. Level 1 is the only playable one today; the card list must not assume that.

- [ ] **Step 2: Write `trophies.tsx`**

Render `trophiesFrom(...)` as large, readable tiles: sounds learned (`5 of 7`), words read, words spelled, best stars, perfect quests, longest streak.

**No failures anywhere on this screen.** No error count, no accuracy, nothing a child can read as a mark against them. The honest diagnostic picture is for the parent area in Plan 3, because that is a conversation between adults.

- [ ] **Step 3: Look at both, then commit**

```bash
git add apps/game/app/levels.tsx apps/game/app/trophies.tsx
git commit -m "feat(game): add level select and trophy room"
```

---

## Task 9: Wire the quest to the selected profile

**Files:**
- Modify: `apps/game/app/quest.tsx`
- Modify: `apps/game/app/results.tsx`

- [ ] **Step 1: Replace the hard-coded profile in `quest.tsx`**

Delete `const PROFILE_ID = 'dev-profile'` and take the id from `useProfile()`. If no profile is selected — a deep link, or storage cleared mid-quest — redirect to `/` rather than starting a quest nobody owns.

- [ ] **Step 2: Record the day and latch completion when a quest finishes**

Where the runner finishes a quest and writes the high score, also:

```ts
const today = localDateString(now());
await repo.markPlayedOn(profileId, today);
await profiles.markPlayedOn?.(profileId, today); // ProfileRepo.markPlayed
if (levelProgress(level, mastery, now()).complete) {
  await repo.markLevelComplete(profileId, level, now());
}
```

Use the real method names from the two repos. Completion is checked **after** the final outcome is recorded, or the last task of the level will not count toward it.

- [ ] **Step 3: Send results back to the island**

In `results.tsx`, Finish routes to `/island`, not `/`. A child who has finished a quest should land on their own island with a possibly-new creature on it, not back at "who's playing?".

- [ ] **Step 4: Play a whole quest**

Create a profile, play fourteen tasks, finish, and confirm:
- the results screen appears, then Finish lands on the island
- the streak line appears after the first finished quest
- a reload mid-quest resumes, and the island says "Keep going"
- a second profile's island is unaffected

Report what you saw.

- [ ] **Step 5: Run everything**

Run: `npm test`
Run: `cd apps/game && npx tsc --noEmit`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add apps/game/app/quest.tsx apps/game/app/results.tsx
git commit -m "feat(game): play as the selected profile and return to the island"
```

---

## Task 10: Review gate 2

**Files:**
- Modify: `docs/REVIEW-GATE.md`

- [ ] **Step 1: Update the gate**

Add a "What's new in Plan 2" section covering: profiles, the island, level select, trophies, latched completion and streaks. Update the walkthrough to start at the profile picker.

Keep every honest caveat already in that file — the voice is still a placeholder, nobody has heard it, no child has played it.

- [ ] **Step 2: Run the whole suite and record the number**

Run: `npm test`

- [ ] **Step 3: Commit**

```bash
git add docs/REVIEW-GATE.md
git commit -m "docs: update the review gate for the Plan 2 shell"
```

---

## Out of scope — Plan 3 and beyond

Do not build these:

1. Supabase schema, RLS, offline sync queue
2. PIN-gated parent area: per-sound heatmap, confusion pairs, "needs a hand" signal
3. Real voice pack
4. Illustrated pictures replacing emoji
5. Levels 2–6 content
6. A second mini-game per skill, which lifts the `masteryTaskTypes` cap (spec §5.3)
7. `SAY_IT` voice tasks
8. Branded `TargetId`, required before `TRICKY_READ` ships (spec §4.1a)
9. The win-back pacing lever (spec §5.7)
10. Corrupt-record quarantine in the persistence layer

## Self-review notes

**Spec coverage:** §7's screen tree minus the parent area (Tasks 6–8) · §7.2 save/resume, already built and now surfaced as "Keep going" (Task 7) · §5.7 completion latching (Task 4) · §6.2 creatures as the progress map (Tasks 3, 7).

**Deliberately deferred, and where:** the parent area and everything it needs → Plan 3 · `ProfileRepo` and `ProgressRepo` stay behind interfaces so that swap is contained.

**Known rough edges, flagged not hidden:**
- Tasks 6, 7 and 8 specify screens in prose rather than full code, unlike Plan 1's tasks. That is deliberate: layout is the part a human judges by looking, and the review depth note in the Plan 1 header applies. The *logic* behind them is fully specified and tested in Tasks 1–4.
- `trophies.ts` has no test file of its own; it is covered through the screen and kept small enough for that to hold. If it grows, give it one.
