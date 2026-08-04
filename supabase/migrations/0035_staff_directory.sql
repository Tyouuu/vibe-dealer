-- Phase 35: the audit trail was anonymous to everyone except the master.
--
-- profiles' SELECT policy is `id = auth.uid() OR current_role_name() = 'master'`,
-- which is the right rule for a profile *record* — an accountant has no
-- business reading a colleague's email, notification settings or report
-- sender name.
--
-- But nine screens join profiles purely to answer "who did this": the
-- reconciliation variance list, the credit-purchase ledger, the SIM stock log,
-- a dealer's rate history and event timeline, the duplicate-entry warning, and
-- the corrections-awaiting-a-second-check band. Every one of them rendered a
-- dash for anybody other than the person looking. The accountant — the role
-- that actually reads an audit trail — saw an audit trail with no names in it,
-- while the master saw it complete. Verified against the live project: signed
-- in as the accountant, `select * from profiles` returns exactly one row.
--
-- A view, not a looser policy on profiles. The only fact these screens need is
-- id -> display name, so that is the only fact this exposes. Email is never
-- returned; where a profile has no name yet, the local part stands in so the
-- row still reads as a person rather than a dash, without publishing the
-- address.
--
-- security_invoker = false is the load-bearing part: the view runs as its
-- owner, so it can read across profiles while the underlying table keeps its
-- own-row-only policy for everything else.
create or replace view staff_directory
with (security_invoker = false) as
select
  id,
  coalesce(nullif(btrim(name), ''), split_part(email, '@', 1)) as display_name
from profiles;

revoke all on staff_directory from anon;
grant select on staff_directory to authenticated;
