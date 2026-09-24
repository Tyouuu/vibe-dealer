-- Phase 58: the system checks itself, every day, and remembers that it did.
--
-- Nothing here adds a rule the ledger did not already have. Every rule this checks was already
-- a promise: the balance is what was bought minus what was given out, a top-up is worth what the
-- dealer's rate says, a closed month still matches the statement it was closed against, a
-- correction belongs to the dealer it corrects. What was missing was anything that ever LOOKED —
-- so a promise broken by a bug, a bad import, a hand-edit in the database, or a mistyped figure
-- would sit in the books until the month-end reconciliation, or an audit, or a dealer's
-- complaint, found it. Reconciliation compares two monthly totals; it cannot say which row.
--
-- The design rule is that a check must be able to FAIL. Each one below either recomputes a
-- figure by a route that shares no code with the one the pages use (raw sums against
-- get_credit_balance() against the ledger view), or asserts something that cannot be true of
-- healthy data (a correction correcting a correction, a verified row nobody signed). A check
-- that cannot fail proves nothing and only makes a green page look like reassurance.
--
-- It returns one row per check — how many things it looked at and how many were wrong, plus up
-- to five examples — and never a verdict. Whether "12 top-ups that differ from the rate maths"
-- is an emergency or a note is decided in src/lib/system-check.ts, where the wording lives and
-- is tested, so this file stays arithmetic. A check the function fails to return is treated as
-- FAILED by the caller: silence must never read as a pass.
--
-- Not SECURITY DEFINER and not granted to signed-in users. It reads every finance table, so the
-- only caller is the server, as service_role, after it has checked the person asking is a master
-- or accountant. (service_role bypasses row-level security; the role-gated views —
-- delivery_queue, sim_stock_balance — return nothing to it, so everything below reads base tables.)
--
-- Constants that live in TypeScript are repeated here on purpose — the package price list
-- (src/lib/packages.ts), the 6% dealer rate and 8% purchase rate. system-check.test.ts fails if
-- the two ever disagree.

create or replace function run_system_checks()
returns table(check_key text, checked bigint, problems bigint, samples jsonb)
language plpgsql
stable
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_a numeric;
  v_b numeric;
  v_c numeric;
begin
  -- 1. The credit balance, added up three different ways -----------------------------------
  select available into v_a from get_credit_balance();
  v_b := coalesce((select sum(p.points) from credit_purchases p), 0)
       - coalesce((select sum(t.points) from transactions t where t.status <> 'flagged'), 0);
  v_c := coalesce((select sum(l.delta) from credit_ledger l), 0);
  return query select
    'balance_agrees'::text,
    3::bigint,
    (case when v_a = v_b and v_b = v_c then 0 else 1 end)::bigint,
    case when v_a = v_b and v_b = v_c then '[]'::jsonb
      else jsonb_build_array(jsonb_build_object(
        'id', null, 'dealer_id', null,
        'label', 'The credit balance adds up differently depending on how it is counted',
        'detail', format('balance function %s · raw sums %s · ledger view %s', v_a, v_b, v_c)))
    end;

  -- 2. Nothing has been given out that was not bought -----------------------------------------
  return query select
    'balance_not_negative'::text,
    1::bigint,
    (case when v_a < 0 then 1 else 0 end)::bigint,
    case when v_a < 0
      then jsonb_build_array(jsonb_build_object(
        'id', null, 'dealer_id', null,
        'label', 'The credit balance is below zero',
        'detail', format('%s pts — more has been given out than was ever bought', v_a)))
      else '[]'::jsonb
    end;

  -- 3. A package sale is worth what the price list says ---------------------------------------
  return query
  with c as (
    select t.id, t.dealer_id, d.company_name, t.tx_date, t.package, t.quantity, t.points, t.money_rm,
      (case t.package when 'A' then 300 when 'B' then 600 when 'C' then 1000 end) * t.quantity as exp_pts,
      (case t.package when 'A' then 349 when 'B' then 695 when 'C' then 1270 end) * t.quantity as exp_rm
    from transactions t
    left join dealers d on d.id = t.dealer_id
    where t.type = 'package' and t.status <> 'flagged'
  ), b as (
    select c.*, (c.exp_pts is null or c.points <> c.exp_pts or c.money_rm <> c.exp_rm) as bad from c
  )
  select
    'package_maths'::text,
    count(*)::bigint,
    (count(*) filter (where b.bad))::bigint,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'dealer_id', s.dealer_id,
        'label', coalesce(s.company_name, 'Unknown dealer') || ' · ' || to_char(s.tx_date, 'DD Mon YYYY'),
        'detail', format('Package %s × %s: recorded %s pts for RM %s; the price list says %s pts for RM %s',
          s.package, s.quantity, s.points, to_char(s.money_rm, 'FM999,999,990.00'), s.exp_pts, to_char(s.exp_rm, 'FM999,999,990.00'))))
      from (select * from b where b.bad order by b.tx_date desc, b.id limit 5) s
    ), '[]'::jsonb)
  from b;

  -- 4. A top-up is worth what the dealer's rate says (a hand-typed override is legitimate, but
  --    it should be a decision, not a slip) ---------------------------------------------------
  return query
  with c as (
    select t.id, t.dealer_id, d.company_name, t.tx_date, t.money_rm, t.points, t.rate,
      case when t.rate is null or t.rate >= 100 then null
           else round(t.money_rm / (1 - t.rate / 100)) end as exp_pts
    from transactions t
    left join dealers d on d.id = t.dealer_id
    where t.type = 'topup' and t.status <> 'flagged'
  ), b as (
    select c.*, (c.exp_pts is null or abs(c.points - c.exp_pts) > 1) as bad from c
  )
  select
    'topup_maths'::text,
    count(*)::bigint,
    (count(*) filter (where b.bad))::bigint,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'dealer_id', s.dealer_id,
        'label', coalesce(s.company_name, 'Unknown dealer') || ' · ' || to_char(s.tx_date, 'DD Mon YYYY'),
        'detail', case when s.exp_pts is null
          then format('RM %s recorded as %s pts, and no rate was saved to check it against', to_char(s.money_rm, 'FM999,999,990.00'), s.points)
          else format('RM %s recorded as %s pts; the %s%% rate gives %s pts', to_char(s.money_rm, 'FM999,999,990.00'), s.points, s.rate, s.exp_pts) end))
      from (select * from b where b.bad order by b.tx_date desc, b.id limit 5) s
    ), '[]'::jsonb)
  from b;

  -- 5. A credit purchase is credited at the usual 8% (Vibe may price a batch differently — but
  --    that is worth confirming once, not discovering at reconciliation) ----------------------
  return query
  with b as (
    select p.id, p.purchase_date, p.money_rm, p.points,
      round(p.money_rm / 0.92, 2) as exp_pts,
      (abs(p.points - p.money_rm / 0.92) > 1) as bad
    from credit_purchases p
    where p.adjusts_id is null and p.money_rm > 0
  )
  select
    'purchase_rate'::text,
    count(*)::bigint,
    (count(*) filter (where b.bad))::bigint,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'dealer_id', null,
        'label', 'Credit purchase · ' || to_char(s.purchase_date, 'DD Mon YYYY'),
        'detail', format('RM %s paid, %s pts credited; the usual 8%% rate gives about %s pts',
          to_char(s.money_rm, 'FM999,999,990.00'), s.points, round(s.exp_pts))))
      from (select * from b where b.bad order by b.purchase_date desc, b.id limit 5) s
    ), '[]'::jsonb)
  from b;

  -- 6. The same top-up or package recorded twice ------------------------------------------------
  return query
  with base as (
    select t.dealer_id, t.tx_date, t.type, t.package, t.quantity, t.money_rm
    from transactions t
    where t.type <> 'adjustment' and t.status <> 'flagged' and t.dealer_id is not null
  ), g as (
    select dealer_id, tx_date, type, package, quantity, money_rm, count(*) as n
    from base
    group by dealer_id, tx_date, type, package, quantity, money_rm
    having count(*) > 1
  )
  select
    'possible_duplicates'::text,
    (select count(*) from base)::bigint,
    (select count(*) from g)::bigint,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', null, 'dealer_id', s.dealer_id,
        'label', coalesce(s.company_name, 'Unknown dealer') || ' · ' || to_char(s.tx_date, 'DD Mon YYYY'),
        'detail', format('%s identical entries of RM %s on the same day', s.n, to_char(s.money_rm, 'FM999,999,990.00'))))
      from (
        select g.*, d.company_name from g left join dealers d on d.id = g.dealer_id
        order by g.tx_date desc limit 5
      ) s
    ), '[]'::jsonb);

  -- 7. The same bank slip or invoice recorded twice ---------------------------------------------
  --    Two separate namespaces: a dealer's bank reference and Vibe's invoice number are different
  --    things, and one matching the other means nothing.
  return query
  with r as (
    select 'Slip'::text as kind, t.reference_key as ref, t.dealer_id::text as dealer_id, t.tx_date as d
    from transactions t
    where t.status <> 'flagged' and t.type <> 'adjustment' and length(t.reference_key) >= 8
    union all
    select 'Invoice', p.reference_key, null, p.purchase_date
    from credit_purchases p
    where p.adjusts_id is null and length(p.reference_key) >= 8
  ), g as (
    select kind, ref, count(*) as n, min(dealer_id) as dealer_id, max(d) as last_date
    from r group by kind, ref having count(*) > 1
  )
  select
    'duplicate_references'::text,
    (select count(*) from r)::bigint,
    (select count(*) from g)::bigint,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', null, 'dealer_id', s.dealer_id::uuid,
        'label', s.kind || ' reference ' || s.ref || ' · ' || to_char(s.last_date, 'DD Mon YYYY'),
        'detail', format('%s entries carry the same reference — %s',
          s.n, case when s.kind = 'Slip' then 'one payment counted more than once' else 'one purchase from Vibe counted more than once' end)))
      from (select * from g order by g.last_date desc limit 5) s
    ), '[]'::jsonb);

  -- 8. A correction corrects a real entry, once, for the same dealer ---------------------------
  return query
  with links as (
    select 'Sale'::text as tbl, a.id, a.dealer_id, a.tx_date as d,
      (o.type = 'adjustment') as chained,
      (a.dealer_id is distinct from o.dealer_id) as wrong_dealer
    from transactions a join transactions o on o.id = a.adjusts_id
    where a.adjusts_id is not null
    union all
    select 'Credit purchase', a.id, null::uuid, a.purchase_date, (o.adjusts_id is not null), false
    from credit_purchases a join credit_purchases o on o.id = a.adjusts_id
    where a.adjusts_id is not null
    union all
    select 'SIM intake', a.id, null::uuid, a.intake_date, (o.adjusts_id is not null), false
    from sim_stock_intakes a join sim_stock_intakes o on o.id = a.adjusts_id
    where a.adjusts_id is not null
    union all
    select 'SIM order', a.id, a.dealer_id, a.order_date, (o.adjusts_id is not null), (a.dealer_id is distinct from o.dealer_id)
    from sim_orders a join sim_orders o on o.id = a.adjusts_id
    where a.adjusts_id is not null
  ), b as (
    select links.*, (links.chained or links.wrong_dealer) as bad from links
  )
  select
    'adjustment_links'::text,
    count(*)::bigint,
    (count(*) filter (where b.bad))::bigint,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'dealer_id', s.dealer_id,
        'label', s.tbl || ' correction · ' || to_char(s.d, 'DD Mon YYYY'),
        'detail', case when s.chained then 'A correction that corrects another correction' else 'A correction filed under a different dealer than the entry it corrects' end))
      from (select * from b where b.bad order by b.d desc limit 5) s
    ), '[]'::jsonb)
  from b;

  -- 9. Every verified entry has a name against it ------------------------------------------------
  return query
  with b as (
    select t.id, t.dealer_id, d.company_name, t.tx_date, t.money_rm,
      (t.verified_by is null or t.recorded_by is null) as bad
    from transactions t
    left join dealers d on d.id = t.dealer_id
    where t.status = 'verified'
  )
  select
    'signed_off'::text,
    count(*)::bigint,
    (count(*) filter (where b.bad))::bigint,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'dealer_id', s.dealer_id,
        'label', coalesce(s.company_name, 'Unknown dealer') || ' · ' || to_char(s.tx_date, 'DD Mon YYYY'),
        'detail', format('RM %s is counted as verified, but nobody is recorded as having entered or verified it', to_char(s.money_rm, 'FM999,999,990.00'))))
      from (select * from b where b.bad order by b.tx_date desc, b.id limit 5) s
    ), '[]'::jsonb)
  from b;

  -- 10. No entry that cannot exist ----------------------------------------------------------------
  return query
  with b as (
    select 'Entry'::text as kind, t.id, t.dealer_id, d.company_name as who, t.tx_date as d, t.money_rm as amt,
      case
        when t.dealer_id is null then 'belongs to no dealer'
        when t.type <> 'adjustment' and t.points <= 0 then 'gives a dealer no points'
        when t.type <> 'adjustment' and t.money_rm < 0 then 'has a negative amount'
        when t.tx_date > v_today then 'is dated in the future'
      end as problem
    from transactions t
    left join dealers d on d.id = t.dealer_id
    union all
    select 'Credit purchase', p.id, null::uuid, null::text, p.purchase_date, p.money_rm,
      case when p.purchase_date > v_today then 'is dated in the future' end
    from credit_purchases p
  )
  select
    'sane_values'::text,
    count(*)::bigint,
    (count(*) filter (where b.problem is not null))::bigint,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'dealer_id', s.dealer_id,
        'label', s.kind || ' · ' || coalesce(s.who, 'no dealer') || ' · ' || to_char(s.d, 'DD Mon YYYY'),
        'detail', 'This entry ' || s.problem))
      from (select * from b where b.problem is not null order by b.d desc limit 5) s
    ), '[]'::jsonb)
  from b;

  -- 11. A closed month is still exactly as it was when it was closed ---------------------------
  --     Closing a month says "our verified total, less Vibe's statement, is THIS" — nothing when they
  --     matched, or the gap that was recorded and accepted. Either way the answer must not have moved
  --     since. A month closed over a gap used to be skipped altogether, which left the one kind of
  --     month most likely to be wrong unwatched.
  --
  --     Which gap was accepted is the variance opened by the LAST close, not just the latest variance:
  --     a month reopened and closed again clean leaves the older variance behind, and comparing against
  --     that would blame a correct month. The last close is the latest 'Reconciliation marked complete'
  --     revision; the variance it opened was written in the same request, a moment before. A month
  --     with no such revision (older than the audit trail) is compared against its latest variance.
  return query
  with m as (
    select cs.month, cs.company_total_points,
      coalesce((
        select sum(t.points) from transactions t
        where t.status = 'verified' and t.tx_date >= cs.month and t.tx_date < (cs.month + interval '1 month')::date
      ), 0) as sys_pts,
      (
        select max(r.created_at) from company_statement_revisions r
        where r.month = cs.month and r.note like 'Reconciliation marked complete%'
      ) as closed_at
    from company_statements cs
    where cs.reconciled is true
  ), e as (
    select m.*,
      coalesce((
        select v.gap_points from statement_variances v
        where v.month = m.month and (m.closed_at is null or v.created_at >= m.closed_at - interval '1 minute')
        order by v.created_at desc limit 1
      ), 0) as accepted_gap
    from m
  ), b as (
    select e.*,
      round(e.sys_pts - coalesce(e.company_total_points, 0), 2) as gap_now,
      (e.company_total_points is null or round(e.sys_pts - e.company_total_points, 2) <> round(e.accepted_gap, 2)) as bad
    from e
  )
  select
    'closed_months_hold'::text,
    count(*)::bigint,
    (count(*) filter (where b.bad))::bigint,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', null, 'dealer_id', null,
        'label', to_char(s.month, 'FMMonth YYYY'),
        'detail', case
          when s.company_total_points is null
            then 'Closed as reconciled, but no statement total was saved to reconcile against'
          when s.accepted_gap = 0
            then format('Closed as matching Vibe''s statement (%s pts), but the verified entries now add up to %s pts', s.company_total_points, s.sys_pts)
          else format('Closed over a recorded gap of %s pts against Vibe''s statement (%s pts), but the gap is now %s pts — the verified entries add up to %s pts',
            s.accepted_gap, s.company_total_points, s.gap_now, s.sys_pts) end))
      from (select * from b where b.bad order by b.month desc limit 5) s
    ), '[]'::jsonb)
  from b;

  -- 12. More SIM cards have not gone out than came in ------------------------------------------
  return query
  with s as (
    select st.sim_type, coalesce(i.q, 0) as intake, coalesce(o.q, 0) as sold
    from (values ('physical'), ('physical_no_number'), ('esim')) as st(sim_type)
    left join (select sim_type, sum(quantity) as q from sim_stock_intakes group by sim_type) i on i.sim_type = st.sim_type
    left join (select sim_type, sum(quantity) as q from sim_orders group by sim_type) o on o.sim_type = st.sim_type
  ), b as (
    select s.*, (s.intake - s.sold < 0) as bad from s
  )
  select
    'sim_stock_not_negative'::text,
    count(*)::bigint,
    (count(*) filter (where b.bad))::bigint,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', null, 'dealer_id', null,
        'label', 'SIM stock · ' || x.sim_type,
        'detail', format('%s cards came in and %s went out — %s more have gone out than were ever received', x.intake, x.sold, x.sold - x.intake)))
      from (select * from b where b.bad) x
    ), '[]'::jsonb)
  from b;

  -- 13. A physical SIM is always somewhere the person who ships it can see it ---------------------
  --     Two ways for a parcel to be lost: a physical SIM sale that was never put in the queue
  --     ('na'), and a row waiting to ship that the queue cannot show because it is not a physical
  --     SIM sale. 'sent' on an eSIM is harmless history and is not flagged.
  return query
  with b as (
    select t.id, t.dealer_id, d.company_name, t.tx_date, t.sim_type, t.delivery_status,
      ((t.sim_type = 'physical' and t.delivery_status = 'na')
        or (coalesce(t.sim_type, '') <> 'physical' and t.delivery_status = 'pending')) as bad
    from transactions t
    left join dealers d on d.id = t.dealer_id
    where t.type <> 'adjustment' and t.status <> 'flagged'
  )
  select
    'parcels_have_status'::text,
    count(*)::bigint,
    (count(*) filter (where b.bad))::bigint,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'dealer_id', s.dealer_id,
        'label', coalesce(s.company_name, 'Unknown dealer') || ' · ' || to_char(s.tx_date, 'DD Mon YYYY'),
        'detail', case when s.sim_type = 'physical'
          then 'A physical SIM sale that is not in the delivery queue — nobody will ever ship it'
          else 'Marked as waiting to ship, but it is not a physical SIM sale' end))
      from (select * from b where b.bad order by b.tx_date desc, b.id limit 5) s
    ), '[]'::jsonb)
  from b;

  -- 14. How much of the money has its paper (information, not an alarm) ---------------------------
  return query
  with b as (
    select t.id, t.dealer_id, d.company_name as who, t.tx_date as d, t.money_rm as amt, (t.receipt_url is null) as bad
    from transactions t
    left join dealers d on d.id = t.dealer_id
    where t.status = 'verified' and t.type <> 'adjustment'
    union all
    select p.id, null::uuid, 'Credit purchase', p.purchase_date, p.money_rm, (p.receipt_url is null)
    from credit_purchases p
    where p.adjusts_id is null
  )
  select
    'paper_trail'::text,
    count(*)::bigint,
    (count(*) filter (where b.bad))::bigint,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'dealer_id', s.dealer_id,
        'label', coalesce(s.who, 'Unknown dealer') || ' · ' || to_char(s.d, 'DD Mon YYYY'),
        'detail', format('RM %s with no receipt or slip attached', to_char(s.amt, 'FM999,999,990.00'))))
      from (select * from b where b.bad order by b.d desc, b.id limit 5) s
    ), '[]'::jsonb)
  from b;

  -- 15. A gap that a month was closed with, and that nobody has settled with Vibe -----------------
  return query
  with b as (
    select v.id, v.month, v.gap_points, v.reason, (v.resolved_at is null) as bad from statement_variances v
  )
  select
    'open_variances'::text,
    count(*)::bigint,
    (count(*) filter (where b.bad))::bigint,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'dealer_id', null,
        'label', to_char(s.month, 'FMMonth YYYY'),
        'detail', format('Closed with a gap of %s pts (%s) — still not settled', s.gap_points, s.reason)))
      from (select * from b where b.bad order by b.month desc limit 5) s
    ), '[]'::jsonb)
  from b;
end;
$$;

revoke execute on function run_system_checks() from public, anon, authenticated;
grant execute on function run_system_checks() to service_role;

-- ---------------------------------------------------------------------------------------------
-- What each run found, kept. One row per run — the nightly one and any a person asked for.
--
-- Kept so the answer to "has this been clean all month?" is a record, not a memory, and so a
-- problem that appeared last Tuesday can be dated. Not a ledger: nothing reads a run back except
-- the System Check page, and nothing is ever edited. No insert/update/delete policy exists, so the
-- only writer is the server as service_role, exactly like alert_log (0040).
create table if not exists system_check_runs (
  id          uuid primary key default gen_random_uuid(),
  ran_at      timestamptz not null default now(),
  source      text not null check (source in ('nightly', 'manual')),
  run_by      uuid references profiles(id),
  -- The interpreted result of every check, as src/lib/system-check.ts produced it: key, status,
  -- how many were looked at and how many were wrong, and the examples. Stored interpreted, not
  -- raw, because the page must show what the person was told at the time, even after the wording
  -- or a severity is later changed.
  results     jsonb not null,
  fail_count  integer not null default 0,
  warn_count  integer not null default 0
);

create index if not exists idx_system_check_runs_ran_at on system_check_runs (ran_at desc);

alter table system_check_runs enable row level security;

drop policy if exists "system_check_runs_select_finance" on system_check_runs;
create policy "system_check_runs_select_finance" on system_check_runs
  for select using ((select current_role_name()) in ('accountant', 'master'));
