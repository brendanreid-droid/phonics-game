-- Replaces the owns_profile() helper from 0002 with inline EXISTS checks.
--
-- The helper was wrong twice over:
--
-- 1. It was exposed at /rest/v1/rpc/owns_profile, so anyone could probe profile
--    ids. Supabase's security advisor caught this.
-- 2. Revoking EXECUTE to close that broke every policy using it, because RLS
--    policies evaluate as the CALLING role and therefore need the caller's
--    grant. A comment in the revoking migration claimed the opposite and was
--    simply wrong.
--
-- Inlining removes both problems: nothing is exposed over REST, and there is no
-- grant to get wrong. The repetition across four policies is worth it — each
-- policy states its own rule where a reader will look for it.
--
-- Verified against a second real account. See supabase/tests/rls.md.
drop function if exists public.owns_profile(uuid) cascade;

create policy task_attempts_select on public.task_attempts
  for select using (
    exists (select 1 from public.child_profiles cp
            where cp.id = task_attempts.profile_id and cp.parent_id = auth.uid())
  );

create policy task_attempts_insert on public.task_attempts
  for insert with check (
    exists (select 1 from public.child_profiles cp
            where cp.id = task_attempts.profile_id and cp.parent_id = auth.uid())
  );

-- No update and no delete policy, on purpose. The log is append-only and
-- Postgres denies what no policy permits. A learning record that can be
-- rewritten is not a record.

create policy level_completions_select on public.level_completions
  for select using (
    exists (select 1 from public.child_profiles cp
            where cp.id = level_completions.profile_id and cp.parent_id = auth.uid())
  );

create policy level_completions_insert on public.level_completions
  for insert with check (
    exists (select 1 from public.child_profiles cp
            where cp.id = level_completions.profile_id and cp.parent_id = auth.uid())
  );

-- No update: a latch that can be lowered is not a latch.
