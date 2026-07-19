-- Phase 26: a third SIM stock pool — "eSIM without a number" (a data-only
-- profile, vs. regular eSIM which comes bound to a phone number). Same
-- system as physical/eSIM (0024/0025): same box-of-250 intake unit, same
-- RM2/RM3.5 pricing, same min-10 order, own separate stock pool. Like
-- regular eSIM it has no physical shipment, so it shares eSIM's esim_codes
-- field (the code is what activates either kind of eSIM profile, number or
-- not) rather than needing anything new of its own.

alter table sim_stock_intakes drop constraint if exists sim_stock_intakes_sim_type_check;
alter table sim_stock_intakes add constraint sim_stock_intakes_sim_type_check
  check (sim_type in ('physical', 'esim', 'esim_no_number'));

alter table sim_orders drop constraint if exists sim_orders_sim_type_check;
alter table sim_orders add constraint sim_orders_sim_type_check
  check (sim_type in ('physical', 'esim', 'esim_no_number'));

drop view if exists sim_stock_balance;
create or replace view sim_stock_balance
with (security_invoker = off) as
select
  st.sim_type,
  coalesce(i.total_intake, 0)::integer as total_intake,
  coalesce(o.total_sold, 0)::integer as total_sold,
  (coalesce(i.total_intake, 0) - coalesce(o.total_sold, 0))::integer as available
from (values ('physical'), ('esim'), ('esim_no_number')) as st(sim_type)
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
begin
  if coalesce(current_role_name(), '') not in ('cs', 'master') then
    raise exception 'not authorized';
  end if;
  if p_sim_type not in ('physical', 'esim', 'esim_no_number') then
    raise exception 'invalid sim_type';
  end if;
  if p_quantity < 10 then
    raise exception 'minimum order quantity is 10';
  end if;

  -- Only physical has a shipment; both eSIM variants take a code instead.
  if p_sim_type = 'physical' then
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
