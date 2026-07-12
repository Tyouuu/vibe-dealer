-- Phase 4: tighten dealers UPDATE policy.
--
-- dealers_update_staff (0001) let cs / accountant / master all UPDATE any
-- column on dealers, including package/rate — but those drive commission
-- calculations and, per PROJECT_SPEC.md 3.3, should only change when
-- accountant records a package purchase. The app UI never gives cs an edit
-- path, but RLS is the actual authorization boundary: any cs session could
-- call supabase.from('dealers').update(...) directly. Restrict UPDATE to
-- accountant/master; cs keeps INSERT (onboarding) and SELECT (dealer list),
-- per dealers_insert_cs_master / dealers_select_staff (both still in 0001,
-- unchanged by this migration). Safe to re-run.

drop policy if exists "dealers_update_staff" on dealers;
create policy "dealers_update_finance" on dealers
  for update using (current_role_name() in ('accountant','master'));
