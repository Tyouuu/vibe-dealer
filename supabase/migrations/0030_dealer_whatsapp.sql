-- Phase 30: separate WhatsApp number from the general contact phone.
-- Malaysia SME dealers are contacted over WhatsApp far more than by call, and
-- that number sometimes differs from the shop's main line — one "Phone"
-- field forced staff to pick one or cram both into it. Same visibility rule
-- as phone (non-sensitive, every staff role already sees phone).

alter table dealers add column if not exists whatsapp text;

-- Appended at the end, not inserted where it reads naturally next to phone —
-- create or replace view can't reorder existing columns without erroring
-- (SQLSTATE 42P16); column order has no meaning to PostgREST/supabase-js
-- callers, which select by name (same fix as 0022/0023).
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
  notes,
  whatsapp
from dealers
where current_role_name() in ('cs', 'accountant', 'master');

create or replace function update_dealer_profile(
  p_dealer_id uuid,
  p_company_name text,
  p_company_no text,
  p_contact_person text,
  p_phone text,
  p_email text,
  p_address text,
  p_region text,
  p_notes text,
  p_whatsapp text default null
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
    notes = nullif(trim(coalesce(p_notes, '')), ''),
    whatsapp = nullif(trim(coalesce(p_whatsapp, '')), '')
  where id = p_dealer_id;
end;
$$;

-- The old 9-arg signature is superseded — drop it so there's only one
-- update_dealer_profile to call (PostgREST resolves by exact arg match;
-- leaving both around risks the app accidentally calling the old one and
-- silently never saving whatsapp).
drop function if exists update_dealer_profile(uuid, text, text, text, text, text, text, text, text);

revoke execute on function update_dealer_profile(uuid, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function update_dealer_profile(uuid, text, text, text, text, text, text, text, text, text) to authenticated, service_role;
