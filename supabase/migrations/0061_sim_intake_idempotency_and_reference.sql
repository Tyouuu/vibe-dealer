-- Phase 61: a SIM stock intake pressed twice is one intake, and the same supplier invoice is one intake.
--
-- Log SIM Stock has two forms on it. The order form (cards going OUT to a dealer) has carried an idempotency
-- key since 0025, so a retry cannot ship the same parcel twice. The intake form (cards coming IN from Vibe)
-- had neither that nor anything to catch the same invoice keyed in a second time. A doubled intake is not a
-- cosmetic slip: it adds cards to the stock balance that were never received, and stock is what every order
-- is checked against — the business can then promise a dealer cards it does not physically have. The stock
-- balance has no way to notice, because each row looks perfectly ordinary by itself.
--
-- 1) idempotency_key — the same thing 0020 (staff sales), 0059 (dealer requests) and 0060 (credit purchases)
--    do. The form makes an id once when it opens and sends it with every attempt; the same id twice is the
--    same intake, and the database says so, not just the action. Nullable: every intake before this has none.
alter table sim_stock_intakes add column if not exists idempotency_key uuid;

create unique index if not exists idx_sim_stock_intakes_idempotency_key
  on sim_stock_intakes (idempotency_key)
  where idempotency_key is not null;

comment on column sim_stock_intakes.idempotency_key is
  'Made by the Log SIM Stock intake form when it opens and sent with every attempt to save. The same key twice is one intake pressed twice.';

-- 2) reference_key — the invoice number as a machine compares it, exactly as 0057 does for credit purchases
--    and dealer entries (letters and digits only, lower-cased, kept in step by the database itself). The
--    invoice number on an intake is Vibe's, and the same invoice logged twice is the retyped case an
--    idempotency key cannot see: two forms, two keys, one delivery.
alter table sim_stock_intakes add column if not exists reference_key text
  generated always as (lower(regexp_replace(coalesce(reference, ''), '[^a-zA-Z0-9]', '', 'g'))) stored;

create index if not exists idx_sim_stock_intakes_reference_key
  on sim_stock_intakes (reference_key) where length(reference_key) >= 8;
