-- Phase 20: idempotency key on transaction inserts, from the audit report.
-- The concurrent-oversell race is already closed (0016), but nothing stopped
-- a slow-network retry or a double-click before React re-renders from
-- creating two separately-valid, fully-committed duplicate transactions —
-- each individually within balance, so nothing else would catch it. The
-- client generates a UUID once per form mount and sends it on every attempt;
-- a retry with the same key hits this unique index instead of inserting a
-- second row.
alter table transactions add column if not exists idempotency_key uuid;
create unique index if not exists idx_transactions_idempotency_key on transactions (idempotency_key) where idempotency_key is not null;
