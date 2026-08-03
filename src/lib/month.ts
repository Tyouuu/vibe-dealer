export function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number)
  const start = `${month}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const end = `${month}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

// Malaysia is a fixed UTC+8 offset (no DST) — shift the instant before
// slicing so "today"/"yesterday" match the Malaysia calendar date even
// though the server (Vercel) runs in UTC. Using plain server-local time here
// would misreport "yesterday" for anyone viewing between 12am-8am MYT.
const MYT_OFFSET_MS = 8 * 60 * 60 * 1000

export function todayInMalaysia(): string {
  return new Date(Date.now() + MYT_OFFSET_MS).toISOString().slice(0, 10)
}

export function yesterdayInMalaysia(): string {
  return new Date(Date.now() + MYT_OFFSET_MS - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function currentMonth() {
  return todayInMalaysia().slice(0, 7)
}

export function previousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleString('en-MY', { year: 'numeric', month: 'long' })
}

// The one date check every "when did this happen" field needs, in one place.
//
// createTransaction had grown this inline and documented why it mattered: the
// picker blocks a future date client-side, but that is a nicety, and the
// action is the real backstop. The three actions written after it —
// recordCreditPurchase, recordSimIntake, createSimOrder — each only checked
// that the string was non-empty, so any text at all reached Postgres and a
// stock intake could be dated 2030.
//
// Returns null rather than throwing so each caller can phrase its own message
// with the field's own name.
export function parseBusinessDate(raw: unknown, today: string): string | null {
  const s = String(raw ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  // Rejects 2026-02-31 and 2026-13-01, which the pattern alone accepts.
  const d = new Date(`${s}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return null
  // Business dates record something that already happened.
  if (s > today) return null
  return s
}

// The app's one date format: "3 Aug 2026".
//
// It had three. The date picker rendered "3 Aug 2026" from its own private
// formatter, this helper rendered "03 Aug 2026" and was called from exactly
// one place (the report subtitle), and all six tables printed the raw ISO
// string — so a sale entered as "3 Aug 2026" came back as "2026-08-03" on
// every screen that showed it afterwards.
//
// Matches what the picker already showed, since that is the one place a date
// is typed rather than read. date-picker.tsx now calls this rather than
// keeping its own copy, so the two cannot drift again.
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatDateLabel(dateStr: string | null | undefined): string {
  const s = String(dateStr ?? '')
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  // Anything that isn't an ISO date comes back untouched rather than as
  // "Invalid Date" — a table cell should show what it has, not a JS error.
  if (!m) return s
  const [, y, mo, d] = m
  const monthIndex = Number(mo) - 1
  if (monthIndex < 0 || monthIndex > 11) return s
  return `${Number(d)} ${MONTHS_SHORT[monthIndex]} ${y}`
}
