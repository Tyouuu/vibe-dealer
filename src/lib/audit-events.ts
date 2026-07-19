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

// A page is a fixed number of *merged* events across all three sources, not
// a fixed number of rows per source — each source is over-fetched well past
// PAGE_SIZE so the merge-sort picks the true most-recent PAGE_SIZE events
// regardless of which source they came from, then the oldest event actually
// shown becomes the cursor ("before") for the next page. This replaces the
// old flat .limit(100)/.limit(50)/.limit(50) — those caps were invisible (no
// "showing N of M" notice) and had no way to see anything older.
export const AUDIT_PAGE_SIZE = 75
const SOURCE_FETCH_LIMIT = 200

export type AuditPage = { events: AuditEvent[]; hasMore: boolean; nextCursor: string | null }

// recorded_by / verified_by / changed_by are bare uuid columns with no FK to
// profiles (predates the profiles table — see 0001_profiles_and_rls.sql), so
// PostgREST nested-select can't join them; resolved separately below.
export async function getAuditEvents(supabase: SupabaseClient, opts: { before?: string } = {}): Promise<AuditPage> {
  let txQuery = supabase
    .from('transactions')
    .select(
      'id, created_at, type, package, points, money_rm, status, recorded_by, verified_by, flag_reason, note, adjusts_id, dealers(company_name)'
    )
    .order('created_at', { ascending: false })
    .limit(SOURCE_FETCH_LIMIT)
  let revisionQuery = supabase
    .from('company_statement_revisions')
    .select('id, month, company_total_points, company_profit_rm, note, recorded_by, created_at')
    .order('created_at', { ascending: false })
    .limit(SOURCE_FETCH_LIMIT)
  let rateHistoryQuery = supabase
    .from('dealer_rate_history')
    .select('id, old_package, old_rate, new_package, new_rate, changed_by, created_at, dealers(company_name)')
    .order('created_at', { ascending: false })
    .limit(SOURCE_FETCH_LIMIT)

  if (opts.before) {
    txQuery = txQuery.lt('created_at', opts.before)
    revisionQuery = revisionQuery.lt('created_at', opts.before)
    rateHistoryQuery = rateHistoryQuery.lt('created_at', opts.before)
  }

  const [{ data: rows }, { data: revisionRows }, { data: rateHistoryRows }] = await Promise.all([txQuery, revisionQuery, rateHistoryQuery])

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

  const page = events.slice(0, AUDIT_PAGE_SIZE)
  const hasMore = events.length > AUDIT_PAGE_SIZE
  return { events: page, hasMore, nextCursor: hasMore ? page[page.length - 1].createdAt : null }
}

export type AuditFilters = {
  q?: string
  kind?: 'all' | AuditKind
  actor?: string
  month?: string
}

// Safety net on how much raw history one request will scan looking for
// matches — without it, a filter that matches nothing (or matches something
// far in the past) would walk the entire audit history on every page load.
const FILTER_SCAN_CAP = 2000

// The page itself used to call getAuditEvents once and filter only that one
// 75-event page — so a search/actor/month filter with no matches in the
// most recent 75 events showed "no results" even when real matches existed
// further back, while /api/audit/export's identical-looking filters (which
// walk full history) correctly found them. This walks back through history
// the same way export does, just capped tighter for an interactive request,
// so the page and its own export agree on what a given filter matches.
// pageSize/scanCap are overridable so /api/audit/export can reuse this same
// scan-and-filter loop with export-sized limits (more results, much deeper
// scan) instead of duplicating it — previously export scanned a flat 5000
// *raw* events and filtered afterward, so a filter matching something older
// than that window silently found nothing, and its own truncation notice
// ("narrow your filters and export again") couldn't actually help — narrowing
// doesn't reach further back when the raw scan itself is what's capped.
export async function getFilteredAuditEvents(
  supabase: SupabaseClient,
  filters: AuditFilters,
  opts: { before?: string; pageSize?: number; scanCap?: number } = {}
): Promise<AuditPage> {
  const pageSize = opts.pageSize ?? AUDIT_PAGE_SIZE
  const scanCap = opts.scanCap ?? FILTER_SCAN_CAP
  const matched: AuditEvent[] = []
  let before = opts.before
  let scanned = 0
  let lastHasMore = false
  let lastCursor: string | null = null

  for (;;) {
    const rawPage = await getAuditEvents(supabase, { before })
    scanned += rawPage.events.length
    matched.push(...filterAuditEvents(rawPage.events, filters))
    lastHasMore = rawPage.hasMore
    lastCursor = rawPage.nextCursor

    if (matched.length >= pageSize || !rawPage.hasMore || scanned >= scanCap) break
    before = rawPage.nextCursor ?? undefined
  }

  const page = matched.slice(0, pageSize)
  const moreMatchedThanShown = matched.length > pageSize
  return {
    events: page,
    hasMore: moreMatchedThanShown || lastHasMore,
    nextCursor: moreMatchedThanShown ? page[page.length - 1].createdAt : lastCursor,
  }
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
