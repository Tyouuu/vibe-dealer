-- Phase 59: a dealer pressing Send twice is one request, not two.
--
-- The dealer's link is used on a phone, over mobile data, often from inside a shop with poor signal. A
-- request that does not seem to have gone is the most natural thing in the world to send again — and until
-- now the second press was a second request: two rows in the inbox, and two slips in the bucket. Someone
-- accepting both credits the dealer twice, and the only thing standing between the two is a reviewer
-- noticing they look alike (the "looks like a repeat" marker on /requests, which keys on the amount and a
-- line the dealer types).
--
-- The form now makes an id once when it opens and sends it with every attempt. The same id twice is the
-- same request, and the database says so — not just the action, because the action is a courtesy and the
-- index is the rule. Exactly what transactions.idempotency_key (0020) does for a staff entry.
--
-- Nullable: every request made before this has none, and a request sent from an old copy of the page that
-- does not send one must still be accepted rather than refused.
alter table topup_requests add column if not exists client_key uuid;

create unique index if not exists idx_topup_requests_client_key
  on topup_requests (client_key)
  where client_key is not null;

comment on column topup_requests.client_key is
  'Made by the dealer''s form when it opens and sent with every attempt to submit. The same key twice is one request pressed twice.';
