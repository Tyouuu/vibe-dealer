-- Phase 32: two holes found in the pre-launch audit.
--
-- 1) The period lock (0031) was only ever attached to `transactions`, but the
--    Monthly Report reads four tables. `credit_purchases` is the one that
--    matters most: it drives the points ledger the report prints for the month
--    (opened with / bought from Vibe / sold to dealers / closed with, via
--    balanceSeries). A purchase backdated into a reconciled month moves that
--    ledger while company_statements.reconciled stays true — the exact failure
--    0031's own header describes, on a table it never covered.
--
--    sim_orders and sim_stock_intakes are deliberately NOT locked here. Vibe's
--    statement covers points only, so a late SIM order can't put the books at
--    odds with the carrier — and locking it would mean cs has to ask master to
--    reopen a month just to record a forgotten delivery. Friction with no
--    reconciliation benefit. Revisit if the monthly report's SIM figures ever
--    need to be immutable for their own sake.
--
-- 2) check_rate_limit (0018) counts every login attempt and never resets on a
--    successful one, so six sign-ins by the same person inside the window lock
--    them out of their own account. design-audit.mjs had been deleting the row
--    by hand before every run to get past it — a workaround standing in for
--    this fix.

-- ---------------------------------------------------------------------------
-- 1) Period lock for credit_purchases
-- ---------------------------------------------------------------------------

-- Simpler than the transactions trigger: a purchase has no status, so every
-- row counts toward its month in full the moment it exists. There is no
-- pending-contributes-nothing case to reason about.
create or replace function enforce_period_lock_credit_purchase()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Edits that can't move a month's ledger pass through, so a note can still
  -- be corrected inside a closed month — same allowance 0031 makes for
  -- attaching a receipt or editing a note on a transaction.
  if TG_OP = 'UPDATE'
     and NEW.purchase_date is not distinct from OLD.purchase_date
     and NEW.points        is not distinct from OLD.points
     and NEW.money_rm      is not distinct from OLD.money_rm then
    return NEW;
  end if;

  if is_period_locked(NEW.purchase_date) then
    raise exception 'period_locked: % is already reconciled', to_char(NEW.purchase_date, 'YYYY-MM');
  end if;

  -- Moving a purchase out of a closed month changes that month too.
  if TG_OP = 'UPDATE' and is_period_locked(OLD.purchase_date) then
    raise exception 'period_locked: % is already reconciled', to_char(OLD.purchase_date, 'YYYY-MM');
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_enforce_period_lock_credit_purchases on credit_purchases;
create trigger trg_enforce_period_lock_credit_purchases
  before insert or update on credit_purchases
  for each row execute function enforce_period_lock_credit_purchase();

-- ---------------------------------------------------------------------------
-- 2) Rate-limit reset
-- ---------------------------------------------------------------------------

-- Clearing the key after a successful sign-in is what turns check_rate_limit
-- from "5 attempts per window" into "5 *failed* attempts per window", which is
-- what a lockout is supposed to mean (OWASP's account-lockout guidance, and
-- how every consumer product behaves — signing in correctly does not spend
-- one of your tries).
--
-- security definer for the same reason check_rate_limit is: rate_limit_hits
-- has RLS on with no policies at all, so nothing reaches it except through
-- these two functions. Callable by anon because the successful sign-in it
-- follows happens before the session cookie is set.
create or replace function clear_rate_limit(p_key text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from rate_limit_hits where key = p_key;
$$;

revoke execute on function clear_rate_limit(text) from public;
grant execute on function clear_rate_limit(text) to anon, authenticated, service_role;
