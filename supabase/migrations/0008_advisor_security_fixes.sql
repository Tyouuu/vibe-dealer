-- Phase 8: fixes from the Supabase security/performance advisors report.

-- 1) mark_delivered's auth check failed OPEN for signed-out callers. auth.uid()
--    is null with no session, so current_role_name() returns null, and
--    `if null not in (...)` evaluates to null — PL/pgSQL treats a null IF
--    condition as false, so the raise was skipped and the UPDATE ran anyway
--    under this function's SECURITY DEFINER privileges (bypassing RLS). Postgres
--    also grants EXECUTE on new functions to PUBLIC by default, so this was
--    reachable by anyone with the public anon key via /rest/v1/rpc/mark_delivered,
--    no login required. coalesce(..., '') makes the check fail CLOSED instead —
--    an empty string is never in the allowed list.
create or replace function mark_delivered(p_tx_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_role_name(), '') not in ('cs', 'master') then
    raise exception 'not authorized';
  end if;

  update transactions
  set delivery_status = 'sent'
  where id = p_tx_id
    and delivery_status = 'pending';
end;
$$;

-- 2) Close the default PUBLIC/anon execute grant on both SECURITY DEFINER
--    functions callable via RPC; keep only the roles that legitimately need them.
--    (current_role_name() must stay callable by authenticated — RLS policies
--    invoke it in the querying role's context, not the function owner's.)
revoke execute on function mark_delivered(uuid) from public, anon;
grant execute on function mark_delivered(uuid) to authenticated, service_role;

revoke execute on function current_role_name() from public, anon;
grant execute on function current_role_name() to authenticated, service_role;

-- 3) rls_auto_enable is an event-trigger function (Supabase's own "auto-enable
--    RLS on newly created tables" safety net, wired up outside our migrations)
--    — it only ever runs via the event trigger machinery, never a direct call,
--    so it needs no EXECUTE grant to any client-facing role at all.
-- Guarded, because the function is not ours: it is wired up outside these
-- migrations, so it exists on the project this was written against and on no
-- project built from this repo. An unguarded revoke made 0008 the one file that
-- could never run on a fresh database — found when standing up the demo
-- instance. Revoking nothing on a project that never had it is correct.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'rls_auto_enable') then
    execute 'revoke execute on function rls_auto_enable() from public, anon, authenticated, service_role';
  end if;
end $$;

-- 4) profiles_select_own_or_master re-evaluated auth.uid() for every row.
--    Wrapping it in a scalar subquery lets Postgres hoist it into a one-time
--    InitPlan instead of re-running it per row.
drop policy if exists "profiles_select_own_or_master" on profiles;
create policy "profiles_select_own_or_master" on profiles
  for select using (id = (select auth.uid()) or current_role_name() = 'master');
