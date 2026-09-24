// Compare row counts of the live database (taken just before and just after the
// dump) against the same counts taken from a scratch database the dump was
// restored into. A backup that has never been restored is a hope, not a backup.
//
//   node scripts/restore-drill-compare.mjs before.csv after.csv restored.csv
//
// Each file is "schema.table,count" per line (scripts/table-counts.sql).
//
// The live database keeps taking writes while the dump runs, so a restored table
// is allowed to land anywhere between its "before" and "after" count — anything
// outside that window means rows were lost or invented. rate_limit_hits is a
// throwaway login counter that churns constantly, so it is only checked to exist.
import fs from 'node:fs'

const CHURNS = new Set(['public.rate_limit_hits'])

function read(file) {
  const out = new Map()
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue
    const i = line.lastIndexOf(',')
    out.set(line.slice(0, i), Number(line.slice(i + 1)))
  }
  return out
}

export function compare(before, after, restored) {
  const problems = []
  for (const table of new Set([...before.keys(), ...after.keys()])) {
    if (!restored.has(table)) { problems.push(`${table}: missing from the restored database`); continue }
    if (CHURNS.has(table)) continue
    const lo = Math.min(before.get(table) ?? Infinity, after.get(table) ?? Infinity)
    const hi = Math.max(before.get(table) ?? -Infinity, after.get(table) ?? -Infinity)
    const got = restored.get(table)
    if (got < lo || got > hi) problems.push(`${table}: restored ${got} rows, live had ${lo}..${hi}`)
  }
  if (!(restored.get('public.dealers') > 0)) problems.push('public.dealers restored empty')
  if (!(restored.get('auth.users') > 0)) problems.push('auth.users restored empty')
  return problems
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const [b, a, r] = process.argv.slice(2)
  if (!b || !a || !r) { console.error('usage: node scripts/restore-drill-compare.mjs before.csv after.csv restored.csv'); process.exit(1) }
  const restored = read(r)
  const problems = compare(read(b), read(a), restored)
  console.log(`restored ${restored.size} tables, ${[...restored.values()].reduce((x, y) => x + y, 0).toLocaleString()} rows`)
  if (problems.length) {
    console.error('RESTORE DRILL FAILED — this backup does not restore to the same data:')
    for (const p of problems) console.error('  - ' + p)
    process.exit(1)
  }
  console.log('restore drill passed: every table came back with the row count it had.')
}
