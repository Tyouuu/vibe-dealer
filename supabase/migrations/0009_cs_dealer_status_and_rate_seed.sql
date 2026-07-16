-- Phase 9: fixes from a role-enforcement audit.
--
-- 0004_tighten_dealers_rls.sql restricted dealers UPDATE to accountant/master
-- only, on the assumption "the app UI never gives cs an edit path" — but the
-- app never stopped offering cs the Set Active/Inactive toggle. Since then,
-- every cs status change has been silently rejected by RLS (0 rows affected,
-- no error surfaced — the page just re-renders as if it worked). Same failure
-- mode hit dealer_rate_history: cs onboarding/importing a dealer with an
-- initial package tries to seed an audit row, which RLS also silently drops.
--
-- Rather than reopening UPDATE/INSERT on these tables to cs broadly (which
-- would let cs touch columns/rows beyond what these two specific actions
-- need), narrow SECURITY DEFINER functions — the same pattern as
-- mark_delivered (0003) — let cs do exactly these two things and nothing else.

create or replace function set_dealer_status(p_dealer_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_role_name(), '') not in ('cs', 'master') then
    raise exception 'not authorized';
  end if;
  if p_status not in ('active', 'inactive') then
    raise exception 'invalid status';
  end if;

  update dealers set status = p_status where id = p_dealer_id;
end;
$$;

revoke execute on function set_dealer_status(uuid, text) from public, anon;
grant execute on function set_dealer_status(uuid, text) to authenticated, service_role;

create or replace function seed_dealer_rate_history(p_dealer_id uuid, p_package text, p_rate numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_role_name(), '') not in ('cs', 'master') then
    raise exception 'not authorized';
  end if;

  insert into dealer_rate_history (dealer_id, old_package, old_rate, new_package, new_rate, changed_by)
  values (p_dealer_id, null, null, p_package, p_rate, auth.uid());
end;
$$;

revoke execute on function seed_dealer_rate_history(uuid, text, numeric) from public, anon;
grant execute on function seed_dealer_rate_history(uuid, text, numeric) to authenticated, service_role;
