-- Phase 60: a credit purchase pressed twice is one purchase, and a failed system check can reach a phone.
--
-- 1) credit_purchases.idempotency_key
--
-- A staff sale has carried one since 0020, and a dealer's request since 0059. The Log Purchase form had
-- neither: it relied on the button greying out once pressed, and on the reference check (0057) refusing a
-- second entry with the same invoice number — which only helps when a reference was typed. On a phone with
-- poor signal, a save that seems not to have gone through is retried; with no reference that is a second
-- purchase, and a second purchase is credit in the ledger that was only ever bought once. Of all the
-- double-entries this is the dangerous one, because the extra credit lets the business sell points it does
-- not have.
--
-- The form makes an id once when it opens and sends it with every attempt. The same id twice is the same
-- purchase, and the database says so, not just the action. Nullable: every purchase made before this has
-- none, and one sent from an old copy of the page must still be accepted.
alter table credit_purchases add column if not exists idempotency_key uuid;

create unique index if not exists idx_credit_purchases_idempotency_key
  on credit_purchases (idempotency_key)
  where idempotency_key is not null;

comment on column credit_purchases.idempotency_key is
  'Made by the Log Purchase form when it opens and sent with every attempt to save. The same key twice is one purchase pressed twice.';

-- 2) push_events may claim a system-check alert
--
-- push_events is "this has already been announced" (0053): one row per thing, so a repeat stays quiet.
-- A failed morning check is announced once a day, so its ref_id is derived from the date. Widening the
-- list of kinds is the only change; nothing already in the table is touched.
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'push_events' and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%ref_kind%'
  loop
    execute format('alter table push_events drop constraint %I', c.conname);
  end loop;
end $$;

alter table push_events add constraint push_events_ref_kind_check
  check (ref_kind in ('sim_order', 'package_sale', 'system_check'));
