import type { SupabaseClient } from '@supabase/supabase-js'

// A month is "locked" once it has been reconciled — its verified total has
// been signed off against Vibe's statement, so anything that would move that
// total has to go through an explicit reopen first (see reopenMonth in
// reconcile/actions.ts).
//
// This is the app-layer fast path. The real backstop is the DB trigger in
// migration 0031, which holds even for a direct API call — same
// defense-in-depth split as the credit-balance hard block (0016). The two
// deliberately read the same company_statements.reconciled flag so they can't
// quietly disagree.

export function monthOf(txDate: string): string {
  return txDate.slice(0, 7)
}

export async function isPeriodLocked(supabase: SupabaseClient, txDate: string): Promise<boolean> {
  const { data } = await supabase
    .from('company_statements')
    .select('reconciled')
    .eq('month', `${monthOf(txDate)}-01`)
    .maybeSingle()
  return data?.reconciled === true
}

export function periodLockedMessage(txDate: string): string {
  return `${monthOf(txDate)} has already been reconciled, so its totals can't change. A master can reopen the month on the Reconciliation page, make the correction, then mark it reconciled again.`
}

// The trigger raises 'period_locked: YYYY-MM is already reconciled'. Callers
// that don't pre-check (or that lose a race against a month being closed
// between the check and the write) surface the same wording as the fast path
// rather than a raw Postgres error.
export function isPeriodLockError(message: string | undefined | null): boolean {
  return typeof message === 'string' && message.includes('period_locked')
}

export function monthFromPeriodLockError(message: string): string | null {
  return message.match(/period_locked:\s*(\d{4}-\d{2})/)?.[1] ?? null
}
