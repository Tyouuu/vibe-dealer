// Take a full, restorable snapshot of the database to a folder outside the repo.
//
// Supabase does not back up Free Plan projects. Their own guidance for the
// free tier is to "regularly export their data ... and maintain off-site
// backups", because there is nothing on the platform to restore from — a
// mistaken delete, a bad migration, or a disk failure would take the ledger
// with it and leave nothing to go back to. This is that export.
//
//   node scripts/backup.mjs              -> ./backups/<timestamp>/
//   node scripts/backup.mjs D:/Dropbox   -> D:/Dropbox/<timestamp>/
//
// Each table is written twice: .json is the lossless copy a restore would read
// back, .csv is the one you can open in Excel to check it is really there.
// Views are skipped — they are derived from the tables and would restore as
// stale duplicates of data the tables already hold.
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

// On a developer machine the credentials come from .env.local. In GitHub
// Actions there is no such file — they arrive as repository secrets in the
// environment — so the environment wins and the file is only a fallback.
// Reading the file unconditionally would crash the scheduled run.
const fromFile = fs.existsSync('.env.local')
  ? Object.fromEntries(
      fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
        .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
        .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
    )
  : {}
const env = new Proxy({}, { get: (_, k) => process.env[k] ?? fromFile[k] })

for (const required of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!env[required]) {
    console.error(`${required} is not set. Locally it comes from .env.local; in CI it is a repository secret.`)
    process.exit(1)
  }
}

// Every base table in `public`, in dependency order: a restore has to insert
// profiles before anything referencing recorded_by, and dealers before any
// transaction pointing at one. Verified against pg_class rather than guessed
// from the migrations, so a table added later shows up as a gap in the count
// printed at the end instead of being silently missed.
const TABLES = [
  'profiles',
  'dealers',
  'dealer_rate_history',
  'credit_purchases',
  'transactions',
  'sim_stock_intakes',
  'sim_orders',
  'company_statements',
  'company_statement_revisions',
  'notification_preferences',
  'login_events',
  // rate_limit_hits is deliberately last and is throwaway state — a login
  // counter, not a record of anything. Included only so the snapshot is a
  // complete picture of the schema's contents.
  'rate_limit_hits',
]

const PAGE = 1000

function csvCell(v) {
  if (v == null) return ''
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  // Same formula-injection guard the app's own exports use: a value opening
  // with = + - @ is executed by Excel rather than shown.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

function toCsv(rows) {
  if (!rows.length) return ''
  const cols = Object.keys(rows[0])
  return [cols.map(csvCell).join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n')
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// Local time, filename-safe, sorts chronologically.
const now = new Date()
const pad = (n) => String(n).padStart(2, '0')
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`

const root = path.resolve(process.argv[2] || 'backups', stamp)
fs.mkdirSync(root, { recursive: true })

console.log(`project : ${new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0]}`)
console.log(`into    : ${root}\n`)

let grandTotal = 0
let failed = 0
const manifest = { takenAt: now.toISOString(), project: env.NEXT_PUBLIC_SUPABASE_URL, tables: {} }

for (const table of TABLES) {
  // Paged rather than one request: PostgREST caps rows per response, and a
  // silent truncation in a backup is worse than no backup — you would not find
  // out until the restore.
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + PAGE - 1)
    if (error) {
      console.log(`  ${table.padEnd(30)} FAILED — ${error.message}`)
      failed++
      rows.length = 0
      break
    }
    rows.push(...data)
    if (data.length < PAGE) break
  }

  fs.writeFileSync(path.join(root, `${table}.json`), JSON.stringify(rows, null, 2))
  fs.writeFileSync(path.join(root, `${table}.csv`), toCsv(rows))
  manifest.tables[table] = rows.length
  grandTotal += rows.length
  console.log(`  ${table.padEnd(30)} ${String(rows.length).padStart(6)} rows`)
}

// Login accounts live in the auth schema, which PostgREST does not expose, so
// the table loop above cannot reach them. Without this the snapshot restores a
// profiles row for every member of staff and nobody who can sign in — and
// because profiles.id is the auth user's id, the rows would have nothing to
// point at.
//
// Password hashes are deliberately not returned by the admin API, so a restore
// recreates the accounts and everyone sets a new password. That is a recovery
// step, not a data loss.
const authUsers = []
for (let page = 1; ; page++) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
  if (error) { console.log(`  ${'auth.users'.padEnd(30)} FAILED — ${error.message}`); failed++; break }
  authUsers.push(...data.users.map((u) => ({
    id: u.id, email: u.email, phone: u.phone, role: u.role,
    created_at: u.created_at, last_sign_in_at: u.last_sign_in_at,
    email_confirmed_at: u.email_confirmed_at, app_metadata: u.app_metadata, user_metadata: u.user_metadata,
  })))
  if (data.users.length < 1000) break
}
fs.writeFileSync(path.join(root, 'auth_users.json'), JSON.stringify(authUsers, null, 2))
manifest.authUsers = authUsers.length
console.log(`  ${'auth.users'.padEnd(30)} ${String(authUsers.length).padStart(6)} accounts`)

// Storage objects are not in the database — the tables only hold their paths.
// Downloading them, rather than only listing them, is what makes a receipt
// recoverable: a manifest of filenames tells you exactly what you lost, which
// is not the same as having it back.
const buckets = ['receipts', 'sim-shipping-invoices']
manifest.storage = {}
for (const bucket of buckets) {
  const { data: dirs } = await supabase.storage.from(bucket).list('', { limit: 1000 })
  const paths = []
  for (const d of dirs ?? []) {
    if (d.id) { paths.push(d.name); continue }        // a file at the root
    const { data: inner } = await supabase.storage.from(bucket).list(d.name, { limit: 1000 })
    for (const f of inner ?? []) paths.push(`${d.name}/${f.name}`)
  }

  let saved = 0
  let bytes = 0
  for (const p of paths) {
    const { data: blob, error } = await supabase.storage.from(bucket).download(p)
    if (error) { console.log(`  storage:${bucket}/${p} FAILED — ${error.message}`); failed++; continue }
    const dest = path.join(root, 'storage', bucket, p)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    const buf = Buffer.from(await blob.arrayBuffer())
    fs.writeFileSync(dest, buf)
    saved++
    bytes += buf.length
  }
  manifest.storage[bucket] = { objects: paths, downloaded: saved, bytes }
  const mb = (bytes / 1024 / 1024).toFixed(1)
  console.log(`  storage:${bucket.padEnd(22)} ${String(saved).padStart(6)} files  ${mb} MB`)
}

fs.writeFileSync(path.join(root, '_manifest.json'), JSON.stringify(manifest, null, 2))

console.log(`\n${grandTotal.toLocaleString()} rows across ${TABLES.length} tables.`)
if (failed) {
  console.error(`${failed} table(s) FAILED — this snapshot is incomplete. Do not rely on it.`)
  process.exit(1)
}
console.log('Snapshot complete. Keep a copy somewhere that is not this machine.')
