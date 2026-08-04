-- Phase 34: downward corrections were impossible to post.
--
-- 0028 added `coupon_rm <= money_rm`, which is the right rule for a sale: a
-- coupon is a portion of the money collected, so it cannot exceed it. It was
-- written with only sales in mind.
--
-- A correction (type = 'adjustment') is not a sale. It carries the *delta*
-- against the transaction it points at, so when the accountant corrects an
-- amount downwards — dealer was overcharged RM188, refunded — money_rm is
-- negative. coupon_rm defaults to 0, and `0 <= -188` is false, so Postgres
-- refused the insert. Reproduced through the real form: the dialog previewed
-- "Posts a correction of -200 pts · -RM 188.00", the insert was rejected, and
-- the screen said "Something went wrong … please try again" — which invites
-- someone to keep retrying an operation that can never succeed. Upward
-- corrections worked, so this hid behind the half of the feature that did.
--
-- The bound now applies only to rows that actually carry a coupon, which is
-- what the rule was always about. Rows with no coupon are no longer measured
-- against a rule that was never meant for them.
--
-- The third clause is new and deliberate: a correction is a delta, never a
-- fulfillment method, so it must not carry a coupon at all. Without it, the
-- relaxed first clause would leave a gap where a negative row could be given
-- a coupon amount that no longer has to be within the money.
alter table transactions drop constraint if exists transactions_coupon_rm_valid;
alter table transactions add constraint transactions_coupon_rm_valid check (
  coupon_rm >= 0
  and (coupon_rm = 0 or coupon_rm <= money_rm)
  and coupon_rm = round(coupon_rm / 10) * 10
  and (type <> 'adjustment' or coupon_rm = 0)
);
