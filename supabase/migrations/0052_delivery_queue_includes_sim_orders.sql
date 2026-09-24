-- Phase 52: a SIM order was invisible to the person who has to ship it.
--
-- delivery_queue is what every "something is waiting to be sent" surface reads —
-- the sidebar badge, the dashboard band, /delivery, Notifications, a dealer's own
-- page — and it only ever listed package sales that carry a physical SIM. A
-- direct SIM card order (sim_orders, RM3.50 a card, placed on Log SIM Stock)
-- lands with delivery_status = 'pending' just the same, but appeared in none of
-- them: the only place it showed was the Stock out list on SIM Card Stock, so
-- whoever ships had to remember to go and look. Driving the real order form end
-- to end found it: 10 cards ordered, stock down by 10, and the Delivery queue and
-- the notification centre both silent.
--
-- One queue, then. The order rows are appended as a second branch of the same
-- view rather than a second view every consumer would have to merge by hand.
--
--   * The first ten columns are unchanged, in order and type, so every existing
--     select keeps working. `source` and `quantity` are added at the end.
--   * Only physical cards. An eSIM order is instant and 'na', and thousands of
--     them would bury the history tab; a correction row (adjusts_id set) is a
--     ledger entry, not a parcel.
--   * status is the constant 'verified': the queue's own filter drops flagged
--     transactions, and an order has no review state to be flagged in.
--   * Still security_invoker = off, gated by current_role_name(): cs cannot read
--     the sim_orders base table (it carries unit cost) but may see that a parcel
--     is owed, which is all this exposes.
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
  d.address,
  'sale'::text as source,
  null::integer as quantity
from transactions t
join dealers d on d.id = t.dealer_id
where t.sim_type is not null
  and current_role_name() in ('cs', 'master', 'accountant')
union all
select
  o.id,
  o.dealer_id,
  d.company_name,
  o.order_date as tx_date,
  'sim_order'::text as type,
  null::text as package,
  o.sim_type,
  o.delivery_status,
  'verified'::text as status,
  d.address,
  'order'::text as source,
  o.quantity
from sim_orders o
join dealers d on d.id = o.dealer_id
where o.adjusts_id is null
  and o.sim_type in ('physical', 'physical_no_number')
  and o.delivery_status in ('pending', 'sent')
  and current_role_name() in ('cs', 'master', 'accountant');

grant select on delivery_queue to authenticated;
