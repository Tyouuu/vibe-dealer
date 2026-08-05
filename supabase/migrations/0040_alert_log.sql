-- When each kind of alert last went out, so an unresolved problem is raised
-- again rather than every morning.
--
-- Without this the alerts cron would mail the same "credit is low" every day
-- until someone bought more, which is how an inbox learns to ignore a sender.
-- An alert nobody reads is worse than no alert, because it feels like cover.
--
-- One row per kind, not per send: the only question ever asked of this table is
-- "when did we last mention this", and keeping a history of every send would be
-- a log nobody reads about a mail nobody wanted twice.
create table if not exists alert_log (
  kind         text primary key,
  last_sent_on date not null,
  updated_at   timestamptz not null default now()
);

alter table alert_log enable row level security;

-- No policies on purpose. Only the cron touches this, and it runs as the
-- service role, which bypasses RLS. Enabling RLS with no policy means every
-- client-facing role — including a signed-in accountant — gets nothing, which
-- is exactly right: this is the mailer's own bookkeeping, not the ledger's.
revoke all on alert_log from anon, authenticated;
