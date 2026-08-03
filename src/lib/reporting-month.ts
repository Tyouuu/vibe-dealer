// No 'server-only' here, matching period-lock.ts and credit-balance.ts: this
// module holds no secrets and takes the caller's client as a parameter. It
// also keeps pickReportMonth reachable from the unit tests, which is the whole
// reason the rule is a pure function.
import type { SupabaseClient } from '@supabase/supabase-js'
import { currentMonth } from './month'

/**
 * Which month a report-style page should open on.
 *
 * The dashboard already did this: on the 3rd of a month with nothing verified
 * in it yet, opening on the current month means opening on a screen of zeroes.
 * It falls back to the last month that has data and says so in the subtitle.
 *
 * Monthly Report and Reconciliation did not, so on the same day the report led
 * with "RM 0.00 ↓ 100%" and Reconciliation led with a 38px "0 pts" — three
 * pages disagreeing about what "now" means, and two of them opening on nothing.
 *
 * Pure so the rule can be tested without a database; the query that supplies
 * `latestActive` lives in latestMonthWithActivity below.
 */
export function pickReportMonth(
  requested: string | undefined,
  current: string,
  latestActive: string | null,
): { month: string; auto: boolean } {
  // An explicit choice always wins, including an explicit empty month — if
  // someone picks August from the switcher they mean August.
  if (requested) return { month: requested, auto: false }
  if (!latestActive) return { month: current, auto: false }
  if (latestActive >= current) return { month: current, auto: false }
  return { month: latestActive, auto: true }
}

/** The most recent month that has at least one verified transaction. */
export async function latestMonthWithActivity(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase
    .from('transactions')
    .select('tx_date')
    .eq('status', 'verified')
    .order('tx_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  const d = (data as { tx_date?: string } | null)?.tx_date
  return d ? d.slice(0, 7) : null
}

export async function resolveReportMonth(
  supabase: SupabaseClient,
  requested: string | undefined,
): Promise<{ month: string; auto: boolean }> {
  const current = currentMonth()
  if (requested) return { month: requested, auto: false }
  return pickReportMonth(undefined, current, await latestMonthWithActivity(supabase))
}
