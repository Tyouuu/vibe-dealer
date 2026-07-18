-- dealers.onboarded_by (0007) has always been recorded but the dealer detail
-- page never surfaced it — dealers_directory (0015) is the view cs reads the
-- dealer detail page through, and it never exposed this column. Adding it
-- here (staff attribution, not commercial data like rate) so both cs and
-- finance roles can see who ran the onboarding.
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
  onboarded_by,
  created_at
from dealers
where current_role_name() in ('cs', 'accountant', 'master');
