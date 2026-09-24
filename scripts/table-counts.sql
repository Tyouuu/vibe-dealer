-- Exact row count of every table a restore has to bring back, one "schema.table,count" line each.
-- Run with: psql -At -f scripts/table-counts.sql <url>
-- Used by the nightly pg_dump job to prove the dump restores to the same data.
select table_schema || '.' || table_name || ',' ||
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
from information_schema.tables
where table_type = 'BASE TABLE'
  and (table_schema = 'public' or (table_schema = 'auth' and table_name in ('users', 'identities')))
order by 1;
