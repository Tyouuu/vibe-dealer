-- Phase 6: dealer rate change history.
--
-- recomputeDealerRate (src/lib/dealer-rate.ts) overwrites dealers.package /
-- dealers.rate every time it runs, so the dealers table only ever shows the
-- current value — there's no record of what it used to be or when it
-- changed. This adds an append-only log: whenever recomputeDealerRate
-- actually changes the package/rate, it inserts a before/after snapshot
-- here (dealers itself is unchanged), so history can be reconstructed per
-- dealer instead of only knowing the latest value.

create table if not exists dealer_rate_history (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references dealers(id) on delete cascade,
  old_package text,
  old_rate numeric,
  new_package text,
  new_rate numeric,
  changed_by uuid,
  created_at timestamptz default now()
);
create index if not exists idx_dealer_rate_history_dealer on dealer_rate_history (dealer_id);

alter table dealer_rate_history enable row level security;

drop policy if exists "dealer_rate_history_select_finance" on dealer_rate_history;
create policy "dealer_rate_history_select_finance" on dealer_rate_history
  for select using (current_role_name() in ('accountant','master'));

drop policy if exists "dealer_rate_history_insert_finance" on dealer_rate_history;
create policy "dealer_rate_history_insert_finance" on dealer_rate_history
  for insert with check (current_role_name() in ('accountant','master'));
