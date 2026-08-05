-- Switching a staff member off must revoke their data access, not just hide
-- the app from them.
--
-- 0036 added profiles.active and the DAL was taught to return null for a
-- switched-off user, which is what /staff's toggle relies on. But that check
-- lives in the Next.js layer only. Supabase Auth knows nothing about `active`,
-- so a switched-off user who still holds their password can sign in, get a
-- valid JWT, and query PostgREST directly — bypassing the app entirely.
--
-- Measured before this migration, with both test accounts set active = false:
--
--   accountant@dealerhub.test  ->  content-range: 0-0/284   (all dealers)
--   cs@dealerhub.test          ->  content-range: */0       (role-restricted)
--
-- The accountant read the whole dealer list while switched off. Firing someone
-- and toggling them off in /staff would not have taken the ledger away from
-- them.
--
-- Every RLS policy in the schema resolves the caller through one function, so
-- one predicate fixes all of them at once rather than editing dozens of
-- policies and missing some. `active` is `not null default true` (0036), so no
-- null handling is needed and existing users are unaffected.
--
-- The profiles SELECT policy stays `id = auth.uid() or ...`, so a switched-off
-- user can still read their own row. That is deliberate: the DAL reads the
-- profile to discover active = false, and a user who cannot see their own row
-- could not be told they are switched off.
create or replace function current_role_name()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from profiles where id = auth.uid() and active
$$;
