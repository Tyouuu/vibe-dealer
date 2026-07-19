-- Phase 27: correction to 0026 — the third stock pool is a physical SIM
-- card with no phone number bound to it (a data-only physical card), not an
-- eSIM variant. Renaming 'esim_no_number' -> 'physical_no_number' and, more
-- importantly, fixing create_sim_order's fulfillment branch: this type DOES
-- have a real shipment (shipping fee/invoice, mark-as-sent) like regular
-- physical — only plain 'esim' has no shipment and takes a code instead.
-- The old branch treated "not physical" as "no shipment", which was wrong
-- for this type from the moment 0026 shipped.

update sim_stock_intakes set sim_type = 'physical_no_number' where sim_type = 'esim_no_number';
update sim_orders set sim_type = 'physical_no_number' where sim_type = 'esim_no_number';

alter table sim_stock_intakes drop constraint if exists sim_stock_intakes_sim_type_check;
alter table sim_stock_intakes add constraint sim_stock_intakes_sim_type_check
  check (sim_type in ('physical', 'physical_no_number', 'esim'));

alter table sim_orders drop constraint if exists sim_orders_sim_type_check;
alter table sim_orders add constraint sim_orders_sim_type_check
  check (sim_type in ('physical', 'physical_no_number', 'esim'));

drop view if exists sim_stock_balance;
create or replace view sim_stock_balance
with (security_invoker = off) as
select
  st.sim_type,
  coalesce(i.total_intake, 0)::integer as total_intake,
  coalesce(o.total_sold, 0)::integer as total_sold,
  (coalesce(i.total_intake, 0) - coalesce(o.total_sold, 0))::integer as available
from (values ('physical'), ('physical_no_number'), ('esim')) as st(sim_type)
left join (select sim_type, sum(quantity) as total_intake from sim_stock_intakes group by sim_type) i on i.sim_type = st.sim_type
left join (select sim_type, sum(quantity) as total_sold from sim_orders group by sim_type) o on o.sim_type = st.sim_type
where current_role_name() in ('cs', 'accountant', 'master');

grant select on sim_stock_balance to authenticated;

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

  -- Both physical variants have a real shipment; only esim activates via a
  -- code with nothing to ship.
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

  insert into sim_orders (dealer_id, order_date, sim_type, quantity, unit_price_rm, unit_cost_rm, shipping_fee_rm, shipping_invoice_path, esim_codes, recorded_by)
  values (p_dealer_id, p_order_date, p_sim_type, p_quantity, 3.5, 2, v_shipping_fee, v_shipping_invoice_path, v_esim_codes, auth.uid())
  returning id into v_new_id;

  return v_new_id;
end;
$$;
