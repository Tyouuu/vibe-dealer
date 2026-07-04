-- Phase 3: SIM delivery queue for CS, and Realtime for transactions/dealers.
--
-- CS is responsible for delivery_status but must not see money_rm / rate /
-- commission_rm (PROJECT_SPEC.md section 4). transactions_select_finance
-- (0001) intentionally blocks CS from the base table. This view exposes only
-- non-financial columns; it runs with the view owner's privileges (Postgres
-- default for views, security_invoker = off) so it bypasses that table-level
-- RLS block, and the WHERE clause below is the only access control. This
-- resolves the open question left in 0001_profiles_and_rls.sql.

create or replace view delivery_queue
with (security_invoker = off) as
select
  t.id,
  t.dealer_id,
  d.company_name,
  t.tx_date,
  t.type,
  t.package,
  t.sim_type,
  t.delivery_status,
  t.status
from transactions t
join dealers d on d.id = t.dealer_id
where t.sim_type is not null
  and current_role_name() in ('cs', 'master', 'accountant');

grant select on delivery_queue to authenticated;

-- Narrow, safe mutation: cs/master can flip a pending physical SIM to sent,
-- without gaining raw UPDATE on transactions (which would expose finance
-- columns to write access too).
create or replace function mark_delivered(p_tx_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_role_name() not in ('cs', 'master') then
    raise exception 'not authorized';
  end if;

  update transactions
  set delivery_status = 'sent'
  where id = p_tx_id
    and delivery_status = 'pending';
end;
$$;

grant execute on function mark_delivered(uuid) to authenticated;

-- Realtime: let clients subscribe to changes so pages can auto-refresh.
-- Wrapped so re-running the migration doesn't fail once tables are already members.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'transactions'
  ) then
    alter publication supabase_realtime add table transactions;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'dealers'
  ) then
    alter publication supabase_realtime add table dealers;
  end if;
end $$;
