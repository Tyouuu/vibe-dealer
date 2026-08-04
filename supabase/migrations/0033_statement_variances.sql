-- Phase 33: a month can close with a gap, and until now the gap left no trace
-- you could act on.
--
-- markReconciled already refuses to close a month whose verified total differs
-- from Vibe's statement unless someone types a reason. That reason went into
-- company_statement_revisions.note as prose — one line inside an append-only
-- log, alongside every ordinary save. Nothing anywhere answered "which months
-- closed with a gap, how much is still in dispute, and did Vibe ever come
-- back to us". Three months later the only record that 3,700 pts was queried
-- is a sentence you would have to go looking for.
--
-- Every reconciliation platform in this space treats a variance as an object
-- with a life: a type, an owner, a clock, and a resolution. This is the small
-- version of that — the parts a three-person office will actually keep up to
-- date. No routing, no escalation timers, no templates.

create table if not exists statement_variances (
  id           uuid primary key default gen_random_uuid(),
  -- The first of the month, matching company_statements.month.
  month        date not null,
  -- System total minus Vibe's, in points, at the moment of closing. Positive
  -- means we recorded more than they did. Stored rather than recomputed: the
  -- point of the record is what the gap was when someone accepted it, and a
  -- later correction would change a recomputed figure out from under it.
  gap_points   numeric not null,
  -- Why it was closed anyway. This is the override reason markReconciled
  -- already demanded; it now has somewhere to live.
  reason       text not null,
  opened_by    uuid not null references profiles(id),
  created_at   timestamptz not null default now(),
  -- Null until someone settles it. What Vibe said, or what we found.
  resolution   text,
  resolved_at  timestamptz,
  resolved_by  uuid references profiles(id)
);

-- The list is read as "what is still open", so that is the index.
create index if not exists idx_statement_variances_open
  on statement_variances (resolved_at, month desc);

alter table statement_variances enable row level security;

-- Same audience as the reconciliation it comes from: cs never sees points or
-- commission figures (PROJECT_SPEC.md), and a variance is nothing but those.
drop policy if exists "statement_variances_select_finance" on statement_variances;
create policy "statement_variances_select_finance" on statement_variances
  for select using (current_role_name() in ('accountant', 'master'));

drop policy if exists "statement_variances_insert_finance" on statement_variances;
create policy "statement_variances_insert_finance" on statement_variances
  for insert with check (current_role_name() in ('accountant', 'master'));

-- Update, not delete. Resolving a variance is a change of state, not a removal
-- — the same append-only stance the transactions table takes. No delete policy
-- exists, so nothing can quietly drop the record that a month closed short.
drop policy if exists "statement_variances_update_finance" on statement_variances;
create policy "statement_variances_update_finance" on statement_variances
  for update using (current_role_name() in ('accountant', 'master'));
