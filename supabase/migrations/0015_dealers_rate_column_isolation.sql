-- Phase 15: close a real defense-in-depth gap found in a full security audit
-- (docs/security-and-feature-gap-audit.md) — dealers_select_staff (0001) has
-- always granted cs full-row SELECT on `dealers`, including `rate`, a
-- commission figure PROJECT_SPEC.md explicitly says cs must never see. App
-- code has always stripped `rate` before rendering to cs (dealers/page.tsx,
-- dealers/[id]/page.tsx, /api/dealers/export) — but that only closes the UI;
-- a cs session's own already-issued credentials could always call
-- `supabase.from('dealers').select('rate')` directly and get it back. This
-- mirrors the exact gap 0003 already closed for `transactions` via
-- delivery_queue — same fix, applied here now.
--
-- Postgres RLS is row-level, not column-level, and this app has no way to
-- distinguish an "accountant" session from a "cs" session at the Postgres
-- role level (both are the single `authenticated` role; the distinction is
-- app-level data in profiles.role, read via current_role_name()) — so a
-- plain column GRANT/REVOKE can't do this either. The view is the only tool
-- that fits this architecture.

-- 1) Tighten the base table: only accountant/master can SELECT `dealers`
--    directly (and therefore `rate`) from now on. cs's existing INSERT
--    (dealers_insert_cs_master) and its narrow UPDATE path (set_dealer_status
--    RPC, 0009) are untouched — this only removes cs's own direct SELECT.
drop policy if exists "dealers_select_staff" on dealers;
create policy "dealers_select_staff" on dealers
  for select using (current_role_name() in ('accountant', 'master'));

-- 2) dealers_directory: every dealers column cs actually needs, minus
--    `rate`. cs-reachable code (onboarding, import, notifications, layout
--    counts, the dealers list/detail pages, dealers export) now reads
--    through this instead of the base table.
create or replace view dealers_directory
with (security_invoker = off) as
select
  id,
  company_name,
  company_no,
  contact_person,
  phone,
  email,
  address,
  region,
  package,
  status,
  created_at
from dealers
where current_role_name() in ('cs', 'accountant', 'master');

grant select on dealers_directory to authenticated;
