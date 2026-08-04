-- Phase 36: staff accounts can be switched off.
--
-- Needed by the staff admin screen this ships with. Deleting a staff member is
-- not an option and never will be: transactions.recorded_by, verified_by,
-- dealers.onboarded_by and dealer_rate_history.changed_by all point at
-- profiles, and the whole value of an append-only ledger is that you can still
-- see who did what two years later. Someone who leaves must stop being able to
-- sign in without their history evaporating.
--
-- A column on profiles rather than banning the auth user: the app already has
-- exactly one place where "authenticated with Supabase but not a user of this
-- app" is decided — getCurrentUser returns null when there is no profiles row
-- — so an inactive profile takes that same path and every gate in the app
-- inherits it for free. Nothing else has to learn about this flag.
alter table profiles add column if not exists active boolean not null default true;

comment on column profiles.active is
  'False means this person can no longer sign in. Their rows in transactions, dealers and dealer_rate_history stay exactly as they are — this is how someone leaves without their history leaving with them.';

-- staff_directory (0035) deliberately keeps returning inactive people: their
-- name still has to render on the transactions they recorded years ago.
create or replace view staff_directory
with (security_invoker = false) as
select
  id,
  coalesce(nullif(btrim(name), ''), split_part(email, '@', 1)) as display_name
from profiles;

revoke all on staff_directory from anon;
grant select on staff_directory to authenticated;
