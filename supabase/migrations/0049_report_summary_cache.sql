-- A cache slot for the Monthly Report's AI-written summary paragraph.
--
-- One row per month, keyed on the month itself since the report only ever
-- has one summary worth showing. inputs_hash is a fingerprint of the figures
-- the summary was written from (total earned, commission, dealer count, the
-- comparison to last month, and so on) -- when a late transaction gets
-- verified after the summary was generated and the real numbers move, the
-- hash stops matching and the page knows to offer a fresh one rather than
-- silently showing a paragraph that no longer describes the figures beside
-- it. Generation itself is a deliberate button press (see reports/actions.ts),
-- not something that runs on every page view -- a Server Component awaiting
-- an OpenAI call on every render of a page people flip through month by
-- month would be both slow and an unbounded cost.

create table if not exists report_summaries (
  month         date primary key,
  summary       text not null,
  inputs_hash   text not null,
  generated_at  timestamp with time zone default now() not null,
  generated_by  uuid references auth.users(id)
);

alter table report_summaries enable row level security;

-- Same split as company_statements (0001): accountant and master both work
-- with the report, cs never sees a figure on it.
drop policy if exists "report_summaries_select_finance" on report_summaries;
create policy "report_summaries_select_finance" on report_summaries
  for select using (current_role_name() in ('accountant','master'));

drop policy if exists "report_summaries_insert_finance" on report_summaries;
create policy "report_summaries_insert_finance" on report_summaries
  for insert with check (current_role_name() in ('accountant','master'));

drop policy if exists "report_summaries_update_finance" on report_summaries;
create policy "report_summaries_update_finance" on report_summaries
  for update using (current_role_name() in ('accountant','master'));

comment on table report_summaries is
  'One cached AI-written summary paragraph per month for the Monthly Report. Regenerated on request when inputs_hash no longer matches the live figures.';
