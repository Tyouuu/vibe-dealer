-- Phase 7: hardening pass from a full-platform audit.

-- 1) dealers_insert_cs_master (0001) never restricted what value rate/package
--    could be paired with on insert or update — only app logic (recomputeDealerRate)
--    kept them in sync. A CHECK constraint closes that at the DB level regardless
--    of which client/path writes to this table.
alter table dealers drop constraint if exists dealers_rate_matches_package;
alter table dealers add constraint dealers_rate_matches_package
  check (
    (package is null and rate is null) or
    (package = 'A' and rate = 7) or
    (package = 'B' and rate = 7.5) or
    (package = 'C' and rate = 8)
  );

-- 2) Track who onboarded each dealer (existing imported dealers stay null).
alter table dealers add column if not exists onboarded_by uuid;

-- 3) dealer_last_verified_activity: a narrow, non-financial aggregate view so
--    getDealerActivityMap() (used on /dashboard, /dealers, /dealers/[id] — including
--    for cs, who has no SELECT on transactions at all) can compute "days since last
--    activity" from one small row per dealer instead of scanning every verified
--    transaction ever recorded. security_invoker=off (same pattern as delivery_queue
--    in 0003) so cs can read it too — it exposes only dealer_id + a date, no money.
create or replace view dealer_last_verified_activity
with (security_invoker = off) as
select dealer_id, max(tx_date) as last_tx_date
from transactions
where status = 'verified'
group by dealer_id;

grant select on dealer_last_verified_activity to authenticated;

-- 4) Indexes for /audit's three created_at-ordered queries (previously unindexed).
create index if not exists idx_transactions_created_at on transactions (created_at desc);
create index if not exists idx_statement_rev_created_at on company_statement_revisions (created_at desc);
create index if not exists idx_rate_history_created_at on dealer_rate_history (created_at desc);
