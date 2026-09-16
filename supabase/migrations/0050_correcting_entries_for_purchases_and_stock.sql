-- Phase 50: the correcting-entry pattern from 0013 (docs/research-transaction-
-- corrections.md), extended to the two other money/stock ledgers that never
-- got it — a mis-keyed credit purchase or SIM stock movement had no fix short
-- of a raw database edit. Same shape everywhere: never touch the original
-- row, post a new one that carries only the delta and points back at what it
-- corrects, with a reason. Three tables, three slightly different risks:
--
--   credit_purchases   a correction can only go wrong in one direction — a
--                       negative delta could claim back points that have
--                       already been resold, which get_credit_balance()
--                       would then report as a negative pool.
--   sim_stock_intakes  the identical risk, per SIM type instead of one shared
--                       pool.
--   sim_orders         the mirror image — an *increase* can oversell a pool
--                       that has since been drawn down further by other
--                       orders. A decrease is always safe (it frees stock).
--                       Also: sim_orders has no direct-insert RLS policy at
--                       all (0024) — every write goes through a SECURITY
--                       DEFINER function — so its correction is a new
--                       function (adjust_sim_order), not a trigger.
--
-- Also: an idempotency key on sim_orders, the same defence createTransaction
-- has had since 0013's era but create_sim_order never got — a slow-network
-- resubmit of the order form could otherwise draw down limited physical stock
-- twice.

-- ===========================================================================
-- 1) credit_purchases
-- ===========================================================================

alter table credit_purchases add column if not exists adjusts_id uuid references credit_purchases(id);
create index if not exists idx_credit_purchases_adjusts on credit_purchases (adjusts_id) where adjusts_id is not null;

-- Loosen the two non-negative checks from 0010 so a correction's negative
-- delta can be posted at all. Looked up by definition, not by name, the same
-- way 0013 did this for transactions — the original checks were declared
-- inline in the CREATE TABLE, so Postgres auto-named them. Verified against
-- production's actual stored text before writing this: numeric columns come
-- back as "money_rm >= (0)::numeric", not the bare "money_rm >= 0" this was
-- first written against — matching on the operator, not the literal, so the
-- cast wording can't matter.
do $$
declare c record;
begin
  for c in
    select con.conname from pg_constraint con join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'credit_purchases' and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%money_rm >=%'
  loop
    execute format('alter table credit_purchases drop constraint %I', c.conname);
  end loop;
end $$;
alter table credit_purchases add constraint credit_purchases_money_rm_check
  check (money_rm >= 0 or adjusts_id is not null);

do $$
declare c record;
begin
  for c in
    select con.conname from pg_constraint con join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'credit_purchases' and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%points >=%'
  loop
    execute format('alter table credit_purchases drop constraint %I', c.conname);
  end loop;
end $$;
alter table credit_purchases add constraint credit_purchases_points_check
  check (points >= 0 or adjusts_id is not null);

-- Guard: a correcting entry that removes points cannot push the shared pool
-- negative. Same advisory lock key as enforce_credit_balance (0016) on
-- purpose — pg_advisory_xact_lock is re-entrant within one transaction, and
-- the two triggers protect the same shared aggregate, so a concurrent new
-- sale and a concurrent correction have to serialize against each other too.
create or replace function enforce_credit_purchase_correction_balance()
returns trigger
language plpgsql
as $$
declare
  v_available numeric;
begin
  if NEW.adjusts_id is null or NEW.points >= 0 then
    return NEW;
  end if;

  perform pg_advisory_xact_lock(hashtext('vibe_dealer_credit_balance'));
  select available into v_available from get_credit_balance();

  if v_available + NEW.points < 0 then
    raise exception 'insufficient_credit_balance_for_correction: % pts available, % pts would be removed', v_available, abs(NEW.points);
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_enforce_credit_purchase_correction on credit_purchases;
create trigger trg_enforce_credit_purchase_correction
  before insert on credit_purchases
  for each row execute function enforce_credit_purchase_correction_balance();

-- ===========================================================================
-- 2) sim_stock_intakes
-- ===========================================================================

alter table sim_stock_intakes add column if not exists adjusts_id uuid references sim_stock_intakes(id);
create index if not exists idx_sim_stock_intakes_adjusts on sim_stock_intakes (adjusts_id) where adjusts_id is not null;

do $$
declare c record;
begin
  for c in
    select con.conname from pg_constraint con join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'sim_stock_intakes' and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%quantity%> 0%'
  loop
    execute format('alter table sim_stock_intakes drop constraint %I', c.conname);
  end loop;
end $$;
alter table sim_stock_intakes add constraint sim_stock_intakes_quantity_check
  check (quantity > 0 or adjusts_id is not null);

-- Same guard as credit_purchases, per SIM type — locked with the exact key
-- create_sim_order already uses for that type, so a correction here and a
-- concurrent order against the same pool serialize against each other.
create or replace function enforce_sim_intake_correction_balance()
returns trigger
language plpgsql
as $$
declare
  v_available integer;
begin
  if NEW.adjusts_id is null or NEW.quantity >= 0 then
    return NEW;
  end if;

  perform pg_advisory_xact_lock(hashtext('vibe_dealer_sim_stock_balance_' || NEW.sim_type));
  select available into v_available from sim_stock_balance where sim_type = NEW.sim_type;

  if coalesce(v_available, 0) + NEW.quantity < 0 then
    raise exception 'insufficient_sim_stock_for_correction: % pool, % available, % would be removed', NEW.sim_type, coalesce(v_available, 0), abs(NEW.quantity);
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_enforce_sim_intake_correction on sim_stock_intakes;
create trigger trg_enforce_sim_intake_correction
  before insert on sim_stock_intakes
  for each row execute function enforce_sim_intake_correction_balance();

-- ===========================================================================
-- 3) sim_orders — correction function, plus idempotency
-- ===========================================================================

alter table sim_orders add column if not exists adjusts_id uuid references sim_orders(id);
create index if not exists idx_sim_orders_adjusts on sim_orders (adjusts_id) where adjusts_id is not null;
alter table sim_orders add column if not exists note text;
alter table sim_orders add column if not exists idempotency_key text;
create unique index if not exists idx_sim_orders_idempotency_key on sim_orders (idempotency_key) where idempotency_key is not null;

-- sim_orders_directory (0025) names its columns explicitly rather than
-- select * — adjusts_id/note don't reach cs's own query through it until
-- it's told to carry them too. Neither is cost data, so this is the same
-- "everything non-cost" rule the view's own comment already states.
drop view if exists sim_orders_directory;
create or replace view sim_orders_directory
with (security_invoker = off) as
select
  id, dealer_id, order_date, sim_type, quantity, unit_price_rm, shipping_fee_rm,
  shipping_invoice_path, esim_codes, delivery_status, adjusts_id, note, recorded_by, delivered_by, delivered_at, created_at
from sim_orders
where current_role_name() in ('cs', 'accountant', 'master');

grant select on sim_orders_directory to authenticated;

do $$
declare c record;
begin
  for c in
    select con.conname from pg_constraint con join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'sim_orders' and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%quantity%>= 10%'
  loop
    execute format('alter table sim_orders drop constraint %I', c.conname);
  end loop;
end $$;
alter table sim_orders add constraint sim_orders_quantity_check
  check (quantity >= 10 or adjusts_id is not null);

-- 'na' for a correction row — it isn't a shipment, so pending/sent is
-- meaningless on it. Same as transactions.delivery_status for an adjustment.
alter table sim_orders drop constraint if exists sim_orders_delivery_status_check;
alter table sim_orders add constraint sim_orders_delivery_status_check
  check (delivery_status in ('pending', 'sent', 'na'));

-- adjust_sim_order: the correcting-entry counterpart to create_sim_order.
-- SECURITY DEFINER for the same reason create_sim_order is — there is no
-- direct INSERT policy on this table for anyone. Scoped to accountant/master
-- rather than create_sim_order's cs/master: placing an order is CS's
-- day-to-day job, correcting a figure already on the books is the same
-- accountant/master job it is everywhere else in this app (Transactions,
-- and credit_purchases above).
create or replace function adjust_sim_order(
  p_order_id uuid,
  p_new_quantity integer,
  p_reason text,
  p_order_date date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_original sim_orders%rowtype;
  v_delta integer;
  v_available integer;
  v_new_id uuid;
begin
  if coalesce(current_role_name(), '') not in ('accountant', 'master') then
    raise exception 'not authorized';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'a correction needs a reason';
  end if;
  if p_new_quantity is null or p_new_quantity < 0 then
    raise exception 'enter a valid quantity';
  end if;

  select * into v_original from sim_orders where id = p_order_id;
  if v_original.id is null then
    raise exception 'original order not found';
  end if;
  if v_original.adjusts_id is not null then
    raise exception 'this is already a correction — correct the original order it points to instead';
  end if;

  v_delta := p_new_quantity - v_original.quantity;
  if v_delta = 0 then
    raise exception 'that matches what is already on record — nothing to adjust';
  end if;

  -- Only an increase can oversell — mirrors create_sim_order's own check,
  -- under the same per-pool lock so it can't race a concurrent new order.
  if v_delta > 0 then
    perform pg_advisory_xact_lock(hashtext('vibe_dealer_sim_stock_balance_' || v_original.sim_type));
    select available into v_available from sim_stock_balance where sim_type = v_original.sim_type;
    if v_delta > coalesce(v_available, 0) then
      raise exception 'insufficient_sim_stock: % available, % requested', coalesce(v_available, 0), v_delta;
    end if;
  end if;

  insert into sim_orders (
    dealer_id, order_date, sim_type, quantity, unit_price_rm, unit_cost_rm,
    shipping_fee_rm, shipping_invoice_path, esim_codes, delivery_status,
    adjusts_id, note, recorded_by
  )
  values (
    v_original.dealer_id, p_order_date, v_original.sim_type, v_delta, v_original.unit_price_rm, v_original.unit_cost_rm,
    null, null, null, 'na',
    v_original.id, p_reason, auth.uid()
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

revoke execute on function adjust_sim_order(uuid, integer, text, date) from public, anon;
grant execute on function adjust_sim_order(uuid, integer, text, date) to authenticated;

-- create_sim_order gains an idempotency key, exactly like createTransaction's
-- (entry/actions.ts): a slow-network resubmit sends the same key as an
-- already-successful attempt, and that is not a real failure — the order
-- already exists, so hand back its id instead of raising. Handled inside the
-- function (rather than in the calling action, the way createTransaction
-- does it) because this is an RPC returning a value, not a plain insert the
-- caller can inspect for a 23505 itself.
create or replace function create_sim_order(
  p_dealer_id uuid,
  p_order_date date,
  p_quantity integer,
  p_shipping_fee_rm numeric,
  p_shipping_invoice_path text,
  p_sim_type text default 'physical',
  p_esim_codes text default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_available integer;
  v_new_id uuid;
  v_shipping_fee numeric;
  v_shipping_invoice_path text;
  v_esim_codes text;
  v_has_shipment boolean;
begin
  if coalesce(current_role_name(), '') not in ('cs', 'master') then
    raise exception 'not authorized';
  end if;
  if p_sim_type not in ('physical', 'physical_no_number', 'esim') then
    raise exception 'invalid sim_type';
  end if;
  if p_quantity < 10 then
    raise exception 'minimum order quantity is 10';
  end if;

  v_has_shipment := p_sim_type in ('physical', 'physical_no_number');
  if v_has_shipment then
    v_shipping_fee := p_shipping_fee_rm;
    v_shipping_invoice_path := p_shipping_invoice_path;
    v_esim_codes := null;
  else
    v_shipping_fee := null;
    v_shipping_invoice_path := null;
    v_esim_codes := p_esim_codes;
  end if;

  perform pg_advisory_xact_lock(hashtext('vibe_dealer_sim_stock_balance_' || p_sim_type));

  select available into v_available from sim_stock_balance where sim_type = p_sim_type;

  if p_quantity > coalesce(v_available, 0) then
    raise exception 'insufficient_sim_stock: % available, % requested', coalesce(v_available, 0), p_quantity;
  end if;

  insert into sim_orders (dealer_id, order_date, sim_type, quantity, unit_price_rm, unit_cost_rm, shipping_fee_rm, shipping_invoice_path, esim_codes, recorded_by, idempotency_key)
  values (p_dealer_id, p_order_date, p_sim_type, p_quantity, 3.5, 2, v_shipping_fee, v_shipping_invoice_path, v_esim_codes, auth.uid(), p_idempotency_key)
  returning id into v_new_id;

  return v_new_id;
exception
  when unique_violation then
    if p_idempotency_key is not null then
      select id into v_new_id from sim_orders where idempotency_key = p_idempotency_key;
      if v_new_id is not null then
        return v_new_id;
      end if;
    end if;
    raise;
end;
$$;

revoke execute on function create_sim_order(uuid, date, integer, numeric, text, text, text, text) from public, anon;
grant execute on function create_sim_order(uuid, date, integer, numeric, text, text, text, text) to authenticated;

-- CREATE OR REPLACE cannot change a function's argument list — adding
-- p_idempotency_key registers a second, 8-arg overload alongside the old
-- 7-arg one rather than replacing it, and PostgREST resolves an .rpc() call
-- by matching named arguments, so two overlapping overloads make that
-- resolution ambiguous. 0025 hit this exact issue going from 5 args to 7 and
-- fixed it the same way: drop the old signature once the new one exists.
drop function if exists create_sim_order(uuid, date, integer, numeric, text, text, text);
