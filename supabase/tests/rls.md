# Row-level security: what was tried, and what happened

Run against project `vtifvggqsnwpbemghqkk` on 2026-10-14, inside a transaction
that was rolled back, so no test data survives. Two parents were created with a
child each, plus an attempt and a level completion for each child. Every check
ran as a real role (`authenticated` with a JWT `sub`, or `anon`), never as the
table owner — the owner bypasses RLS, so a test run as `postgres` proves nothing.

| # | Attempt | Observed | Wanted |
|---|---|---|---|
| 1 | A reads own profiles | 1 row | 1 |
| 2 | A reads own attempts | 1 row | 1 |
| 3 | A reads own completions | 1 row | 1 |
| 4 | A reads B's profile by id | 0 rows | 0 |
| 5 | A reads B's attempts | 0 rows | 0 |
| 6 | A reads B's completions | 0 rows | 0 |
| 7 | A updates B's profile name | 0 rows affected | 0 |
| 8 | A deletes B's profile | 0 rows affected | 0 |
| 9 | A creates a profile owned by B | rejected, SQLSTATE 42501 | rejected |
| 10 | A writes an attempt onto B's child | rejected, SQLSTATE 42501 | rejected |
| 11 | A rewrites their **own** attempt | 0 rows affected | 0 — the log is append-only |
| 12 | A deletes their **own** attempt | 0 rows affected | 0 — the log is append-only |
| 13 | A lowers their **own** completion latch | 0 rows affected | 0 — a latch that lowers is not a latch |
| 14 | anon reads profiles | 0 rows | 0 |
| 15 | anon reads attempts | 0 rows | 0 |
| 16 | anon reads completions | 0 rows | 0 |

All 16 behaved as intended.

## Two things worth knowing

**The first attempt at this failed, and that was useful.** An earlier migration
used a `security definer` helper, `owns_profile()`, which Supabase's security
advisor correctly flagged as callable over REST at `/rest/v1/rpc/owns_profile`.
Revoking `EXECUTE` to close that broke every policy using it: **RLS policies
evaluate as the calling role**, so the caller needs the grant. A migration
comment had claimed otherwise and was simply wrong. The helper was dropped and
the ownership checks inlined into each policy, which removes both problems —
nothing is exposed over REST, and there is no grant to get wrong.

**One advisor warning remains and is a false positive.** `public.rls_auto_enable()`
is Supabase's own event trigger, which auto-enables RLS on any new public table.
It is flagged as a callable `security definer` function, but calling it fails with
`cannot display a value of type event_trigger` — Postgres will not invoke an event
trigger function directly. Checked, not assumed. Leave it in place; it is a safety
net that would catch a future table created without RLS.

## When to run this again

Any time a policy changes, a table is added, or a column that a policy reads is
altered. A policy that leaks does so **silently** — no error, no crash, just one
family able to read another's child. A test that only confirms the happy path
proves nothing about a security boundary.
