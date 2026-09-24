-- Phase 57: a dealer's top-up can carry the number printed on the slip it came from.
--
-- A credit purchase (0045) and a SIM intake (0045) have kept the supplier's invoice or transfer
-- reference since Phase 45. The money coming IN from dealers — the entries that move points out
-- of the credit balance — never had anywhere to keep the bank's transfer reference, so a payment
-- was recorded as an amount and a date, and nothing could tell "RM 500 from Ali on the 14th"
-- apart from the same slip typed in twice.
--
-- The reference is what makes a payment countable exactly once. A bank prints a different one on
-- every transfer; the same reference on two entries is one payment recorded twice — points handed
-- out twice for money received once. That is the mistake a busy afternoon of copying amounts off
-- WhatsApp screenshots produces, and it is invisible in every total: the balance is simply lower
-- than it should be, and each of the two entries looks perfectly ordinary by itself.
--
-- Optional, like every piece of paper here: cash has no reference, and a reference that arrives
-- later must not stop the entry being recorded. It is written at insert time only — a verified row
-- can no longer be edited (0017), which is what keeps the reference honest once it is there.
--
-- Trigram-indexed for the same reason 0045's are: what someone types to look a payment up is a
-- fragment of the number, not the whole of it.

alter table transactions add column if not exists reference text;

alter table transactions drop constraint if exists transactions_reference_length;
alter table transactions add constraint transactions_reference_length
  check (reference is null or length(reference) <= 80);

comment on column transactions.reference is
  'The bank transfer reference printed on the payment slip this entry was made from. Free text. The same reference on two entries is the same payment recorded twice, which the nightly system check flags.';

-- The reference as a machine compares it. People and banks write the same number several ways —
-- "FT26091412345678", "ft 2609-1412345678" — and a duplicate check that only catches identical text
-- catches the copy-paste and misses the retype, which is the case that matters. reference_key is the
-- reference with everything but letters and digits removed, lower-cased, kept in step by the database
-- itself (a generated column cannot drift from what it is generated from).
--
-- Also on credit_purchases, whose `reference` (0045) is Vibe's invoice number: the same invoice logged
-- twice puts credit in the ledger that was only ever bought once, and credit that does not exist is
-- the one error that lets the business sell what it does not have.
alter table transactions add column if not exists reference_key text
  generated always as (lower(regexp_replace(coalesce(reference, ''), '[^a-zA-Z0-9]', '', 'g'))) stored;
alter table credit_purchases add column if not exists reference_key text
  generated always as (lower(regexp_replace(coalesce(reference, ''), '[^a-zA-Z0-9]', '', 'g'))) stored;

-- Only keys long enough to be a real bank reference are worth looking up. A bank's own reference runs to
-- ten digits or more; "ref 5512" typed on two entries is a shorthand, not a duplicate.
create index if not exists idx_transactions_reference_key on transactions (reference_key) where length(reference_key) >= 8;
create index if not exists idx_credit_purchases_reference_key on credit_purchases (reference_key) where length(reference_key) >= 8;

create extension if not exists pg_trgm;
create index if not exists idx_transactions_reference on transactions using gin (reference gin_trgm_ops);
