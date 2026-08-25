-- Phase 46: the receipt a dealer attaches gets read, not just stored.
--
-- Since 0042 a dealer can submit a request with a transfer slip, and since
-- then the slip has gone into the private `receipts` bucket and been looked
-- at by nobody. Whoever reviews the request opens the image in another tab
-- and compares the amount with their eyes.
--
-- The duplicate detector on /requests is the sharper reason. It keys on
-- (dealer, amount, paid_from) — and `paid_from` is a free-text line the
-- DEALER types. A dealer who mistypes the reference, leaves it blank, or
-- pastes a different one each time defeats it completely. The reference read
-- off the slip itself is the one nobody can fudge.
--
-- Stored rather than read on the fly: the read costs a model call, the answer
-- never changes for a given image, and a reviewer coming back to a request
-- should see the same figures the first reviewer saw.
alter table topup_requests add column if not exists slip_amount_rm numeric;
alter table topup_requests add column if not exists slip_paid_on   date;
alter table topup_requests add column if not exists slip_bank      text;
alter table topup_requests add column if not exists slip_reference text;
alter table topup_requests add column if not exists slip_read_at   timestamptz;

-- A failed read is recorded, not left as an absence. "We tried and the image
-- was unreadable" and "nobody has tried yet" lead to different actions, and
-- the review screen has to be able to tell them apart — the same distinction
-- vision-extract.ts was written around.
alter table topup_requests add column if not exists slip_read_error text;

comment on column topup_requests.slip_amount_rm is 'Amount read off the attached slip. NULL = not read, or not found on the slip.';
comment on column topup_requests.slip_reference is 'Reference read off the slip itself — unlike paid_from, the dealer did not type this.';
comment on column topup_requests.slip_read_error is 'Why the last read failed. NULL with slip_read_at set means it succeeded.';

-- Who may write these. Reading a slip is a review action, so the same two
-- roles that decide a request. cs is deliberately excluded: a slip carries
-- amounts, and cs has no financial visibility (PROJECT_SPEC section 4).
--
-- SECURITY DEFINER for the same reason update_dealer_profile (0021) is: the
-- table's UPDATE policy is written for the decide/reject flow, and widening
-- it to cover six more columns would loosen that policy for every caller.
create or replace function record_slip_reading(
  p_request_id uuid,
  p_amount_rm numeric,
  p_paid_on date,
  p_bank text,
  p_reference text,
  p_error text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_role_name(), '') not in ('accountant', 'master') then
    raise exception 'not authorized';
  end if;
  update topup_requests set
    slip_amount_rm  = p_amount_rm,
    slip_paid_on    = p_paid_on,
    slip_bank       = nullif(trim(coalesce(p_bank, '')), ''),
    slip_reference  = nullif(trim(coalesce(p_reference, '')), ''),
    slip_read_at    = now(),
    slip_read_error = nullif(trim(coalesce(p_error, '')), '')
  where id = p_request_id;
end;
$$;

revoke execute on function record_slip_reading(uuid, numeric, date, text, text, text) from public, anon;
grant execute on function record_slip_reading(uuid, numeric, date, text, text, text) to authenticated, service_role;
