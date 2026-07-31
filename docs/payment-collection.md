# Collecting dealer payments by payment link

**Status: deferred — long-term.** Not scheduled, no code written. Recorded so
the analysis (especially the fee math) doesn't have to be redone.

Raised 2026-07-31, after the Northern Event List showed every order carrying a
`payment.swifs.io` link and a payment ID. Those links belong to the event/Vibe
side — the money lands in *their* account, not ours — so they are only a
reference number to us. The question they prompted is a separate one: should
*we* start collecting dealer payments by link instead of bank transfer plus a
WhatsApped receipt?

---

## The decision that constrains everything: flat-fee rails only

Master's margin is thin, and payment fees are charged on the *collected*
amount, not on the margin.

Package C: the dealer pays **RM 1,270**, receives 1,000 points, and master
earns **RM 20** (`PACKAGES.C` in `src/lib/packages.ts`, `commission_rm` on the
transaction). That is **1.57% of the amount collected**.

| Rail | Fee on a RM 1,270 order | Against RM 20 commission |
|---|---|---|
| FPX / DuitNow — **flat**, typically ~RM 1 | ~RM 1 | 5% of it |
| Card — **percentage**, 2–3% | ~RM 32 | **a RM 12 loss** |

It does not improve with size, because both sides scale together. A 10,000-pt
top-up collects RM 9,400 and earns RM 200; a 2.5% card fee is RM 235 — still a
loss on every single transaction.

**So: FPX and DuitNow only. Cards must be switched off at the gateway.** This
isn't cost control, it's arithmetic — a percentage rail cannot fit inside a
1.57% margin. (Confirm current rates when the time comes; the bands above are
typical, not quoted.)

---

## What would have to happen

### Before any code — theirs, not ours

1. **Pick a gateway.** Billplz, ToyyibPay, Curlec, iPay88 are the common
   Malaysian options. Swifs is worth asking about first: the event side already
   uses it, so there may be an existing relationship and rate.
2. **Open the merchant account. This is the critical path** — SSM registration,
   company bank account, approval, typically 1–3 weeks. The build is 2–3 days.
   Start the account, not the code.
3. **Decide who creates the link** — CS generates and WhatsApps it (recommended)
   or dealers self-serve (see "Not doing" below).

### The build

**Migration.** A `payment_links` table, *not* columns on `transactions` — one
transaction can go through several link attempts (first expires, second is
paid):

```sql
create table payment_links (
  id             uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id),
  gateway        text not null,
  gateway_ref    text not null,
  url            text not null,
  amount_rm      numeric(12,2) not null,
  status         text not null default 'awaiting',  -- awaiting|paid|failed|expired
  created_by     uuid not null references profiles(id),
  created_at     timestamptz not null default now(),
  paid_at        timestamptz,
  raw_payload    jsonb,        -- the gateway's own callback; the only truth if this ever goes wrong
  unique (gateway, gateway_ref)
);
```

That `unique` constraint is the whole duplicate-posting defence. Gateways
re-send callbacks as a matter of course.

**Creating the link.** `entry-form.tsx` gains a collection-method choice
beside the existing receipt upload. `createTransaction` still inserts the
transaction as `pending`; the gateway call and the `payment_links` row happen
alongside it.

**The trap here, which must be designed in from the start:** the credit-balance
oversell block runs at creation time (`src/app/(app)/entry/actions.ts`, the
`getAvailablePointsBalance` check). Between generating a link and the dealer
actually paying, that balance can be consumed by someone else. When the money
then arrives there is nothing to sell — **and the payment cannot be refused,
it's already taken.** Mitigation: short link expiry (~2 hours) plus a second
balance check inside the webhook; if it fails, don't auto-post — flag it for a
human. Retrofitting this later means discovering it in production with a
dealer's money already in the account.

**The webhook** — `src/app/api/payments/webhook/route.ts`. Four requirements,
none optional:

1. **Add it to the `proxy.ts` matcher exclusions**, exactly as the Sentry
   `monitoring` tunnel needed. Miss this and the auth middleware answers the
   gateway with a 307: money collected, nothing posted, no error anywhere.
2. **Verify the HMAC signature.** Without it anyone can forge a "paid" callback
   and walk off with points. This is the most dangerous endpoint in the app.
3. **Never trust the amount in the callback.** Re-fetch by `gateway_ref` from
   the gateway's API and compare against `payment_links.amount_rm`.
4. **Be idempotent and answer 200 fast.** The unique constraint above handles
   the first; an already-`paid` ref returns 200 immediately. Slow replies get
   retried.

On success: mark the link `paid`, move the transaction `pending → verified`,
and write an audit event recording that a payment callback posted it rather
than a person.

**UI.** Payment state on the Transactions list; the reference and a re-send
control on the transaction; a return page the dealer lands on after paying.

### Where the actual value is

Not the fees — **reconciliation**. With a payment reference on every
transaction, the monthly close can match against the gateway's settlement
report line by line. That is the Difference figure on the Reconciliation page
going from "someone compares receipts by hand" to "matched automatically."

---

## Not doing

- **Dealer self-service login.** 242 external accounts, per-dealer RLS, password
  resets, support. CS generating a link and sending it over WhatsApp gets the
  same result at near-zero cost.
- **Building our own payment processing.** Once money passes through this
  system rather than being recorded by it, the whole invoicing/tax question
  (see the MyInvois discussion) lands on us. Use a gateway; store the reference.

---

## What decides whether this is worth it

One number nobody has measured yet: **how many hours a week CS spends checking
bank-transfer receipts.** If it's hours, the time saved plus automated
reconciliation pays back 2–3 days of work quickly. If receipts are checked at a
glance, the current upload flow is already adequate and this should stay shelved.
