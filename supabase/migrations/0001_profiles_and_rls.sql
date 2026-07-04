-- Phase 1: profiles table + RLS policies for dealers / transactions / company_statements / profiles.
-- dealers, transactions, company_statements already exist (see PROJECT_SPEC.md section 5) — only
-- profiles is newly created here. Safe to re-run: uses if-not-exists / drop-then-create throughout.

-- ============================================================
-- 1) profiles — one row per login user, links to Supabase Auth
-- ============================================================
create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text,
  email      text,
  role       text not null check (role in ('master','accountant','cs')),
  created_at timestamptz default now()
);

alter table profiles enable row level security;

-- ============================================================
-- 2) helper: current user's role, without recursive RLS lookups.
--    security definer + fixed search_path so it safely reads
--    profiles regardless of the caller's own row-level access.
-- ============================================================
create or replace function current_role_name()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from profiles where id = auth.uid()
$$;

-- ============================================================
-- 3) profiles policies
--    - anyone can read their own row (needed to know their own role)
--    - master can read all profiles (user management)
--    - only master can create/edit profiles (assigning roles)
-- ============================================================
drop policy if exists "profiles_select_own_or_master" on profiles;
create policy "profiles_select_own_or_master" on profiles
  for select using (id = auth.uid() or current_role_name() = 'master');

drop policy if exists "profiles_insert_master" on profiles;
create policy "profiles_insert_master" on profiles
  for insert with check (current_role_name() = 'master');

drop policy if exists "profiles_update_master" on profiles;
create policy "profiles_update_master" on profiles
  for update using (current_role_name() = 'master');

-- NOTE (bootstrap): the very first master profile has no existing master
-- to insert it, so current_role_name() will be null and the insert policy
-- above will reject it. Create that first row once from the Supabase SQL
-- Editor (runs as postgres, bypasses RLS) — everyone after that goes
-- through the app as master.

-- ============================================================
-- 4) dealers — all staff can read; cs/master onboard; cs/accountant/
--    master can update (accountant updates package+rate on purchase).
-- ============================================================
alter table dealers enable row level security;

drop policy if exists "dealers_select_staff" on dealers;
create policy "dealers_select_staff" on dealers
  for select using (current_role_name() in ('master','accountant','cs'));

drop policy if exists "dealers_insert_cs_master" on dealers;
create policy "dealers_insert_cs_master" on dealers
  for insert with check (current_role_name() in ('cs','master'));

drop policy if exists "dealers_update_staff" on dealers;
create policy "dealers_update_staff" on dealers
  for update using (current_role_name() in ('cs','accountant','master'));

-- ============================================================
-- 5) transactions — financial data. Per spec, CS does not see
--    finance, so only accountant/master get access here.
--    OPEN QUESTION: CS is responsible for SIM delivery status,
--    which lives on this table (delivery_status column). RLS is
--    row-level, not column-level, so this policy currently blocks
--    CS from that column too. Needs a decision: either relax CS
--    isolation for this table, or expose delivery updates through
--    a narrow Edge Function / view instead. Not resolved yet.
-- ============================================================
alter table transactions enable row level security;

drop policy if exists "transactions_select_finance" on transactions;
create policy "transactions_select_finance" on transactions
  for select using (current_role_name() in ('accountant','master'));

drop policy if exists "transactions_insert_accountant" on transactions;
create policy "transactions_insert_accountant" on transactions
  for insert with check (current_role_name() in ('accountant','master'));

drop policy if exists "transactions_update_accountant" on transactions;
create policy "transactions_update_accountant" on transactions
  for update using (current_role_name() in ('accountant','master'));

-- ============================================================
-- 6) company_statements — accountant enters/reconciles, master reads.
-- ============================================================
alter table company_statements enable row level security;

drop policy if exists "statements_select_finance" on company_statements;
create policy "statements_select_finance" on company_statements
  for select using (current_role_name() in ('accountant','master'));

drop policy if exists "statements_insert_accountant" on company_statements;
create policy "statements_insert_accountant" on company_statements
  for insert with check (current_role_name() in ('accountant','master'));

drop policy if exists "statements_update_accountant" on company_statements;
create policy "statements_update_accountant" on company_statements
  for update using (current_role_name() in ('accountant','master'));
