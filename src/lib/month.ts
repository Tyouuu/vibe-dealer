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

export function formatDateLabel(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00Z').toLocaleString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}
