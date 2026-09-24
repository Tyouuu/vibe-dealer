-- Phase 53: push notifications to a phone.
--
-- A new SIM order used to reach nobody until they next opened the app (0052 made it
-- visible in the queue; this makes it reach a pocket). Two small tables and two
-- functions, and nothing about the ledger changes.
--
-- push_subscriptions — one row per phone/browser that said yes. The endpoint is the
--   address the browser's push service gave us; p256dh and auth are that browser's
--   public key and secret, which is what lets us encrypt a message only it can read.
--   An endpoint is unique: the same phone is one subscription, and if someone else
--   signs in on it later the row moves to them (save_push_subscription) instead of
--   the previous person's alerts landing on a phone they no longer hold.
--
-- push_events — "this order has already been announced". A double-tap, a slow-network
--   resubmit (create_sim_order returns the existing order for a repeated idempotency
--   key) or a retry would otherwise buzz the same phone twice for one parcel. The
--   sender claims (kind, id) with an insert; if the row was already there it stays
--   quiet.
create table if not exists push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  endpoint        text not null unique check (length(endpoint) between 1 and 2048),
  p256dh          text not null check (length(p256dh) between 1 and 256),
  auth            text not null check (length(auth) between 1 and 128),
  user_agent      text check (user_agent is null or length(user_agent) <= 400),
  created_at      timestamptz not null default now(),
  -- Set when the push service refused the last message for a reason other than
  -- "this subscription is gone" (which deletes the row outright).
  failed_at       timestamptz
);

create index if not exists idx_push_subscriptions_user on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

-- A person can see their own phones (so Account Settings can say "this one is on").
-- Writes go through the two functions below, never straight from the client: the
-- upsert has to be able to re-home an endpoint that belonged to someone else, which
-- an ordinary row policy rightly would not allow.
drop policy if exists push_subscriptions_own_select on push_subscriptions;
create policy push_subscriptions_own_select on push_subscriptions
  for select using (user_id = auth.uid() and current_role_name() is not null);

revoke all on push_subscriptions from anon;
revoke insert, update, delete on push_subscriptions from authenticated;

create table if not exists push_events (
  ref_kind    text not null check (ref_kind in ('sim_order', 'package_sale')),
  ref_id      uuid not null,
  created_at  timestamptz not null default now(),
  primary key (ref_kind, ref_id)
);

-- No policy at all: only the server's service role ever touches it.
alter table push_events enable row level security;
revoke all on push_events from anon, authenticated;

create or replace function save_push_subscription(
  p_endpoint   text,
  p_p256dh     text,
  p_auth       text,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or current_role_name() is null then
    raise exception 'not authorized';
  end if;

  insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 400))
  on conflict (endpoint) do update
    set user_id    = auth.uid(),
        p256dh     = excluded.p256dh,
        auth       = excluded.auth,
        user_agent = excluded.user_agent,
        failed_at  = null;
end;
$$;

create or replace function delete_push_subscription(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authorized';
  end if;
  -- Only your own. Someone else's endpoint is not yours to switch off.
  delete from push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
end;
$$;

revoke execute on function save_push_subscription(text, text, text, text) from public, anon;
revoke execute on function delete_push_subscription(text) from public, anon;
grant execute on function save_push_subscription(text, text, text, text) to authenticated, service_role;
grant execute on function delete_push_subscription(text) to authenticated, service_role;
