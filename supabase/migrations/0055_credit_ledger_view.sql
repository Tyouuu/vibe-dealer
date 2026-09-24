-- Phase 55: the Credit Purchases ledger, one page at a time.
--
-- The page read every purchase AND every non-flagged transaction there has ever been,
-- merged them in JavaScript, worked out a running balance down the whole list, and only
-- then cut out the fifty rows it shows. That is thousands of rows a month — 12,000-36,000
-- a year — pulled through the API on every visit to display fifty, and the API stops at
-- 1,000 rows per request without saying so. Past that the newest thousand movements were
-- all there was: older pages simply did not exist and "N movements" stopped at 1,000.
--
-- This puts the work where the rows are. One row per movement — a purchase adds its points,
-- a non-flagged sale takes its points — the same two sets get_credit_balance() adds up, so
-- the ledger and the balance cannot disagree. `newer_sum` is the total of every movement
-- NEWER than this one, so the balance right after it is (current balance - newer_sum): the
-- page asks for fifty rows and gets each row's balance already worked out, from any page,
-- without reading the ones before it.
--
-- security_invoker = on: it reads as the person asking, so the finance-only RLS on
-- credit_purchases, transactions and dealers applies exactly as it does to a direct read
-- (cs, who has no SELECT on any of them, sees nothing).
--
-- The window's ORDER BY (mdate, created_at, key, all descending) must be the order the page
-- asks for; key is unique, so the order is total and no two rows can swap.
create or replace view credit_ledger
with (security_invoker = true) as
with movements as (
  select
    'p-' || p.id::text                                as key,
    p.purchase_date                                   as mdate,
    coalesce(p.created_at, p.purchase_date::timestamptz) as created_at,
    'purchase'::text                                  as source,
    p.id                                              as ref_id,
    p.points                                          as delta,
    p.money_rm                                        as purchase_money_rm,
    p.note                                            as purchase_note,
    p.recorded_by                                     as purchase_recorded_by,
    (p.adjusts_id is not null)                        as purchase_is_correction,
    null::text                                        as sale_type,
    null::text                                        as sale_package,
    null::text                                        as sale_status,
    null::text                                        as sale_dealer
  from credit_purchases p
  union all
  select
    't-' || t.id::text,
    t.tx_date,
    coalesce(t.created_at, t.tx_date::timestamptz),
    'sale'::text,
    t.id,
    -t.points,
    null::numeric,
    null::text,
    null::uuid,
    false,
    t.type,
    t.package,
    t.status,
    d.company_name
  from transactions t
  left join dealers d on d.id = t.dealer_id
  where t.status <> 'flagged'
)
select
  m.*,
  coalesce(
    sum(m.delta) over (order by m.mdate desc, m.created_at desc, m.key desc rows between unbounded preceding and 1 preceding),
    0
  ) as newer_sum
from movements m;

grant select on credit_ledger to authenticated;
