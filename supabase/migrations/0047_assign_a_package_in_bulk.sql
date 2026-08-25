-- Phase 47: give a dealer a package without inventing a sale.
--
-- 500 of the 551 dealers on the roster have no package, so no rate, so
-- /entry refuses every top-up they could ever place. Fixing that today means
-- opening each dealer and there is no field to open — package and rate are
-- deliberately absent from update_dealer_profile (0021) because they drive
-- commission and must move through an audited path.
--
-- The two audited paths that exist do not fit:
--
--   a package TRANSACTION  records a sale. Writing 500 of those says 500
--                          dealers each paid RM349 today. That is a lie in
--                          the ledger, and the ledger is the product.
--   seed_dealer_rate_history  writes the history row and nothing else. CSV
--                          import calls it AFTER setting package/rate in its
--                          own INSERT, which only works for a new row.
--
-- So: one function that does both halves for a dealer that already exists,
-- and leaves the same trail the other paths leave.
--
-- Three rules it enforces, none of which the caller can talk it out of:
--
--   1. The rate is derived here, from the package, never accepted from the
--      caller. Migration 0007's check constraint says a rate must match its
--      package; the CSV importer already refuses to trust a rate column for
--      the same reason.
--   2. It only fills an EMPTY package. Moving a dealer from B to C changes
--      what they earn on everything they buy afterwards — that is a
--      conversation with that dealer, not a checkbox on a list of five
--      hundred. Re-assignment raises instead of silently overwriting.
--   3. cs and master only, the same pair who may onboard.
create or replace function assign_dealer_package(p_dealer_id uuid, p_package text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rate numeric;
  v_existing text;
begin
  if coalesce(current_role_name(), '') not in ('cs', 'master') then
    raise exception 'not authorized';
  end if;

  -- Kept in step with lib/packages.ts. Vibe unified every package to 6%
  -- (0010); the three prices still differ, the resale rate no longer does.
  v_rate := case p_package when 'A' then 6 when 'B' then 6 when 'C' then 6 else null end;
  if v_rate is null then
    raise exception 'unknown package %', p_package;
  end if;

  select package into v_existing from dealers where id = p_dealer_id;
  if v_existing is not null then
    raise exception 'dealer already has package %', v_existing;
  end if;

  update dealers set package = p_package, rate = v_rate where id = p_dealer_id;

  insert into dealer_rate_history (dealer_id, old_package, old_rate, new_package, new_rate, changed_by)
  values (p_dealer_id, null, null, p_package, v_rate, auth.uid());
end;
$$;

revoke execute on function assign_dealer_package(uuid, text) from public, anon;
grant execute on function assign_dealer_package(uuid, text) to authenticated, service_role;
