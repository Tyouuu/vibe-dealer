-- Phase 56: ask "what is this person's role" once per query, not once per row.
--
-- Nearly every row-level-security policy is written `current_role_name() = ANY (...)`.
-- Postgres evaluates a function call in a policy for EVERY row it examines, and this one
-- looks the person up in profiles each time. Measured on a demo with 12,000 transactions,
-- get_credit_balance() — one SUM over transactions — took 466 ms as an ordinary signed-in
-- user against ~5 ms without row-level security: 38 microseconds a row, all of it spent
-- re-asking a question whose answer cannot change during the statement.
--
-- That is what turned a large month into a failure rather than a slow page. The API gives a
-- signed-in request 8 seconds; a page that reads a few thousand rows a few times over spent
-- them here, the balance read timed out, and a helper that swallowed the error showed the
-- credit as 0 pts.
--
-- Supabase's own guidance for this is to wrap the call — `(select current_role_name())` —
-- so the planner runs it once as an InitPlan and reuses the value. The function is STABLE
-- and depends only on auth.uid(), which is fixed for the statement, so the answer is
-- identical; only how often it is computed changes. Every policy is rewritten mechanically
-- from its own current text rather than retyped, so nothing about who may see or do what can
-- drift: the WHO is untouched, only the HOW OFTEN.
--
-- Idempotent: an already-wrapped policy no longer matches and is skipped.
do $$
declare
  p record;
  clauses text;
  n integer := 0;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (qual ~ 'current_role_name\(\)' or with_check ~ 'current_role_name\(\)')
      -- Postgres prints a wrapped call as "( SELECT current_role_name() AS current_role_name)",
      -- so look for the select, with or without the space, not for the exact text written here.
      and coalesce(qual, '') !~* '\(\s*select\s+current_role_name'
      and coalesce(with_check, '') !~* '\(\s*select\s+current_role_name'
  loop
    clauses := '';
    -- ALTER POLICY takes USING only where a policy has one (an INSERT policy has none) and
    -- WITH CHECK only where it has one (a SELECT/DELETE policy has none): pass exactly the
    -- clauses the policy already carries.
    if p.qual is not null then
      clauses := clauses || format(' using (%s)', replace(p.qual, 'current_role_name()', '(select current_role_name())'));
    end if;
    if p.with_check is not null then
      clauses := clauses || format(' with check (%s)', replace(p.with_check, 'current_role_name()', '(select current_role_name())'));
    end if;
    execute format('alter policy %I on %I.%I%s', p.policyname, p.schemaname, p.tablename, clauses);
    n := n + 1;
  end loop;
  raise notice 'rewrote % policies', n;
end $$;
