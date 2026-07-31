import type { Metadata } from 'next'
import { Fragment } from 'react'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/dal'
import { PermissionDenied } from '../permission-denied'
import { createClient } from '@/lib/supabase/server'
import { getFilteredAuditEvents, groupByDay, formatEventTime, type AuditKind } from '@/lib/audit-events'
import { todayInMalaysia } from '@/lib/month'
import { IconSearch } from '../icons'
import { Listbox } from '../listbox'
import { MonthPicker } from '../month-picker'
import { AuditRow } from './audit-row'
import { ScrollFade } from '../scroll-fade'
import { PageHeader } from '../page-header'

export const metadata: Metadata = {
  title: 'Audit Log — DealerHub',
}

type View = 'all' | AuditKind

const VIEW_LABEL: Record<View, string> = {
  all: 'All',
  transaction: 'Transactions',
  reconciliation: 'Reconciliation',
  package_change: 'Package changes',
}

type PageProps = {
  searchParams: Promise<{ q?: string; view?: string; actor?: string; month?: string; before?: string }>
}

export default async function AuditPage({ searchParams }: PageProps) {
  const user = await requireUser()

  if (user.role !== 'master') {
    return <PermissionDenied role={user.role} action="view the audit log" />
  }

  const { q = '', view: rawView = 'all', actor = 'all', month = '', before } = await searchParams
  const view: View = rawView === 'transaction' || rawView === 'reconciliation' || rawView === 'package_change' ? rawView : 'all'

  const supabase = await createClient()
  // Walks back through history looking for matches (capped, not unbounded)
  // rather than filtering just the most-recent page — a search/actor/month
  // filter with no hits in the last 75 events used to show "no results" even
  // when real matches existed further back, while the export of the exact
  // same filters (which does walk full history) correctly found them.
  const { events: filtered, hasMore, nextCursor } = await getFilteredAuditEvents(supabase, { q, kind: view, actor, month }, { before })
  // All staff, not just those with an event on the currently-loaded page —
  // otherwise a staff member whose actions are all further back than what's
  // loaded couldn't even be selected as a filter option.
  const { data: profileRows } = await supabase.from('profiles').select('name, email').order('name')
  const actors = Array.from(new Set((profileRows ?? []).map((p) => p.name ?? p.email ?? '—'))).sort()

  const groups = groupByDay(filtered)

  function viewHref(v: View) {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (actor !== 'all') params.set('actor', actor)
    if (month) params.set('month', month)
    if (v !== 'all') params.set('view', v)
    const qs = params.toString()
    return `/audit${qs ? `?${qs}` : ''}`
  }

  const loadOlderParams = new URLSearchParams()
  if (q) loadOlderParams.set('q', q)
  if (actor !== 'all') loadOlderParams.set('actor', actor)
  if (month) loadOlderParams.set('month', month)
  if (view !== 'all') loadOlderParams.set('view', view)
  if (nextCursor) loadOlderParams.set('before', nextCursor)
  const loadOlderHref = `/audit?${loadOlderParams.toString()}`

  const exportParams = new URLSearchParams()
  if (q) exportParams.set('q', q)
  if (actor !== 'all') exportParams.set('actor', actor)
  if (month) exportParams.set('month', month)
  if (view !== 'all') exportParams.set('view', view)
  const exportHref = `/api/audit/export${exportParams.toString() ? `?${exportParams.toString()}` : ''}`

  const hasFilter = Boolean(q) || actor !== 'all' || Boolean(month) || view !== 'all'

  return (
    <>
      <PageHeader
        title="Audit Log"
        // Deliberately no hero figure here, unlike every other page. This is a
        // record, not a queue — there is no "what needs you" to state, and a
        // large event count would be a number nobody acts on. The same
        // reasoning keeps one off Account Settings. Applying the pattern
        // everywhere regardless of whether the page has an answer would be
        // cargo-culting it.
        subtitle="Every transaction, reconciliation save and package change — who did it and when. One row per event; open any row for the full detail."
        meta={<span className="inline-flex items-center gap-1.5 rounded-full border border-ink-800 bg-ink-850 px-2.5 py-1 text-[11px] font-bold text-paper-dim">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-2.5 w-2.5">
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
            Read-only
          </span>}
        action={<a href={exportHref} className="btn-ghost shrink-0">⤓ Export</a>}
      />

      <div className="app-card">
      <form className="mb-4 flex flex-wrap gap-3" action="/audit" method="GET">
        {view !== 'all' && <input type="hidden" name="view" value={view} />}
        <label className="mini-search w-64 max-w-full transition-colors focus-within:border-primary">
          <IconSearch className="h-4 w-4 shrink-0" />
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search dealer, actor, or reason…"
            className="w-full bg-transparent text-sm text-paper outline-none placeholder:text-paper-dim/70"
          />
        </label>
        <div className="w-44">
          <Listbox name="actor" defaultValue={actor} options={[{ value: 'all', label: 'All actors' }, ...actors.map((a) => ({ value: a, label: a }))]} />
        </div>
        <div className="w-44">
          <MonthPicker name="month" defaultValue={month} placeholder="All months" allowClear today={todayInMalaysia().slice(0, 7)} />
        </div>
        <button type="submit" className="btn-primary">
          Filter
        </button>
        <div className="ml-auto segmented">
          {(Object.keys(VIEW_LABEL) as View[]).map((v) => (
            <Link key={v} href={viewHref(v)} className={`segmented-btn ${view === v ? 'active' : ''}`}>
              {VIEW_LABEL[v]}
            </Link>
          ))}
        </div>
      </form>

      {filtered.length ? (
        <ScrollFade label="Audit event history">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="th">Time</th>
                <th className="th">Actor</th>
                <th className="th">Event</th>
                <th className="th">Dealer</th>
                <th className="th text-right">Amount / Points</th>
                <th className="th">Status</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group, i) => (
                <Fragment key={`${group.label}-${i}`}>
                  <tr>
                    <td colSpan={7} className="border-b border-ink-800 bg-ink-850 px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-wide text-paper-dim">
                      {group.label}
                    </td>
                  </tr>
                  {group.events.map((e) => (
                    <AuditRow
                      key={e.id}
                      row={{
                        id: e.id,
                        time: formatEventTime(e.createdAt),
                        actor: e.actor,
                        event: e.event,
                        dealer: e.dealer,
                        amount: e.amount,
                        points: e.points,
                        packageChange: e.packageChange,
                        status: e.status,
                        detail: e.detail,
                      }}
                    />
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </ScrollFade>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-ink-800 py-12 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-ink-850 text-paper-dim">
            <IconSearch className="h-5 w-5" />
          </span>
          <p className="text-sm text-paper-dim">
            {hasFilter
              ? hasMore
                ? 'No matches in the history searched so far — try Load older to keep searching further back.'
                : 'No events match those filters.'
              : "Once your team verifies a top-up, saves a reconciliation, or assigns a dealer's package, it'll show up here — permanently, and searchable."}
          </p>
          {hasFilter && (
            <Link href="/audit" className="btn-ghost text-xs">
              Clear filters
            </Link>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-ink-800 pt-3">
        <span className="text-[11.5px] text-paper-dim">{filtered.length} events</span>
        {hasMore && (
          <Link href={loadOlderHref} className="btn-ghost text-xs">
            Load older events ↓
          </Link>
        )}
      </div>
      </div>
    </>
  )
}
