// The arithmetic behind the dashboard's period controls, split out from the
// page so it can be unit tested. Two of the three functions here decide what
// a money figure says, and the one they replace was wrong in a way nobody
// noticed for months — see sameSpanTotal.

export type MonthRef = { key: string; label: string }

/**
 * Which month the whole dashboard is scoped to.
 *
 * The page used to hardcode "this month", so on the 2nd of a month every
 * month-scoped block was empty by definition — five sections of zeros for
 * roughly the first week of every month, forever. Stripe's reports load
 * showing the *prior* month for the same reason: last month is complete,
 * this month is a stub.
 *
 * A month the reader explicitly picked always wins. Otherwise the current
 * month is used if it has anything in it, and failing that the most recent
 * month that does — flagged `auto` so the page can say why it is showing
 * something other than today.
 */
export function resolvePeriod(
  requested: string | undefined,
  months: MonthRef[],
  monthsWithData: Set<string>,
): { key: string; auto: boolean } {
  if (requested && months.some((m) => m.key === requested)) return { key: requested, auto: false }

  const current = months[months.length - 1].key
  if (monthsWithData.has(current)) return { key: current, auto: false }

  for (let i = months.length - 2; i >= 0; i--) {
    if (monthsWithData.has(months[i].key)) return { key: months[i].key, auto: true }
  }
  return { key: current, auto: false }
}

/**
 * Total of `field` over the rows dated in `monthKey`, counting only the days
 * up to and including `dayCut`.
 *
 * This exists to fix a real defect. Pace compared month-to-date against the
 * *whole* of last month: on 2 August it read "0% of July's commission is
 * booked" — two days measured against thirty-one. That is the partial-period
 * problem, and the standard fix is to cut the baseline to the same number of
 * days. Two days against two days is a comparison; two days against a month
 * is an alarm that fires on the 1st of every month and means nothing.
 */
export function sameSpanTotal(
  rows: { tx_date: string }[],
  monthKey: string,
  dayCut: number,
  field: 'points' | 'commission_rm',
): number {
  return rows
    .filter((r) => r.tx_date.slice(0, 7) === monthKey && Number(r.tx_date.slice(8, 10)) <= dayCut)
    .reduce((sum, r) => sum + Number((r as Record<string, unknown>)[field] ?? 0), 0)
}

/**
 * The points balance as it stood at the end of each month, oldest first.
 *
 * Worked backwards from the balance right now rather than forwards from zero:
 * going forwards would need every purchase and every transaction ever made,
 * while going backwards needs only the window being charted. The identity is
 *
 *     balance at end of month M
 *       = balance now  −  points bought since M  +  points sold since M
 *
 * `committed` must use the same definition of "sold" as the live balance —
 * pending and verified alike, flagged excluded — or the series will not land
 * on the figure printed beside it. See computeAvailableBalance.
 */
export function balanceSeries(
  currentAvailable: number,
  purchases: { purchase_date: string; points: number | string }[],
  committed: { tx_date: string; points: number | string }[],
  months: MonthRef[],
): number[] {
  return months.map(({ key }) => {
    const boughtAfter = purchases
      .filter((p) => p.purchase_date.slice(0, 7) > key)
      .reduce((sum, p) => sum + Number(p.points), 0)
    const soldAfter = committed.filter((t) => t.tx_date.slice(0, 7) > key).reduce((sum, t) => sum + Number(t.points), 0)
    return currentAvailable - boughtAfter + soldAfter
  })
}

/** Distinct dealers with a verified transaction in each month, oldest first. */
export function dealersTradingSeries(tx: { tx_date: string; dealer_id: string }[], months: MonthRef[]): number[] {
  return months.map(({ key }) => new Set(tx.filter((t) => t.tx_date.slice(0, 7) === key).map((t) => t.dealer_id)).size)
}
