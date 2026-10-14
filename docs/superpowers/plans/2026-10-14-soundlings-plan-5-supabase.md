# Soundlings Plan 5: Supabase and Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A child's progress survives a lost device and follows them across devices, and a parent can read the dashboard on their phone while the child plays on the iPad — without the game ever needing a network connection to work.

**Architecture:** Offline-first. The device remains the source of truth during play. Only the append-only attempt log, the profile list and the level-completion latch sync; mastery, streaks, high scores and creatures are **derived locally** from the log, as the spec always said they could be.

**Tech Stack:** Supabase (Postgres 17, project `vtifvggqsnwpbemghqkk`), `@supabase/supabase-js`, email magic-link auth.

**Spec:** `docs/superpowers/specs/2026-10-10-soundlings-phonics-game-design.md` §10

---

## The decision that shapes everything else

Spec §10.2 says `mastery_records` is a cache: *"it can be rebuilt from the attempt log if the mastery algorithm changes — which it will."* It already has, twice.

Take that seriously and the sync problem mostly disappears. **Sync the log; derive the rest.**

| Synced | Derived locally from the log |
|---|---|
| `child_profiles` | mastery records |
| `task_attempts` (append-only) | streaks and played dates |
| `level_completions` (the latch) | high scores and stars |
| | creatures unlocked |

Why this is better than syncing everything:

- **Conflicts become trivial.** An append-only log merges as a set union. Two devices that both played offline simply both contribute; nothing is lost and nothing has to win.
- **No derived data can drift from its source.** A synced `mastery_records` row written by an old app version against a newer algorithm would be silently wrong, and nothing would ever detect it.
- **The algorithm can keep changing.** It has twice already — the decay clock and the recency condition. Each change would otherwise have needed a migration of everyone's stored mastery.

Two exceptions, each for a reason:

- **`level_completions` is stored, not derived.** It is a latch: a child must never lose a level they finished (spec §5.7). Recomputing it from the log would require replaying completion at every point in history, and would resurrect the very decay problem the latch exists to defeat.
- **The active mid-quest session is deliberately NOT synced.** Two devices resuming the same half-finished quest is a conflict with no good resolution, and the feature nobody asked for. An interrupted quest resumes on the device it started on. Say so in a comment; this will look like an oversight otherwise.

---

## Security is the point of this plan, not a step in it

This stores children's learning records. Row-level security is the entire boundary between one family's data and another's, and a policy that looks right but leaks is **silent** — no error, no crash, just parent A able to read parent B's child.

Three rules:

1. **Every table gets RLS enabled and a policy before any data goes near it.** Not afterwards.
2. **The policies get tested adversarially**, from a second real account, trying to read and write the first account's rows. A test that only confirms the happy path proves nothing about a security boundary.
3. **The `service_role` key never enters the repo, and the repo is public.** That key bypasses RLS entirely. The publishable (anon) key is designed to ship in client bundles and is safe to commit; the service key is not, in any form, in any file, ever.

The spec's data-minimisation decision pays off here: a child's record holds a **first name and an avatar id**, nothing more. No birthday, no school, no photograph. Keep it that way — every field added is a field that can leak.

---

## File structure

### `supabase/migrations`
| File | Responsibility |
|---|---|
| `0001_schema.sql` | Tables, indexes, constraints |
| `0002_rls.sql` | RLS enabled and policies, as its own migration so the diff is readable |

### `packages/api` — the sync layer
| File | Responsibility |
|---|---|
| `src/client.ts` | Supabase client, configured from env |
| `src/auth.ts` | Sign in, sign out, current parent |
| `src/SupabaseProgressRepo.ts` | Pushes the log, pulls it back |
| `src/syncQueue.ts` | Pure: what to push, what to pull, what to do on failure |
| `src/rebuild.ts` | Pure: mastery, streaks, scores and creatures from a log |

### `apps/game`
| File | Responsibility |
|---|---|
| `app/signin.tsx` | Optional parent sign-in, reachable from the parent area |
| `src/data/SyncingProgressRepo.ts` | Wraps the local repo; queues, never blocks play |

---

## Task 1: Schema

**Files:**
- Create: `supabase/migrations/0001_schema.sql`

Apply it with the `apply_migration` tool against project `vtifvggqsnwpbemghqkk`, and keep the file in the repo so the schema is reviewable in a diff rather than only living in a cloud console.

- [ ] **Step 1: Write the migration**

```sql
-- One row per child. Owned by a parent via auth.users.
--
-- Deliberately minimal: a first name and an avatar id. No birthday, no school,
-- no photograph. Every field added here is a field that can leak, and this is
-- a five-year-old's record.
create table public.child_profiles (
  id            uuid primary key default gen_random_uuid(),
  parent_id     uuid not null references auth.users (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 20),
  avatar_id     text not null,
  created_at    timestamptz not null default now(),
  last_played_on date
);

create index child_profiles_parent_idx on public.child_profiles (parent_id);

-- The append-only attempt log. This is the ONLY source of truth that syncs;
-- mastery, streaks, high scores and creatures are all derived from it locally.
--
-- Append-only is what makes offline merging trivial: two devices that both
-- played offline simply both contribute, and nothing has to win.
create table public.task_attempts (
  id            uuid primary key,
  profile_id    uuid not null references public.child_profiles (id) on delete cascade,
  session_id    text not null,
  target_id     text not null,
  skill         text not null,
  task_type_id  text not null,
  correct       boolean not null,
  scaffolded    boolean not null,
  latency_ms    integer not null check (latency_ms >= 0),
  weight        real not null check (weight > 0 and weight <= 1),
  choice_count  integer check (choice_count is null or choice_count >= 2),
  chosen        text,
  at            bigint not null,
  created_at    timestamptz not null default now()
);

-- The client supplies `id`, so a replayed push cannot duplicate a row.
create index task_attempts_profile_at_idx on public.task_attempts (profile_id, at);

-- A latch, not a derivation. A child must never lose a level they finished,
-- and recomputing completion from the log would reintroduce exactly the decay
-- problem the latch exists to defeat. See spec section 5.7.
create table public.level_completions (
  profile_id    uuid not null references public.child_profiles (id) on delete cascade,
  level         integer not null,
  completed_at  bigint not null,
  primary key (profile_id, level)
);
```

Note there is no `mastery_records`, no `high_scores`, no `played_dates` and no `creatures_unlocked` table. All four are derived — see the header. If you find yourself wanting one, re-read that section before adding it.

- [ ] **Step 2: Apply it, then confirm**

Apply via `apply_migration`, then `list_tables` to confirm exactly three tables exist and no more.

- [ ] **Step 3: Commit the migration file**

```bash
git add supabase/migrations/0001_schema.sql
git commit -m "feat(api): add the Supabase schema"
```

---

## Task 2: Row-level security

**Files:**
- Create: `supabase/migrations/0002_rls.sql`

**This is the task that matters.** Everything else in this plan is plumbing.

- [ ] **Step 1: Write the policies**

```sql
-- A helper, so the child-table policies stay readable and consistent.
-- security definer because it reads child_profiles while deciding access to it.
create or replace function public.owns_profile(p_profile_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.child_profiles
    where id = p_profile_id and parent_id = auth.uid()
  );
$$;

alter table public.child_profiles  enable row level security;
alter table public.task_attempts    enable row level security;
alter table public.level_completions enable row level security;

-- A parent sees only their own children.
create policy child_profiles_select on public.child_profiles
  for select using (parent_id = auth.uid());

create policy child_profiles_insert on public.child_profiles
  for insert with check (parent_id = auth.uid());

create policy child_profiles_update on public.child_profiles
  for update using (parent_id = auth.uid()) with check (parent_id = auth.uid());

create policy child_profiles_delete on public.child_profiles
  for delete using (parent_id = auth.uid());

-- Attempts belong to a child, and a child belongs to a parent.
create policy task_attempts_select on public.task_attempts
  for select using (public.owns_profile(profile_id));

create policy task_attempts_insert on public.task_attempts
  for insert with check (public.owns_profile(profile_id));

-- No update and no delete policy, on purpose. The log is append-only, and
-- Postgres denies what no policy permits. A learning record that can be
-- rewritten is not a record.

create policy level_completions_select on public.level_completions
  for select using (public.owns_profile(profile_id));

create policy level_completions_insert on public.level_completions
  for insert with check (public.owns_profile(profile_id));

-- No update: a latch that can be lowered is not a latch.
```

- [ ] **Step 2: Apply it and run the security advisor**

Apply via `apply_migration`, then run `get_advisors` with type `security`. Fix anything it raises before continuing — it catches missing RLS, which is precisely the failure this task exists to prevent.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0002_rls.sql
git commit -m "feat(api): add row-level security policies"
```

---

## Task 3: Prove the policies hold, from a second account

**Files:**
- Create: `supabase/tests/rls.md` — what was tried and what happened

A policy that permits the happy path proves nothing. **Try to break it.**

- [ ] **Step 1: Create two test parents and a child each**

Use `execute_sql` to create two users in `auth.users` and one child profile each. Record their ids.

- [ ] **Step 2: Attempt every cross-account access, as each parent**

Set the request's claims to parent A, then attempt each of these against parent B's rows. **Every one must return zero rows or be rejected:**

| Attempt | Must |
|---|---|
| `select` B's child profile | return 0 rows |
| `select` B's attempts | return 0 rows |
| `select` B's completions | return 0 rows |
| `insert` an attempt against B's profile | be rejected |
| `insert` a child profile with B's `parent_id` | be rejected |
| `update` B's child profile name | affect 0 rows |
| `delete` B's child profile | affect 0 rows |
| `update` an attempt (even their own) | be rejected — the log is append-only |
| `delete` an attempt (even their own) | be rejected |
| `update` a completion (even their own) | be rejected — a latch that lowers is not a latch |

Then repeat as parent B against parent A, because a policy can be asymmetric by accident.

Then as an **anonymous** request with no auth at all: every table must return zero rows.

- [ ] **Step 3: Write down what you actually observed**

Record each attempt and its real result in `supabase/tests/rls.md`. Not "should fail" — what happened, with the error or row count. If any attempt succeeded that should not have, **stop and report it**; do not patch and move on quietly.

- [ ] **Step 4: Clean up the test users and commit**

Delete the test users and their data, confirm the tables are empty, and commit the record.

```bash
git add supabase/tests/rls.md
git commit -m "test(api): verify row-level security against a second account"
```

---
## Task 4: The client, and keeping the service key out of a public repo

**Files:**
- Create: `packages/api/package.json`, `tsconfig.json`
- Create: `packages/api/src/client.ts`
- Create: `apps/game/.env.example`
- Modify: `.gitignore`
- Create: `scripts/check-no-secrets.sh`

**The repo is public.** That changes what may be committed.

- **The publishable (anon) key is safe to commit.** It is designed to ship inside client bundles, it identifies the project rather than authorising anything, and RLS is what actually protects the data. Shipping it is the intended design.
- **The `service_role` key must never enter the repo in any form.** It bypasses RLS completely. In a public repo that is an immediate compromise of every family's data, and it is not recoverable by deleting the commit — the key must be rotated.

- [ ] **Step 1: Create the package and client**

```ts
/**
 * The Supabase client.
 *
 * Takes the publishable (anon) key. That key is safe in a client bundle and in
 * this public repo: it identifies the project, it authorises nothing on its
 * own, and row-level security is what actually protects the data.
 *
 * The service_role key must NEVER appear here, in any file, or in any
 * environment this app reads. It bypasses RLS entirely. See
 * scripts/check-no-secrets.sh, which fails the build if one is ever committed.
 */
```

Read the URL and key from `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Get the real values with the `get_project_url` and `get_publishable_keys` tools.

**The app must work with neither set.** A missing key means sync is off, not that the game is broken — this is an offline-first product and the local experience is the product.

- [ ] **Step 2: Add `.env.example` with the real URL and publishable key**

Committed deliberately, with a comment saying why it is safe and what must never be added to it.

- [ ] **Step 3: Write the secret check**

`scripts/check-no-secrets.sh` greps tracked files for a service-role key pattern (`service_role`, and the `sb_secret_` prefix) and exits non-zero on a hit. Wire it into `npm test` or a pre-commit step so it runs without anyone remembering to.

Prove it works: temporarily add a fake service key to a tracked file, confirm the script fails, remove it.

- [ ] **Step 4: Commit**

```bash
git add packages/api apps/game/.env.example scripts/check-no-secrets.sh .gitignore
git commit -m "feat(api): add the Supabase client and a secret check for a public repo"
```

---

## Task 5: Rebuild state from the log

**Files:**
- Create: `packages/api/src/rebuild.ts`
- Test: `packages/api/src/rebuild.test.ts`

The other half of "sync the log, derive the rest". A device that has just pulled a log must reconstruct everything from it.

- [ ] **Step 1: Write the failing test**

The function is pure: attempts in, local state out.

```ts
rebuildFrom(attempts: Attempt[], config: EngineConfig): {
  mastery: MasteryMap;
  playedDates: string[];
  highScores: HighScore[];
}
```

Tests that matter:

- **Replaying a log reproduces the mastery the live game produced.** Build a real quest with `buildSession`, play it through `recordTaskResult`, then rebuild from the attempt log alone and assert the two maps are equal. **This is the test the whole design rests on** — if a log cannot reproduce the state, nothing else here is safe.
- Attempts arriving out of order produce the same result as in order. Two devices syncing will deliver them jumbled.
- A duplicated attempt id contributes once, not twice.
- Played dates come from attempt timestamps, in the device's local zone, matching `localDateString`.
- High scores derive per session: stars from the errors and scaffolds in that session's attempts, using the same `starsFor` thresholds the runner uses.
- An empty log rebuilds to empty state without special-casing.

- [ ] **Step 2: Implement, run, commit**

Import `starsFor` and the mastery fold from where they already live rather than reimplementing them. **Two implementations of "what counts as three stars" would drift**, and the drift would be invisible.

```bash
git commit -m "feat(api): rebuild mastery, dates and scores from the attempt log"
```

---

## Task 6: The sync queue

**Files:**
- Create: `packages/api/src/syncQueue.ts`
- Test: `packages/api/src/syncQueue.test.ts`

Pure decision logic, no network. What to push, what to pull, and what to do when it fails.

- [ ] **Step 1: Write the failing test**

```ts
planSync(local: LocalState, remote: RemoteState): SyncPlan
```

Tests:

- Attempts the server has not seen are pushed; attempts already there are not re-pushed.
- Attempts the server has and the device does not are pulled.
- The union is what both ends end up with — **nothing is dropped from either side**. Two children playing two devices offline both keep their work.
- A level completion present on either side ends up on both, keeping the **earliest** `completed_at`. A latch may not move later.
- A profile deleted locally is deleted remotely; a profile deleted remotely is removed locally.
- An empty plan is produced when both sides agree, so a quiet device does no network work.

- [ ] **Step 2: Decide what a failure does, and test it**

A failed sync must leave the game entirely playable. The queue retains unpushed attempts and tries again later; it never blocks, never shows an error to a child, and never discards local work to resolve a conflict.

Test that a push failure leaves the pending set unchanged, so nothing is lost by a dropped connection.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(api): add the sync queue planner"
```

---

## Task 7: Wire it in without letting it touch play

**Files:**
- Create: `packages/api/src/SupabaseProgressRepo.ts`
- Create: `apps/game/src/data/SyncingProgressRepo.ts`
- Create: `apps/game/app/signin.tsx`
- Modify: `apps/game/app/parent.tsx`

- [ ] **Step 1: Build the syncing repo as a wrapper**

`SyncingProgressRepo` wraps the existing local repo. Every read and write goes to local storage exactly as before; sync happens **after**, in the background, and its outcome never changes what the caller sees.

This is the rule to hold: **the network is never on the path between a child's tap and the game responding.** The local repo already works; this must not make it slower or less reliable.

- [ ] **Step 2: Sign-in is optional and lives in the parent area**

A parent signs in with an email magic link, from behind the PIN. Signing in enables sync; not signing in is a fully supported state, and the game never nags.

Make clear on that screen what signing in does — *"keeps their progress safe if this device is lost, and lets you see it from your phone"* — rather than presenting an account as a toll gate.

- [ ] **Step 3: Sync on sensible moments only**

On sign-in, on app foreground, and after a quest finishes. **Not** mid-quest: a child tapping through tasks should generate no network traffic at all.

- [ ] **Step 4: Verify in a browser**

Sign in, play a quest, confirm attempts reach the server. Then sign in as the same parent in a second browser profile and confirm the child's progress appears there. Then **turn the network off**, play a full quest, confirm it works throughout, turn the network back on and confirm the attempts arrive.

Report what you actually observed at each step.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(game): sync progress in the background without touching play"
```

---

## Task 8: Review gate 5

**Files:**
- Modify: `docs/REVIEW-GATE.md`, `README.md`
- Modify: `docs/superpowers/specs/2026-10-10-soundlings-phonics-game-design.md` §10

- [ ] **Step 1: Update the docs**

Record what syncs and what is derived, and why the active session deliberately does not. Update spec §10's table list, which still names tables this plan decided not to create, and say why they are derived instead.

Note in the review gate that sign-in is optional and the game is fully playable without it.

Keep every existing caveat. **No child has played it** remains true.

- [ ] **Step 2: Run everything and commit**

```bash
npm test
./scripts/check-no-secrets.sh
git commit -m "docs: update the review gate and spec for sync"
```

---

## Out of scope

Levels 2–6 · real voice · illustrated artwork · `SAY_IT` voice tasks · Apple sign-in (email magic link first; Apple is required before App Store submission and belongs with that work) · realtime subscriptions (sync on sensible moments is enough; a live cursor on a child's quest is not a feature anyone asked for).

## Self-review notes

**Spec coverage:** §10.1's tables, amended to drop the four that are derivable (Task 1) · §10.1's RLS (Tasks 2, 3) · §10.2's append-only log as the rebuildable source of truth (Task 5) · §10.3's offline-first guarantee (Tasks 6, 7).

**The deliberate deviation from the spec:** §10.1 lists `mastery_records`, `high_scores`, `creatures_unlocked` and a sessions table. This plan creates none of them. The spec itself says mastery is a cache rebuildable from the log; the same is true of the other three. Storing derived data would mean a row written by an old app version against a newer algorithm is silently wrong forever, and the algorithm has already changed twice. Task 8 updates the spec rather than leaving it contradicting the code.

**The risk this plan carries:** RLS is the one thing here that fails silently and badly. Task 3 exists because a policy that passes a happy-path test proves nothing, and the only honest check is trying to read another family's data from a real second account.
