import { yesterdayInMalaysia } from '@/lib/month'

export type ReportFrequency = 'daily' | 'weekly' | 'monthly' | 'off'

export const REPORT_FREQUENCIES: { key: ReportFrequency; label: string; description: string }[] = [
  { key: 'daily', label: 'Every morning', description: 'Yesterday, complete — waiting when you start work.' },
  { key: 'weekly', label: 'Every Monday', description: 'The seven days to Sunday, in one email.' },
  { key: 'monthly', label: 'On the 1st', description: 'Last month, whole — the same period you reconcile.' },
  { key: 'off', label: 'Never', description: 'No emailed report. Nothing else changes.' },
]

export type ReportPeriod = {
  /** Inclusive first day, YYYY-MM-DD. */
  from: string
  /** Inclusive last day, YYYY-MM-DD. */
  to: string
  /** How this period is named in the subject line and the heading. */
  label: string
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Whether today is a send day for this frequency, and what it covers.
 *
 * The cron fires once a day; this is what makes one schedule serve four
 * preferences. It also decides the *period*, because the two cannot be set
 * separately without producing the worst possible outcome: a monthly email
 * carrying a single day's numbers, arriving eleven times a year too late to
 * act on and describing 1/30th of what it claims to.
 *
 * `today` is passed in rather than read, so this is a pure function and the
 * boundary cases — the 1st of a month, a Monday — can be tested rather than
 * waited for.
 */
export function resolveReportPeriod(frequency: ReportFrequency, today: string): ReportPeriod | null {
  if (frequency === 'off') return null

  const yesterday = addDays(today, -1)

  if (frequency === 'daily') {
    return { from: yesterday, to: yesterday, label: yesterday }
  }

  if (frequency === 'weekly') {
    // Mondays only, covering the week that just ended — Monday to Sunday, so
    // it never includes the day it is sent on and never splits a weekend.
    const dow = new Date(today + 'T00:00:00Z').getUTCDay() // 0 Sun … 1 Mon
    if (dow !== 1) return null
    const from = addDays(today, -7)
    return { from, to: yesterday, label: `${from} to ${yesterday}` }
  }

  // monthly: the 1st, covering the whole month that just ended. The same
  // period the reconciliation closes, so the two can be read side by side.
  const d = new Date(today + 'T00:00:00Z')
  if (d.getUTCDate() !== 1) return null
  const firstOfLast = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 10)
  return { from: firstOfLast, to: yesterday, label: firstOfLast.slice(0, 7) }
}

/** The period a daily report covers, for callers that already know it is daily. */
export function yesterdayPeriod(): ReportPeriod {
  const y = yesterdayInMalaysia()
  return { from: y, to: y, label: y }
}
