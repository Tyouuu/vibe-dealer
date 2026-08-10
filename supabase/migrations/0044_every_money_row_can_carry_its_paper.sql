-- Somewhere to keep the paper for the money going the other way.
--
-- A dealer sale has kept its receipt since 0000 (`transactions.receipt_url`),
-- and a SIM order sold to a dealer has kept its shipping invoice since 0024.
-- Every payment the business *makes*, and the statement it reconciles against,
-- has been recorded as a number with nobody able to attach what it came from:
--
--   credit_purchases    tens of thousands of ringgit paid to Vibe for points,
--                       the single largest amount this business moves
--   sim_stock_intakes   the cards bought from Vibe at RM2, which is the cost
--                       side of the only margin the master dealer keeps
--   company_statements  Vibe's own monthly figures — a month is signed off
--                       against this and then the document is gone, so a
--                       reconciliation cannot be re-checked against what it
--                       was actually reconciled to
--
-- Every one of those is a figure someone may have to defend months later, and
-- "it says so in the system" is not the same answer as the invoice.
--
-- Optional, all three. The paperwork often arrives after the payment, and a
-- required field would either stop the entry being recorded at all or invite a
-- placeholder — which is worse than an honest blank, because a blank can be
-- chased and a placeholder cannot be told from the real thing.
--
-- Same shape and same bucket as the two that already exist: a storage path
-- into the private `receipts` bucket, read back through the existing
-- signed-URL route. Nothing new becomes publicly readable.

alter table credit_purchases   add column if not exists receipt_url text;
alter table sim_stock_intakes  add column if not exists receipt_url text;
alter table company_statements add column if not exists receipt_url text;

comment on column credit_purchases.receipt_url is
  'Vibe Mobile''s invoice or the bank transfer slip for this batch of credit. Storage path in the private receipts bucket.';
comment on column sim_stock_intakes.receipt_url is
  'The invoice for this intake of SIM cards. Storage path in the private receipts bucket.';
comment on column company_statements.receipt_url is
  'The statement itself, as Vibe sent it. Storage path in the private receipts bucket.';

-- The finance views hand these tables to the app; both need the new column or
-- the page cannot read back what it just wrote.
--
-- Appended at the end rather than beside the related columns: create or
-- replace view cannot reorder existing columns (42P16), and PostgREST callers
-- select by name — same reasoning as 0022/0023/0030/0042.
do $$
begin
  if to_regclass('public.sim_stock_intakes_directory') is not null then
    execute $v$
      create or replace view sim_stock_intakes_directory
      with (security_invoker = off) as
      select id, intake_date, sim_type, quantity, note, recorded_by, created_at, receipt_url
      from sim_stock_intakes
      where current_role_name() in ('accountant', 'master')
    $v$;
  end if;
end $$;
