-- Phase 11: let master delete a dealer, but only one that's a pure
-- onboarding mistake — zero transactions ever recorded against it (any
-- status: pending/verified/flagged all count as "something happened").
-- Every other table stays delete-free (see 0006/0007 comments) — this is
-- narrowly scoped to the one case where nothing of financial consequence
-- has happened yet, so there's no ledger history to lose.
--
-- Enforced here at the RLS layer (not just in app code) so the same
-- "master only, and only if empty" rule holds even for a direct API call.
drop policy if exists "dealers_delete_master_no_transactions" on dealers;
create policy "dealers_delete_master_no_transactions" on dealers
  for delete using (
    current_role_name() = 'master'
    and not exists (select 1 from transactions where transactions.dealer_id = dealers.id)
  );
