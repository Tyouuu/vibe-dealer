-- Phase 24: SIM card wholesale inventory — a distinct business from the
-- points/topup ledger. Vibe Mobile sells physical SIM cards to the master
-- dealer in bulk (a box of 250) at a flat per-unit cost; dealers then buy
-- cards from the master dealer in batches (minimum 10) at a flat markup.
-- This is a unit-cost/unit-price wholesale business, not a %-rate commission
-- one — kept deliberately separate from transactions/credit_purchases and
-- out of Monthly Report/Reconciliation for now (explicit product decision;
-- revisit if/when the two need to reconcile against the same P&L).
--
-- Two tables:
--   sim_stock_intakes — stock IN, recording a purchase from Vibe Mobile.
--   sim_orders        — stock OUT, a dealer buying a batch of cards.
-- available balance = sum(intakes.quantity) - sum(orders.quantity), always
-- computed live (sim_stock_balance view) rather than a stored counter, so it
-- can never drift out of sync with its own ledger — same reasoning as
-- get_credit_balance() (0016) for the points side.

create table sim_stock_intakes (
  id uuid primary key default gen_random_uuid(),
  intake_date date not null,
  quantity integer not null check (quantity > 0),
  cost_per_unit_rm numeric not null check (cost_per_unit_rm >= 0),
  note text,
  recorded_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

alter table sim_stock_intakes enable row level security;

-- Cost data (what the master dealer actually pays Vibe) is finance-only,
-- same split as dealers.rate — cs never sees supplier cost.
create policy "sim_stock_intakes_select_finance" on sim_stock_intakes
  for select using (current_role_name() in ('accountant', 'master'));
create policy "sim_stock_intakes_insert_finance" on sim_stock_intakes
  for insert with check (current_role_name() in ('accountant', 'master') and recorded_by = auth.uid());

create table sim_orders (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references dealers(id),
  order_date date not null,
  quantity integer not null check (quantity >= 10),
  unit_price_rm numeric not null,
  unit_cost_rm numeric not null,
  shipping_fee_rm numeric check (shipping_fee_rm is null or shipping_fee_rm >= 0),
  shipping_invoice_path text,
  delivery_status text not null default 'pending' check (delivery_status in ('pending', 'sent')),
  recorded_by uuid not null references profiles(id),
  delivered_by uuid references profiles(id),
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

alter table sim_orders enable row level security;

-- Base table carries unit_cost_rm (and therefore margin) — finance-only
-- direct SELECT, matching the dealers/dealers_directory split (0015). cs
-- reads through sim_orders_directory below instead. No direct INSERT/UPDATE
-- policy for anyone: every write goes through the SECURITY DEFINER
-- functions below (same pattern as update_dealer_profile, 0021) so cs's
-- path to creating/fulfilling an order never touches unit_cost_rm at all,
-- and stock-balance safety (below) can't be bypassed by a raw insert.
create policy "sim_orders_select_finance" on sim_orders
  for select using (current_role_name() in ('accountant', 'master'));

create or replace view sim_orders_directory
with (security_invoker = off) as
select
  id, dealer_id, order_date, quantity, unit_price_rm, shipping_fee_rm,
  shipping_invoice_path, delivery_status, recorded_by, delivered_by, delivered_at, created_at
from sim_orders
where current_role_name() in ('cs', 'accountant', 'master');

grant select on sim_orders_directory to authenticated;

-- Quantities alone (no cost, no price) aren't sensitive the way rate/margin
-- is — cs needs to know "is there enough stock" to promise a dealer a
-- batch, so this is readable by all three staff roles.
create or replace view sim_stock_balance
with (security_invoker = off) as
select
  coalesce((select sum(quantity) from sim_stock_intakes), 0)::integer as total_intake,
  coalesce((select sum(quantity) from sim_orders), 0)::integer as total_sold,
  (coalesce((select sum(quantity) from sim_stock_intakes), 0)
    - coalesce((select sum(quantity) from sim_orders), 0))::integer as available
where current_role_name() in ('cs', 'accountant', 'master');

grant select on sim_stock_balance to authenticated;

-- create_sim_order: the only path that inserts a row. Stamps unit_price_rm/
-- unit_cost_rm server-side (3.5 / 2 — see src/lib/sim-stock.ts for the same
-- constants used to render them) rather than trusting client input, and
-- enforces both the minimum-order-quantity rule and the stock-availability
-- check under an advisory lock — same TOCTOU fix as enforce_credit_balance
-- (0016): without the lock, two concurrent orders could each read the same
-- "available" number and together oversell past what's actually in stock.
create or replace function create_sim_order(
  p_dealer_id uuid,
  p_order_date date,
  p_quantity integer,
  p_shipping_fee_rm numeric,
  p_shipping_invoice_path text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_available integer;
  v_new_id uuid;
begin
  if coalesce(current_role_name(), '') not in ('cs', 'master') then
    raise exception 'not authorized';
  end if;
  if p_quantity < 10 then
    raise exception 'minimum order quantity is 10';
  end if;

  perform pg_advisory_xact_lock(hashtext('vibe_dealer_sim_stock_balance'));

  select available into v_available from sim_stock_balance;

  if p_quantity > coalesce(v_available, 0) then
    raise exception 'insufficient_sim_stock: % available, % requested', coalesce(v_available, 0), p_quantity;
  end if;

  insert into sim_orders (dealer_id, order_date, quantity, unit_price_rm, unit_cost_rm, shipping_fee_rm, shipping_invoice_path, recorded_by)
  values (p_dealer_id, p_order_date, p_quantity, 3.5, 2, p_shipping_fee_rm, p_shipping_invoice_path, auth.uid())
  returning id into v_new_id;

  return v_new_id;
end;
$$;

revoke execute on function create_sim_order(uuid, date, integer, numeric, text) from public, anon;
grant execute on function create_sim_order(uuid, date, integer, numeric, text) to authenticated;

create or replace function mark_sim_order_sent(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_role_name(), '') not in ('cs', 'master') then
    raise exception 'not authorized';
  end if;

  update sim_orders
  set delivery_status = 'sent', delivered_by = auth.uid(), delivered_at = now()
  where id = p_order_id and delivery_status = 'pending';
end;
$$;

revoke execute on function mark_sim_order_sent(uuid) from public, anon;
grant execute on function mark_sim_order_sent(uuid) to authenticated;

-- Shipping invoices: a new bucket rather than reusing `receipts` (0002),
-- which is finance-only (insert+select restricted to accountant/master) —
-- this needs cs to upload, since cs is who actually ships the order.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sim-shipping-invoices', 'sim-shipping-invoices', false, 10 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'])
on conflict (id) do nothing;

create policy "sim_shipping_invoices_insert_staff" on storage.objects
  for insert with check (bucket_id = 'sim-shipping-invoices' and current_role_name() in ('cs', 'master'));
create policy "sim_shipping_invoices_select_staff" on storage.objects
  for select using (bucket_id = 'sim-shipping-invoices' and current_role_name() in ('cs', 'accountant', 'master'));
