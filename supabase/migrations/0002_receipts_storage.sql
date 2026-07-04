-- Phase 2: private Storage bucket for manually-uploaded transaction receipts.
-- Access mirrors the transactions table: only accountant/master (per PROJECT_SPEC.md
-- section 4, CS does not see finance). Safe to re-run.

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

drop policy if exists "receipts_insert_finance" on storage.objects;
create policy "receipts_insert_finance" on storage.objects
  for insert with check (bucket_id = 'receipts' and current_role_name() in ('accountant', 'master'));

drop policy if exists "receipts_select_finance" on storage.objects;
create policy "receipts_select_finance" on storage.objects
  for select using (bucket_id = 'receipts' and current_role_name() in ('accountant', 'master'));
