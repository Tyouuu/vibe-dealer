-- Two changes the owner asked for after using the thing:
--   1. one person may both record and verify — there is no second person
--   2. a dealer's request carries enough to be accepted without asking again

-- ------------------------------------------- 1. one person signs it off
--
-- 0041 required a correction to be verified by someone other than whoever
-- posted it. That is the right control for a finance team; this is not one.
-- The business runs on two or three people and there are days when only the
-- owner is at a desk, so the rule does not produce a second pair of eyes —
-- it produces a correction that sits pending until someone else logs in, and
-- eventually a workaround.
--
-- What survives is rule 1 of 0041, and it is the half that was actually load
-- bearing: `verified_by` is whoever is signed in, never a uuid the caller
-- typed. Without it, "verified by the master" is a claim anyone with an API
-- token can write into the audit trail. The headcount rule is dropped; the
-- forgery rule is not.
--
-- Nothing is lost from the record. recorded_by and verified_by are both still
-- written, so a row signed off by its own author says so plainly and anyone
-- reading the ledger later can see exactly that.

create or replace function enforce_sign_off_is_yourself()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Only the moment a row becomes verified. Flagging it, attaching a receipt,
  -- marking a SIM sent, editing a note — none of that is this trigger's
  -- business, and a trigger that fires on work it has no opinion about is a
  -- trigger someone eventually disables.
  if NEW.status is distinct from 'verified' then
    return NEW;
  end if;
  if TG_OP = 'UPDATE' and OLD.status = 'verified' then
    return NEW;
  end if;

  -- No end user behind this request: the service role, which is the seed, the
  -- restore script and the cron. They write verified rows on purpose and have
  -- no auth.uid() to check a signature against.
  if auth.uid() is null then
    return NEW;
  end if;

  if NEW.verified_by is distinct from auth.uid() then
    raise exception 'sign_off_not_yours: a transaction is signed off by the person doing it, not on their behalf';
  end if;

  return NEW;
end;
$$;

revoke execute on function enforce_sign_off_is_yourself() from public, anon, authenticated;

drop trigger if exists trg_enforce_sign_off_is_a_second_person on transactions;
create trigger trg_enforce_sign_off_is_yourself
  before insert or update on transactions
  for each row
  execute function enforce_sign_off_is_yourself();

-- Dropped after the trigger that used it is gone, so a re-run of this file
-- never leaves the table briefly unguarded.
drop function if exists enforce_sign_off_is_a_second_person();

-- --------------------------------------- 2. the request carries the details
--
-- 0042 collected an amount, a note and a slip. That is enough to know what a
-- dealer wants and not enough to record it: whoever accepts still has to work
-- out which date the sale belongs to, which bank the money came from, and —
-- for a package — whether the SIMs are physical or eSIM. Every one of those
-- is something the dealer knows and staff have to ask for.
--
-- These are the three, and deliberately only three. The point of the link is
-- that a request arrives ready to save; the point of it being a link a shop
-- owner opens on a phone is that it stays short.

-- When the money actually moved. /entry has always taken tx_date because a
-- sale is dated when it happened, not when it was keyed in — this is the same
-- field, filled in by the person who knows the answer.
alter table topup_requests add column if not exists transfer_date date;

-- "Maybank 9:42am, ref 5512" — one line, free text, because a dealer types
-- whatever their banking app showed them and a structured reference field
-- would just be a box they leave empty. It goes into the transaction note on
-- accept, which is where staff look when they are matching a statement.
alter table topup_requests add column if not exists paid_from text;

-- Only meaningful on a package: a top-up ships nothing.
alter table topup_requests add column if not exists sim_type text;

alter table topup_requests drop constraint if exists request_sim_type_is_for_packages;
alter table topup_requests add constraint request_sim_type_is_for_packages check (
  sim_type is null or (type = 'package' and sim_type in ('physical', 'esim'))
);

-- A transfer cannot have happened tomorrow. Nothing stops it being dated last
-- month — backdating is normal here, and /entry's period lock is what decides
-- whether a stale date can still be recorded.
alter table topup_requests drop constraint if exists request_transfer_date_is_not_future;
alter table topup_requests add constraint request_transfer_date_is_not_future check (
  transfer_date is null or transfer_date <= (now() at time zone 'Asia/Kuala_Lumpur')::date
);

comment on column topup_requests.transfer_date is 'When the dealer says the money moved. Becomes transactions.tx_date on accept.';
comment on column topup_requests.paid_from is 'Bank and reference, in the dealer''s own words. Folded into the transaction note on accept.';
comment on column topup_requests.sim_type is 'Physical or eSIM, for package requests only.';
