-- Phase 18: generic rate limiting, from the security audit
-- (docs/security-and-feature-gap-audit.md) — this app had no brute-force
-- protection on login (a real-money app, plausibly-guessable staff emails)
-- and no throttle on the OCR statement-reading route (every call is real,
-- billed Anthropic spend). One small table + one atomic check-and-increment
-- function, reused for both.
create table if not exists rate_limit_hits (
  key          text primary key,
  count        integer not null default 1,
  window_start timestamptz not null default now()
);

-- RLS enabled with no policies at all: nothing queries this table directly,
-- only check_rate_limit() below (a security definer function, which bypasses
-- RLS internally as this codebase's other narrow RPCs already do) — this
-- just makes "no direct access" a real guarantee instead of an assumption.
alter table rate_limit_hits enable row level security;

-- Atomic: the on-conflict upsert is a single statement, so concurrent calls
-- for the same key serialize on that row's own lock rather than racing a
-- separate read-then-write (the same TOCTOU shape 0016 closed for the
-- credit balance, avoided here by construction instead of a second trigger).
create or replace function check_rate_limit(p_key text, p_max_hits int, p_window_seconds int)
returns boolean -- true = allowed, false = over the limit
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_expired boolean;
begin
  insert into rate_limit_hits (key, count, window_start)
  values (p_key, 1, now())
  on conflict (key) do update set
    count = case when rate_limit_hits.window_start < now() - (p_window_seconds || ' seconds')::interval
              then 1 else rate_limit_hits.count + 1 end,
    window_start = case when rate_limit_hits.window_start < now() - (p_window_seconds || ' seconds')::interval
              then now() else rate_limit_hits.window_start end
  returning count into v_count;

  return v_count <= p_max_hits;
end;
$$;

-- Callable by anon: login's rate-limit check runs before the caller is
-- authenticated (that's the whole point). The only "data" this function
-- exposes is a boolean allow/deny on a caller-supplied key — the accepted
-- trade-off of any email-keyed lockout is that someone who knows a staff
-- email could deliberately trigger their lockout, which is still strictly
-- better than today's zero protection and matches how account lockout works
-- industry-wide.
revoke execute on function check_rate_limit(text, int, int) from public;
grant execute on function check_rate_limit(text, int, int) to anon, authenticated, service_role;
