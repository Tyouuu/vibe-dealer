-- The number written on the paper 0044 gave these rows somewhere to keep.
--
-- Every receiving-side guide names the same field, and this app did not have
-- it: the supplier's invoice or reference number, structured, so a payment can
-- be matched to a document without opening the document. Until now it went in
-- `note` — the SIM intake form has literally been prompting for it there since
-- day one, placeholder "e.g. 4 boxes, invoice #1234" — which means the one
-- value most worth searching by was buried in free text alongside "4 boxes".
--
-- Two columns, not five. The forms are already long enough that the owner
-- called one of them out for it, so this is the field the research actually
-- names and nothing else. Optional, like the document itself: the reference
-- arrives with the invoice, and the invoice is often later than the payment.

alter table credit_purchases  add column if not exists reference text;
alter table sim_stock_intakes add column if not exists reference text;

comment on column credit_purchases.reference is
  'Vibe Mobile''s invoice number, or the bank transfer reference. Free text — a supplier''s numbering is not ours to shape.';
comment on column sim_stock_intakes.reference is
  'The invoice number for this intake of cards.';

-- Searchable, because a reference nobody can look up is a reference nobody
-- uses. Trigram rather than btree: what a person types is a fragment of the
-- number, not the whole of it.
create extension if not exists pg_trgm;
create index if not exists idx_credit_purchases_reference on credit_purchases using gin (reference gin_trgm_ops);
create index if not exists idx_sim_stock_intakes_reference on sim_stock_intakes using gin (reference gin_trgm_ops);
