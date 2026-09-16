-- Phase 51: getDealerRankingMap (src/lib/dealer-ranking.ts) fetched every
-- verified transaction's dealer_id and points, unbounded, and summed them in
-- JS on every /dealers page load — the exact anti-pattern get_credit_balance()
-- (0016) already exists to avoid on the credit-balance side, just never
-- applied here. Fine at today's row count; not something to notice only once
-- it isn't. One aggregate query, same shape as get_credit_balance() and
-- sim_stock_balance: a plain SQL function, not SECURITY DEFINER, because the
-- caller (accountant/master) already has SELECT on transactions directly —
-- this only moves where the summing happens, not who is allowed to see it.
create or replace function get_dealer_points_ranking()
returns table(dealer_id uuid, total_points numeric)
language sql
stable
as $$
  select dealer_id, sum(points) as total_points
  from transactions
  where status = 'verified'
  group by dealer_id
  order by total_points desc;
$$;

grant execute on function get_dealer_points_ranking() to authenticated;
