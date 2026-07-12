-- Phase 5: reconciliation audit trail.
--
-- saveStatement (reconcile/actions.ts) upserts company_statements, so editing
-- a month's numbers a second time silently overwrites the first — no record
-- of what it used to say or who changed it. This adds an append-only log:
-- every save inserts a revision row here (company_statements itself is
-- unchanged), so the audit log can show the full history per month.

create table if not exists company_statement_revisions (
  id                    uuid primary key default gen_random_uuid(),
  month                 date not null,
  company_total_points  numeric,
  company_profit_rm     numeric,
  note                  text,
  recorded_by           uuid,
  created_at            timestamptz default now()
);
create index if not exists idx_statement_rev_month on company_statement_revisions (month);

alter table company_statement_revisions enable row level security;

drop policy if exists "statement_revisions_select_finance" on company_statement_revisions;
create policy "statement_revisions_select_finance" on company_statement_revisions
  for select using (current_role_name() in ('accountant','master'));

drop policy if exists "statement_revisions_insert_accountant" on company_statement_revisions;
create policy "statement_revisions_insert_accountant" on company_statement_revisions
  for insert with check (current_role_name() in ('accountant','master'));
