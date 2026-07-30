-- Phase 30: period lock — stop an already-reconciled month from silently
-- changing underneath the reconciliation that closed it.
--
-- Marking a month reconciled (reconcile/actions.ts markReconciled) asserts
-- "our verified total for this month equals Vibe's statement." Nothing then
-- stopped a later write landing back in that month: tx_date is chosen by the
-- user ("when the sale actually happened, not when you're entering it"), so
-- backdating is both possible and normal — every one of the seeded June rows
-- was entered in July. Post a forgotten June sale in August and June's
-- verified total moves while company_statements.reconciled stays true. The
-- books now disagree with the carrier's statement and nothing says so; you
-- find out when the carrier queries it, or at audit.
--
-- Deliberately no per-transaction override flag. The accounting-software
-- convention is to *reopen the period*, make the correction, and close it
-- again — one auditable act instead of a flag on every row, and it reuses
-- the append-only company_statement_revisions log the Audit Log already
-- reads. See reopenMonth in reconcile/actions.ts.
--
-- Enforced at the DB layer, not just in the Server Actions, matching the
-- defense-in-depth pattern established by 0016 (credit-balance trigger).

create or replace function is_period_locked(d date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from company_statements
    where month = date_trunc('month', d)::date
      and reconciled is true
  );
$$;

revoke execute on function is_period_locked(date) from public, anon;
grant execute on function is_period_locked(date) to authenticated, service_role;

create or replace function enforce_period_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- What this row contributes to the figure the reconciliation actually
  -- signed off on: the sum over status='verified'. A row that isn't verified
  -- contributes nothing, so pending -> flagged moves 0 to 0 and must still be
  -- allowed inside a closed month; pending -> verified moves 0 to points and
  -- must not.
  old_pts numeric := case when TG_OP = 'UPDATE' and OLD.status = 'verified' then OLD.points   else 0 end;
  new_pts numeric := case when NEW.status = 'verified'                      then NEW.points   else 0 end;
  old_rm  numeric := case when TG_OP = 'UPDATE' and OLD.status = 'verified' then OLD.money_rm else 0 end;
  new_rm  numeric := case when NEW.status = 'verified'                      then NEW.money_rm else 0 end;
begin
  -- Updates that can't move a reconciled total pass straight through. This is
  -- what keeps ordinary work possible in a closed month: marking a SIM as
  -- sent, attaching a receipt, editing a note, or flagging a row that was
  -- never verified in the first place.
  if TG_OP = 'UPDATE'
     and NEW.tx_date is not distinct from OLD.tx_date
     and old_pts     is not distinct from new_pts
     and old_rm      is not distinct from new_rm then
    return NEW;
  end if;

  -- Inserts are blocked regardless of status. A pending row parked in a
  -- closed month contributes nothing today, but it could never be verified
  -- later without tripping this same lock — better to refuse it up front than
  -- to strand a row that can never be completed.
  if is_period_locked(NEW.tx_date) then
    raise exception 'period_locked: % is already reconciled', to_char(NEW.tx_date, 'YYYY-MM');
  end if;

  -- Moving a row *out* of a closed month changes that month's total too, so
  -- the old date has to be checked as well as the new one.
  if TG_OP = 'UPDATE' and is_period_locked(OLD.tx_date) then
    raise exception 'period_locked: % is already reconciled', to_char(OLD.tx_date, 'YYYY-MM');
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_enforce_period_lock on transactions;
create trigger trg_enforce_period_lock
  before insert or update on transactions
  for each row execute function enforce_period_lock();
