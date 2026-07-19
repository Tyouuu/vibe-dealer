-- Phase 25: two follow-ups on the SIM stock feature (0024) and SIM Delivery.
--
-- 1) delivery_queue never exposed the dealer's shipping address, so CS had
--    to open the dealer detail page separately just to pack a box. Added
--    here (non-sensitive — same address dealers_directory (0015) already
--    exposes to cs elsewhere).
--    address is appended at the end, not inserted where it reads naturally
--    next to company_name — CREATE OR REPLACE VIEW can only append columns
--    at the end; it errors (SQLSTATE 42P16) if an existing column's position
--    would shift. Column order has no meaning to PostgREST/supabase-js
--    callers, which select by name (same fix as 0022).
create or replace view delivery_queue
with (security_invoker = off) as
select
  t.id,
  t.dealer_id,
  d.company_name,
  t.tx_date,
  t.type,
  t.package,
  t.sim_type,
  t.delivery_status,
  t.status,
  d.address
from transactions t
join dealers d on d.id = t.dealer_id
where t.sim_type is not null
  and current_role_name() in ('cs', 'master', 'accountant');

-- 2) eSIM follows the exact same wholesale system as physical SIM (same box-
--    of-250 intake unit, same RM2/RM3.5 pricing, same min-10 order) — the
--    only real difference is fulfillment: physical ships (shipping fee +
--    invoice + "mark as sent"), eSIM has no physical shipment, the dealer
--    just gets a code. sim_type distinguishes the two as separate stock
--    pools (a physical card can't fill an eSIM order or vice versa).
alter table sim_stock_intakes add column if not exists sim_type text not null default 'physical' check (sim_type in ('physical', 'esim'));
alter table sim_orders add column if not exists sim_type text not null default 'physical' check (sim_type in ('physical', 'esim'));
-- Not sensitive (it's what the dealer needs handed to them, same as a
-- physical card isn't "cost" data) — exposed through sim_orders_directory
-- below same as everything else non-cost on that table.
alter table sim_orders add column if not exists esim_codes text;

drop view if exists sim_orders_directory;
create or replace view sim_orders_directory
with (security_invoker = off) as
select
  id, dealer_id, order_date, sim_type, quantity, unit_price_rm, shipping_fee_rm,
  shipping_invoice_path, esim_codes, delivery_status, recorded_by, delivered_by, delivered_at, created_at
from sim_orders
where current_role_name() in ('cs', 'accountant', 'master');

grant select on sim_orders_directory to authenticated;

-- One row per sim_type, always both even with zero activity for a type yet
-- (a plain group-by would just omit a type with no rows at all, which reads
-- as "broken" rather than "zero" the first time eSIM stock is used).
drop view if exists sim_stock_balance;
create or replace view sim_stock_balance
with (security_invoker = off) as
select
  st.sim_type,
  coalesce(i.total_intake, 0)::integer as total_intake,
  coalesce(o.total_sold, 0)::integer as total_sold,
  (coalesce(i.total_intake, 0) - coalesce(o.total_sold, 0))::integer as available
from (values ('physical'), ('esim')) as st(sim_type)
left join (select sim_type, sum(quantity) as total_intake from sim_stock_intakes group by sim_type) i on i.sim_type = st.sim_type
left join (select sim_type, sum(quantity) as total_sold from sim_orders group by sim_type) o on o.sim_type = st.sim_type
where current_role_name() in ('cs', 'accountant', 'master');

grant select on sim_stock_balance to authenticated;

-- create_sim_order: now sim_type-aware. Physical/eSIM stock are separate
-- pools, so the advisory lock key includes sim_type — an eSIM order and a
-- physical order should never block each other, only two orders of the same
-- type racing for the same pool need to serialize. eSIM orders ignore
-- shipping fields (no physical shipment) and may carry esim_codes instead.
create or replace function create_sim_order(
  p_dealer_id uuid,
  p_order_date date,
  p_quantity integer,
  p_shipping_fee_rm numeric,
  p_shipping_invoice_path text,
  p_sim_type text default 'physical',
  p_esim_codes text default null
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
begin
  if coalesce(current_role_name(), '') not in ('cs', 'master') then
    raise exception 'not authorized';
  end if;
  if p_sim_type not in ('physical', 'esim') then
    raise exception 'invalid sim_type';
  end if;
  if p_quantity < 10 then
    raise exception 'minimum order quantity is 10';
  end if;

  -- eSIM has no physical shipment; physical has no codes field — each type
  -- only ever writes its own side, regardless of what the client sent.
  if p_sim_type = 'esim' then
    v_shipping_fee := null;
    v_shipping_invoice_path := null;
    v_esim_codes := p_esim_codes;
  else
    v_shipping_fee := p_shipping_fee_rm;
    v_shipping_invoice_path := p_shipping_invoice_path;
    v_esim_codes := null;
  end if;

  perform pg_advisory_xact_lock(hashtext('vibe_dealer_sim_stock_balance_' || p_sim_type));

  select available into v_available from sim_stock_balance where sim_type = p_sim_type;

  if p_quantity > coalesce(v_available, 0) then
    raise exception 'insufficient_sim_stock: % available, % requested', coalesce(v_available, 0), p_quantity;
  end if;

  insert into sim_orders (dealer_id, order_date, sim_type, quantity, unit_price_rm, unit_cost_rm, shipping_fee_rm, shipping_invoice_path, esim_codes, recorded_by)
  values (p_dealer_id, p_order_date, p_sim_type, p_quantity, 3.5, 2, v_shipping_fee, v_shipping_invoice_path, v_esim_codes, auth.uid())
  returning id into v_new_id;

  return v_new_id;
end;
$$;

revoke execute on function create_sim_order(uuid, date, integer, numeric, text, text, text) from public, anon;
grant execute on function create_sim_order(uuid, date, integer, numeric, text, text, text) to authenticated;

-- The old 5-arg signature (0024) is superseded — drop it so there's only one
-- create_sim_order to call (PostgREST resolves by exact arg match; leaving
-- both around risks the app accidentally calling the old one with no
-- sim_type and silently defaulting every order to 'physical').
drop function if exists create_sim_order(uuid, date, integer, numeric, text);
