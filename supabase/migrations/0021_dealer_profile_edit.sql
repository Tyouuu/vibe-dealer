-- Phase 21: let cs/master fix a dealer's profile info after onboarding.
--
-- Nothing on the dealers table has ever been editable after creation besides
-- status (0009) and package/rate (only via the audited rate-change flow) —
-- a typo'd phone number or an address that was never even collectible from
-- the onboarding form (it has no address field; only CSV import sets it) had
-- no fix short of deleting and recreating the dealer. Same SECURITY DEFINER
-- pattern as set_dealer_status: dealers UPDATE is RLS-restricted to
-- accountant/master (0004), so cs needs a narrow function rather than a
-- direct .update() call.
--
-- Deliberately excludes package/rate — those go through their own audited
-- change history (dealer_rate_history) rather than a plain overwrite.
create or replace function update_dealer_profile(
  p_dealer_id uuid,
  p_company_name text,
  p_company_no text,
  p_contact_person text,
  p_phone text,
  p_email text,
  p_address text,
  p_region text
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
    region = nullif(trim(coalesce(p_region, '')), '')
  where id = p_dealer_id;
end;
$$;

revoke execute on function update_dealer_profile(uuid, text, text, text, text, text, text, text) from public, anon;
grant execute on function update_dealer_profile(uuid, text, text, text, text, text, text, text) to authenticated, service_role;
