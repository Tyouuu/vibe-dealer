-- Phase 13: Account Settings page content — notification preferences (per
-- category + a master on/off), personal sign-in history, and a
-- Master-only display name for the daily report email's "from" field.
--
-- The Notifications matrix in the design research had an Email column too,
-- but the client dropped it: the only email that exists today is the daily
-- cron digest, and it only goes to masters, so a per-category Email toggle
-- would have no real channel behind it yet. In-app is the only channel this
-- phase wires up for real.

-- ============================================================
-- 1) profiles: master on/off switch + daily-report sender name
-- ============================================================
alter table profiles add column if not exists notifications_enabled boolean not null default true;
alter table profiles add column if not exists report_sender_name text;

-- ============================================================
-- 2) notification_preferences — one row per (user, category). Missing row
--    means "on" (opt-out model, so existing users don't silently lose
--    notifications they never explicitly turned off).
-- ============================================================
create table if not exists notification_preferences (
  user_id    uuid not null references profiles(id) on delete cascade,
  category   text not null check (category in ('pending_review', 'deliveries', 'credit_reconciliation', 'dealer_activity')),
  enabled    boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);

alter table notification_preferences enable row level security;

drop policy if exists "notification_preferences_own" on notification_preferences;
create policy "notification_preferences_own" on notification_preferences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================
-- 3) login_events — self-logged sign-in history (deliberately NOT reading
--    Supabase's internal auth.sessions/auth.audit_log_entries — those live
--    in a schema this app doesn't otherwise touch, and their exact columns
--    aren't something to guess at in a migration). Logged by the app itself
--    right after a successful sign-in; user_agent is parsed client-request-
--    side, ip is best-effort from the request headers (may be null behind
--    some proxies — that's fine, it's a "nice to have" detail, not load-
--    bearing for anything).
-- ============================================================
create table if not exists login_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  user_agent text,
  ip         text
);

alter table login_events enable row level security;

drop policy if exists "login_events_select_own" on login_events;
create policy "login_events_select_own" on login_events
  for select using (user_id = auth.uid());

drop policy if exists "login_events_insert_own" on login_events;
create policy "login_events_insert_own" on login_events
  for insert with check (user_id = auth.uid());

create index if not exists login_events_user_id_created_at_idx on login_events (user_id, created_at desc);
