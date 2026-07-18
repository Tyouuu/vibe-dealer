-- dealers.onboarded_by (0007) has always been recorded but the dealer detail
-- page never surfaced it — dealers_directory (0015, plus an untracked later
-- change that appended created_at) is the view cs reads the dealer detail
-- page through, and it never exposed this column. Adding it here (staff
-- attribution, not commercial data like rate) so both cs and finance roles
-- can see who ran the onboarding.
--
-- onboarded_by is listed after created_at, not before — CREATE OR REPLACE
-- VIEW can only append columns at the end; it errors if an existing
-- column's position would shift (SQLSTATE 42P16). Column order has no
-- semantic meaning to PostgREST/supabase-js callers, which select by name.
create or replace view dealers_directory
with (security_invoker = off) as
select
  id,
  company_name,
  company_no,
  contact_person,
  phone,
  email,
  address,
  region,
  package,
  status,
  created_at,
  onboarded_by
from dealers
where current_role_name() in ('cs', 'accountant', 'master');
