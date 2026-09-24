// The strip of days on the System Check page: has the ledger been keeping its rules?
//
// One square a day, coloured by the WORST thing any run found that day — not the last. A rule broken
// at 09:00 and mended by 15:00 is a day the books were wrong for six hours, and a strip that showed
// only the evening's clean run would be hiding exactly the thing it is there to show.

export type RunSummary = { ran_at: string; fail_count: number; warn_count: number }
export type DayState = 'clear' | 'look' | 'problem' | 'none'

const MS_PER_DAY = 86_400_000

/** A timestamp as the date it was in Malaysia, YYYY-MM-DD — the calendar the business keeps. */
export function malaysiaDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' })
}

const rank: Record<DayState, number> = { none: 0, clear: 1, look: 2, problem: 3 }

/** The last `days` days ending on `today`, oldest first. A day with no run is 'none', not 'clear'. */
export function dailyStates(runs: RunSummary[], today: string, days = 30): { date: string; state: DayState }[] {
  const worst = new Map<string, DayState>()
  for (const run of runs) {
    const date = malaysiaDate(run.ran_at)
    const state: DayState = run.fail_count > 0 ? 'problem' : run.warn_count > 0 ? 'look' : 'clear'
    const seen = worst.get(date) ?? 'none'
    if (rank[state] > rank[seen]) worst.set(date, state)
  }

  const out: { date: string; state: DayState }[] = []
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.parse(`${today}T00:00:00Z`) - i * MS_PER_DAY).toISOString().slice(0, 10)
    out.push({ date, state: worst.get(date) ?? 'none' })
  }
  return out
}

/**
 * How many days in a row, up to today, the books broke no rule.
 *
 * A warning does not end it: "worth a look" is not a broken rule. A day nobody checked does, because
 * nothing can be said about it — except today, which has simply not had its morning run yet.
 */
export function cleanStreak(days: { state: DayState }[]): number {
  let streak = 0
  for (let i = days.length - 1; i >= 0; i--) {
    const { state } = days[i]
    if (i === days.length - 1 && state === 'none') continue
    if (state === 'clear' || state === 'look') streak++
    else break
  }
  return streak
}
