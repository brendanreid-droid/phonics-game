-- One row per child. Owned by a parent via auth.users.
--
-- Deliberately minimal: a first name and an avatar id. No birthday, no school,
-- no photograph. Every field added here is a field that can leak, and this is
-- a five-year-old's record.
create table public.child_profiles (
  id             uuid primary key default gen_random_uuid(),
  parent_id      uuid not null references auth.users (id) on delete cascade,
  name           text not null check (char_length(name) between 1 and 20),
  avatar_id      text not null,
  created_at     timestamptz not null default now(),
  last_played_on date
);

create index child_profiles_parent_idx on public.child_profiles (parent_id);

-- The append-only attempt log. This is the ONLY source of truth that syncs;
-- mastery, streaks, high scores and creatures are all derived from it locally.
--
-- Append-only is what makes offline merging trivial: two devices that both
-- played offline simply both contribute, and nothing has to win.
create table public.task_attempts (
  id           uuid primary key,
  profile_id   uuid not null references public.child_profiles (id) on delete cascade,
  session_id   text not null,
  target_id    text not null,
  skill        text not null,
  task_type_id text not null,
  correct      boolean not null,
  scaffolded   boolean not null,
  latency_ms   integer not null check (latency_ms >= 0),
  weight       real not null check (weight > 0 and weight <= 1),
  choice_count integer check (choice_count is null or choice_count >= 2),
  chosen       text,
  at           bigint not null,
  created_at   timestamptz not null default now()
);

-- The client supplies `id`, so a replayed push cannot duplicate a row.
create index task_attempts_profile_at_idx on public.task_attempts (profile_id, at);

-- A latch, not a derivation. A child must never lose a level they finished,
-- and recomputing completion from the log would reintroduce exactly the decay
-- problem the latch exists to defeat. See spec section 5.7.
create table public.level_completions (
  profile_id   uuid not null references public.child_profiles (id) on delete cascade,
  level        integer not null,
  completed_at bigint not null,
  primary key (profile_id, level)
);
