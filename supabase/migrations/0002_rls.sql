-- Enables row-level security and adds the profile policies.
--
-- NOTE: this migration also created a `owns_profile()` security-definer helper
-- and used it in the child-table policies. That was a mistake on two counts and
-- is corrected in 0003. The helper and its policies are left here as applied,
-- because migrations are history: see 0003 for what is actually in force.
alter table public.child_profiles    enable row level security;
alter table public.task_attempts     enable row level security;
alter table public.level_completions enable row level security;

create policy child_profiles_select on public.child_profiles
  for select using (parent_id = auth.uid());

create policy child_profiles_insert on public.child_profiles
  for insert with check (parent_id = auth.uid());

create policy child_profiles_update on public.child_profiles
  for update using (parent_id = auth.uid()) with check (parent_id = auth.uid());

create policy child_profiles_delete on public.child_profiles
  for delete using (parent_id = auth.uid());
