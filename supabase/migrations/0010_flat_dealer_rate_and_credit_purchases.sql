-- Phase 10: Vibe Mobile unified the dealer reload rate to a flat 6% (was
-- A=7%/B=7.5%/C=8%) — and the app never had a page for the other half of the
-- money flow: what master dealer itself pays Vibe Mobile for points/credit
-- before reselling any of it. Master's fixed 2% (COMMISSION_RATE in
-- src/lib/packages.ts, unchanged) plus this new flat 6% dealer rate together
-- make up the ~8% spread between what master pays Vibe Mobile and face value
-- (e.g. pay RM92, receive 100 pts).

-- 1) Loosen then re-tighten the rate/package check constraint (0007) to a
--    flat 6% instead of the old per-package bands.
alter table dealers drop constraint if exists dealers_rate_matches_package;
alter table dealers add constraint dealers_rate_matches_package
  check (
    (package is null and rate is null) or
    (package in ('A', 'B', 'C') and rate = 6)
  );

-- 2) Retroactively correct every already-assigned dealer (per-dealer, not a
--    bulk UPDATE, so each one gets its own before/after row in
--    dealer_rate_history instead of one entry with no old_rate to compare).
--    changed_by is null — this is a one-time policy migration, not a
--    specific staff member's action, unlike every other row in this table.
do $$
declare
  r record;
begin
  for r in select id, package, rate from dealers where package is not null and rate is distinct from 6 loop
    insert into dealer_rate_history (dealer_id, old_package, old_rate, new_package, new_rate, changed_by)
    values (r.id, r.package, r.rate, r.package, 6, null);
  end loop;

  update dealers set rate = 6 where package is not null and rate is distinct from 6;
end $$;

-- 3) credit_purchases: each batch of points/credit bought from Vibe Mobile.
--    Finance-only, same shape as company_statements (select/insert/update,
--    no delete — typos get corrected via update, not silently erased).
create table if not exists credit_purchases (
  id           uuid primary key default gen_random_uuid(),
  purchase_date date not null,
  money_rm     numeric not null check (money_rm >= 0),
  points       numeric not null check (points >= 0),
  note         text,
  recorded_by  uuid not null,
  created_at   timestamptz default now()
);
create index if not exists idx_credit_purchases_date on credit_purchases (purchase_date desc);

alter table credit_purchases enable row level security;

drop policy if exists "credit_purchases_select_finance" on credit_purchases;
create policy "credit_purchases_select_finance" on credit_purchases
  for select using (current_role_name() in ('accountant', 'master'));

drop policy if exists "credit_purchases_insert_finance" on credit_purchases;
create policy "credit_purchases_insert_finance" on credit_purchases
  for insert with check (current_role_name() in ('accountant', 'master'));

drop policy if exists "credit_purchases_update_finance" on credit_purchases;
create policy "credit_purchases_update_finance" on credit_purchases
  for update using (current_role_name() in ('accountant', 'master'));
