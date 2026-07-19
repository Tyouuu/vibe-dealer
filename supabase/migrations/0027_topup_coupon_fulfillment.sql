-- Phase 25: a top-up's money can be issued partly or fully as coupons
-- instead of straight to the dealer's phone (dealer's choice, split however
-- they like) — coupon_rm is how much of money_rm went out that way. Coupons
-- are a fixed RM10 denomination (COUPON_DENOMINATION_RM, src/lib/packages.ts),
-- so coupon_rm must always be a whole multiple of it.
--
-- Deliberately NOT a separate pricing/inventory model like sim_stock_intakes/
-- sim_orders (0024) — same points/rate/commission_rm math either way, this
-- is purely a fulfillment-method annotation on the existing calculation.
alter table transactions add column if not exists coupon_rm numeric not null default 0;

alter table transactions add constraint transactions_coupon_rm_valid check (
  coupon_rm >= 0
  and coupon_rm <= money_rm
  and coupon_rm = round(coupon_rm / 10) * 10
);
