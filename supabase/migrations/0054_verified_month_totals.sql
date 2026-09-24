-- Phase 54: one month's verified total, computed where the rows are.
--
-- Reconciliation read every verified transaction of the month into the page and
-- added them up in JavaScript: the figure it prints, the "your 2%" beside it, and —
-- in markReconciled — the number that decides whether a month may be closed without
-- an override reason. The API returns at most 1,000 rows per request (max_rows) and
-- says nothing when it stops, so past 1,000 verified rows the "system total" is a
-- fraction of the real one and a month can be compared, and closed, against it. The
-- code carried a comment warning against exactly this ("no .limit() — a cap would
-- silently under-count") without knowing the platform applies a cap of its own.
--
-- Measured on a demo with 12,000 transactions: September's verified points read
-- 2,905,470 against a true 12,073,598, and "4189 verified transactions" read 1000.
--
-- A plain SQL function, not SECURITY DEFINER, in the same shape as get_credit_balance
-- and get_dealer_points_ranking: master and accountant already have SELECT on
-- transactions, so this only moves where the adding happens, not who may see it. cs has
-- no SELECT and gets zeros, which is what every other read of that table gives them.
create or replace function verified_month_totals(p_start date, p_end date)
returns table(points numeric, commission numeric, tx_count bigint)
language sql
stable
as $$
  select coalesce(sum(t.points), 0),
         coalesce(sum(t.commission_rm), 0),
         count(*)
  from transactions t
  where t.status = 'verified'
    and t.tx_date >= p_start
    and t.tx_date <= p_end;
$$;

grant execute on function verified_month_totals(date, date) to authenticated;
