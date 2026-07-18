import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { formatDateLabel, formatMonthLabel, todayInMalaysia, yesterdayInMalaysia } from './month'

export type AuditKind = 'transaction' | 'reconciliation' | 'rate_change'

export type AuditEvent = {
  id: string
  createdAt: string
  kind: AuditKind
  actor: string
  event: string
  dealer: string | null
  amount: string
  status: 'verified' | 'flagged' | 'pending' | null
  detail: { label: string; value: string }[]
}

type TxRow = {
  id: string
  created_at: string
  type: 'package' | 'topup' | 'adjustment'
  package: string | null
  points: number
  money_rm: number
  status: 'pending' | 'verified' | 'flagged'
  recorded_by: string | null
  verified_by: string | null
  flag_reason: string | null
  note: string | null
  adjusts_id: string | null
  dealers: { company_name: string } | { company_name: string }[] | null
}

type RevisionRow = {
  id: string
  month: string
  company_total_points: number | null
  company_profit_rm: number | null
  note: string | null
  recorded_by: string | null
  created_at: string
}

type RateHistoryRow = {
  id: string
  old_package: string | null
  old_rate: number | null
  new_package: string | null
  new_rate: number | null
  changed_by: string | null
  created_at: string
  dealers: { company_name: string } | { company_name: string }[] | null
}

// recorded_by / verified_by / changed_by are bare uuid columns with no FK to
// profiles (predates the profiles table — see 0001_profiles_and_rls.sql), so
// PostgREST nested-select can't join them; resolved separately below.
export async function getAuditEvents(supabase: SupabaseClient): Promise<AuditEvent[]> {
  const [{ data: rows }, { data: revisionRows }, { data: rateHistoryRows }] = await Promise.all([
    supabase
      .from('transactions')
      .select(
        'id, created_at, type, package, points, money_rm, status, recorded_by, verified_by, flag_reason, note, adjusts_id, dealers(company_name)'
      )
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('company_statement_revisions')
      .select('id, month, company_total_points, company_profit_rm, note, recorded_by, created_at')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('dealer_rate_history')
      .select('id, old_package, old_rate, new_package, new_rate, changed_by, created_at, dealers(company_name)')
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const txRows = (rows ?? []) as unknown as TxRow[]
  const revisions = (revisionRows ?? []) as RevisionRow[]
  const rateHistory = (rateHistoryRows ?? []) as unknown as RateHistoryRow[]

  const staffIds = new Set<string>()
  for (const tx of txRows) {
    if (tx.recorded_by) staffIds.add(tx.recorded_by)
    if (tx.verified_by) staffIds.add(tx.verified_by)
  }
  for (const rev of revisions) {
    if (rev.recorded_by) staffIds.add(rev.recorded_by)
  }
  for (const rh of rateHistory) {
    if (rh.changed_by) staffIds.add(rh.changed_by)
  }

  const { data: profiles } = staffIds.size
    ? await supabase.from('profiles').select('id, name, email').in('id', [...staffIds])
    : { data: [] }

  const nameById = new Map<string, string>()
  for (const p of profiles ?? []) {
    nameById.set(p.id, p.name ?? p.email ?? '—')
  }
  const displayName = (id: string | null) => (id ? (nameById.get(id) ?? '—') : '—')

  const events: AuditEvent[] = []

  for (const tx of txRows) {
    const dealerName = Array.isArray(tx.dealers) ? tx.dealers[0]?.company_name : tx.dealers?.company_name
    const typeLabel = tx.type === 'package' ? `Buy Package ${tx.package}` : tx.type === 'adjustment' ? 'Adjustment' : 'Regular Top-up'
    const eventLabel =
      tx.type === 'adjustment'
        ? tx.status === 'verified'
          ? 'Verified adjustment'
          : tx.status === 'flagged'
            ? 'Flagged adjustment'
            : 'Recorded adjustment'
        : tx.status === 'verified'
          ? 'Verified top-up'
          : tx.status === 'flagged'
            ? 'Flagged top-up'
            : 'Recorded top-up'
    events.push({
      id: `tx-${tx.id}`,
      createdAt: tx.created_at,
      kind: 'transaction',
      actor: tx.status === 'pending' ? displayName(tx.recorded_by) : displayName(tx.verified_by),
      event: eventLabel,
      dealer: dealerName ?? null,
      amount: `RM ${tx.money_rm.toLocaleString()}`,
      status: tx.status,
      detail: [
        { label: 'Type', value: typeLabel },
        { label: 'Points', value: `${tx.points.toLocaleString()} pts` },
        { label: 'Collected', value: `RM ${tx.money_rm.toLocaleString()}` },
        { label: 'Recorded by', value: displayName(tx.recorded_by) },
        ...(tx.status !== 'pending'
          ? [{ label: tx.status === 'verified' ? 'Verified by' : 'Flagged by', value: displayName(tx.verified_by) }]
          : []),
        ...(tx.status === 'flagged' && tx.flag_reason ? [{ label: 'Reason', value: tx.flag_reason }] : []),
        ...(tx.type === 'adjustment' && tx.note ? [{ label: 'Reason', value: tx.note }] : []),
        ...(tx.type === 'adjustment' && tx.adjusts_id ? [{ label: 'Corrects', value: `Transaction #${tx.adjusts_id.slice(0, 8).toUpperCase()}` }] : []),
      ],
    })
  }

  for (const rev of revisions) {
    events.push({
      id: `rev-${rev.id}`,
      createdAt: rev.created_at,
      kind: 'reconciliation',
      actor: displayName(rev.recorded_by),
      event: 'Saved reconciliation',
      dealer: null,
      amount: rev.company_profit_rm != null ? `RM ${rev.company_profit_rm.toLocaleString()}` : '—',
      status: null,
      detail: [
        { label: 'Month', value: formatMonthLabel(rev.month) },
        { label: 'Vibe top-up', value: rev.company_total_points != null ? `${rev.company_total_points.toLocaleString()} pts` : '—' },
        { label: 'Your 2%', value: rev.company_profit_rm != null ? `RM ${rev.company_profit_rm.toLocaleString()}` : '—' },
        { label: 'Saved by', value: displayName(rev.recorded_by) },
        ...(rev.note ? [{ label: 'Note', value: rev.note }] : []),
      ],
    })
  }

  for (const rh of rateHistory) {
    const dealerName = Array.isArray(rh.dealers) ? rh.dealers[0]?.company_name : rh.dealers?.company_name
    const before = rh.old_package ? `${rh.old_package} · ${rh.old_rate}%` : 'Not set'
    const after = rh.new_package ? `${rh.new_package} · ${rh.new_rate}%` : '—'
    events.push({
      id: `rate-${rh.id}`,
      createdAt: rh.created_at,
      kind: 'rate_change',
      actor: displayName(rh.changed_by),
      event: 'Changed rate',
      dealer: dealerName ?? null,
      amount: `${before} → ${after}`,
      status: null,
      detail: [
        { label: 'Before', value: before },
        { label: 'After', value: after },
        { label: 'Changed by', value: displayName(rh.changed_by) },
      ],
    })
  }

  events.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  return events
}

export type AuditFilters = {
  q?: string
  kind?: 'all' | AuditKind
  actor?: string
  month?: string
}

export function filterAuditEvents(events: AuditEvent[], filters: AuditFilters): AuditEvent[] {
  return events.filter((e) => {
    if (filters.kind && filters.kind !== 'all' && e.kind !== filters.kind) return false
    if (filters.actor && filters.actor !== 'all' && e.actor !== filters.actor) return false
    if (filters.month) {
      const dateKey = new Date(e.createdAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' })
      if (!dateKey.startsWith(filters.month)) return false
    }
    if (filters.q) {
      const q = filters.q.toLowerCase()
      // detail values carry the free-text bits (flag/adjustment reasons,
      // reconciliation notes) — without them, searching "why was this
      // flagged" only worked if you already knew the actor or dealer name.
      const detailText = e.detail.map((d) => d.value).join(' ')
      const haystack = `${e.actor} ${e.dealer ?? ''} ${e.event} ${detailText}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })
}

function dayLabel(dateKey: string): string {
  if (dateKey === todayInMalaysia()) return 'Today'
  if (dateKey === yesterdayInMalaysia()) return 'Yesterday'
  return formatDateLabel(dateKey)
}

export function groupByDay(events: AuditEvent[]): { label: string; events: AuditEvent[] }[] {
  const groups: { label: string; events: AuditEvent[] }[] = []
  let currentKey = ''
  for (const e of events) {
    const dateKey = new Date(e.createdAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' })
    if (dateKey !== currentKey) {
      currentKey = dateKey
      groups.push({ label: dayLabel(dateKey), events: [] })
    }
    groups[groups.length - 1].events.push(e)
  }
  return groups
}

export function formatEventTime(iso: string): string {
  return new Date(iso).toLocaleString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    hour: '2-digit',
    minute: '2-digit',
  })
}
