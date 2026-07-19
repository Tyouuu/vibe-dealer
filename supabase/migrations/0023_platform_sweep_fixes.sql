-- Phase 23: fixes from a full-platform content/correctness sweep.

-- 1) dealer_last_verified_activity (0007, last touched 0017) fed "last
--    verified top-up" off status='verified' alone, with no type filter — it
--    predates 0013's correcting-entry feature. A correction posted against
--    a months-old transaction (fixing a typo, say) verifies with today's
--    tx_date, which reset a dormant dealer's last-activity date to today
--    and silently dropped them out of "Needs Follow-up" despite no real
--    top-up happening. Real top-ups only, from here on.
create or replace view dealer_last_verified_activity
with (security_invoker = off) as
select dealer_id, max(tx_date) as last_tx_date
from transactions
where status = 'verified'
  and type <> 'adjustment'
  and current_role_name() in ('cs', 'accountant', 'master')
group by dealer_id;

-- 2) dealers.notes has existed since the original schema but was never wired
--    into any read or write path — not onboarding, not the edit form added
--    this session, not CSV import/export, not dealers_directory. A
--    completely unreachable field. Wiring it in as a plain staff-notes
--    field (not commercial data like rate, so every role that can already
--    read dealers_directory gets it too). Signature change means dropping
--    0021's function first — create or replace can't add a parameter.
drop function if exists update_dealer_profile(uuid, text, text, text, text, text, text, text);

create or replace function update_dealer_profile(
  p_dealer_id uuid,
  p_company_name text,
  p_company_no text,
  p_contact_person text,
  p_phone text,
  p_email text,
  p_address text,
  p_region text,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_role_name(), '') not in ('cs', 'master') then
    raise exception 'not authorized';
  end if;
  if coalesce(trim(p_company_name), '') = '' then
    raise exception 'company name is required';
  end if;

  update dealers set
    company_name = trim(p_company_name),
    company_no = nullif(trim(coalesce(p_company_no, '')), ''),
    contact_person = nullif(trim(coalesce(p_contact_person, '')), ''),
    phone = nullif(trim(coalesce(p_phone, '')), ''),
    email = nullif(trim(coalesce(p_email, '')), ''),
    address = nullif(trim(coalesce(p_address, '')), ''),
    region = nullif(trim(coalesce(p_region, '')), ''),
    notes = nullif(trim(coalesce(p_notes, '')), '')
  where id = p_dealer_id;
end;
$$;

revoke execute on function update_dealer_profile(uuid, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function update_dealer_profile(uuid, text, text, text, text, text, text, text, text) to authenticated, service_role;

-- notes appended at the end, same append-only constraint as 0022's
-- onboarded_by addition (create or replace view can't reorder existing
-- columns).
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
  onboarded_by,
  notes
from dealers
where current_role_name() in ('cs', 'accountant', 'master');
