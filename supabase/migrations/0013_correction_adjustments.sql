-- Phase 13: correcting-entry pattern for already-verified transactions.
-- Research (docs/research-transaction-corrections.md) found this is the one
-- near-universal approach across GAAP/IFRS, QuickBooks/Xero/Oracle, Square,
-- SAP/NetSuite, and dealer chargebacks: never edit or delete the original
-- record — post a new, linked transaction carrying only the delta. Flag
-- (0012) already covers status='pending' (void before it's committed); this
-- covers status='verified' (already locked into a month's reconciliation).

-- 1) adjusts_id: null for every normal transaction, points at the original
--    transaction being corrected for an 'adjustment' row. References
--    transactions itself so an adjustment is just another transaction row —
--    it flows through the same pending->verified lifecycle, counts toward
--    the same balance/report totals, and needs no new RLS policy (the
--    existing transactions_insert_accountant / transactions_update_accountant
--    policies from 0001 already cover accountant/master on any row).
alter table transactions add column if not exists adjusts_id uuid references transactions(id);
create index if not exists idx_tx_adjusts on transactions (adjusts_id) where adjusts_id is not null;

-- 2) Widen the type check to allow 'adjustment'. The original constraint was
--    declared inline in the initial (pre-migration) table creation, so its
--    name is whatever Postgres auto-assigned — look it up rather than guess.
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'transactions'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%type%package%topup%'
  loop
    execute format('alter table transactions drop constraint %I', c.conname);
  end loop;
end $$;

alter table transactions add constraint transactions_type_check
  check (type in ('package', 'topup', 'adjustment'));

-- 3) An adjustment must reference what it corrects; a normal transaction
--    must not. Chain prevention (an adjustment can't itself be adjusted —
--    always correct the original) is enforced app-side in
--    records/actions.ts, since it needs a lookup on the referenced row's
--    type, not just this row's own columns.
alter table transactions add constraint adjustment_needs_target
  check (
    (type = 'adjustment' and adjusts_id is not null) or
    (type != 'adjustment' and adjusts_id is null)
  );
