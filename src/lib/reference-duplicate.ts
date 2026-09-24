import type { SupabaseClient } from '@supabase/supabase-js'
import { isComparableReference, referenceKey, type DuplicateHit } from './slip-extract'

/**
 * Has this bank reference (or Vibe invoice number) already been recorded?
 *
 * Asked in two places that must agree: when a slip is attached, so the person is told before typing four
 * more fields, and when the form is submitted, because the form is a courtesy and this is the rule — a
 * pasted request, a second tab or a stale page all reach the action without ever having asked.
 *
 * A dealer's slip is looked for among dealer entries and Vibe's invoice among credit purchases: they are
 * different namespaces, and one matching the other means nothing. Flagged entries do not count — one that
 * has been marked wrong is not a payment already counted, and it is exactly what someone re-entering the
 * payment correctly is replacing. Corrections do not count either: they carry no payment of their own.
 */
export async function findRecordedReference(
  supabase: SupabaseClient,
  target: 'entry' | 'purchase',
  reference: string | null | undefined,
): Promise<DuplicateHit | null> {
  if (!isComparableReference(reference)) return null
  const key = referenceKey(reference)

  if (target === 'purchase') {
    const { data } = await supabase
      .from('credit_purchases')
      .select('purchase_date, money_rm')
      .eq('reference_key', key)
      .is('adjusts_id', null)
      .order('purchase_date', { ascending: false })
      .limit(1)
      .maybeSingle()
    return data
      ? { kind: 'purchase', label: 'Credit purchase', date: data.purchase_date as string, moneyRm: Number(data.money_rm), status: null }
      : null
  }

  const { data } = await supabase
    .from('transactions')
    .select('tx_date, money_rm, status, dealers(company_name)')
    .eq('reference_key', key)
    .neq('status', 'flagged')
    .neq('type', 'adjustment')
    .order('tx_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  const dealer = data.dealers as unknown as { company_name: string } | null
  return {
    kind: 'entry',
    label: dealer?.company_name ?? 'a dealer',
    date: data.tx_date as string,
    moneyRm: Number(data.money_rm),
    status: data.status as string,
  }
}
