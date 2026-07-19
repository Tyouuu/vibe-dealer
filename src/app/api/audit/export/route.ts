import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { getFilteredAuditEvents, type AuditKind } from '@/lib/audit-events'
import { csvCell } from '@/lib/csv'

// The Audit Log page only ever shows one page (75 merged events) at a time —
// export is the one place that's supposed to answer "the complete record",
// so it scans much deeper (up to EXPORT_SCAN_CAP raw events, not just
// AUDIT_PAGE_SIZE's default) looking for up to EXPORT_CAP matches, with an
// honest truncation notice if even that isn't enough (same pattern as
// /api/records/export). Filtering happens as part of the same scan (see
// getFilteredAuditEvents) rather than after a flat unfiltered fetch — a flat
// cap-then-filter approach means narrowing the filters can't ever reach
// further back, which made the "narrow your filters and export again"
// message below actively wrong for a filter matching something older than
// the raw cap.
const EXPORT_CAP = 5000
const EXPORT_SCAN_CAP = 50000

export async function GET(request: NextRequest) {
  const user = await requireUser()
  if (user.role !== 'master') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const params = request.nextUrl.searchParams
  const q = params.get('q') ?? ''
  const actor = params.get('actor') ?? 'all'
  const month = params.get('month') ?? ''
  const rawView = params.get('view') ?? 'all'
  const view: 'all' | AuditKind = rawView === 'transaction' || rawView === 'reconciliation' || rawView === 'rate_change' ? rawView : 'all'

  const supabase = await createClient()
  const { events, hasMore: truncated } = await getFilteredAuditEvents(
    supabase,
    { q, kind: view, actor, month },
    { pageSize: EXPORT_CAP, scanCap: EXPORT_SCAN_CAP }
  )

  const columns = ['Time', 'Actor', 'Event', 'Dealer', 'Amount', 'Status'] as const
  const lines = [columns.map(csvCell).join(',')]
  for (const e of events) {
    lines.push(
      [
        csvCell(
          new Date(e.createdAt).toLocaleString('en-MY', {
            timeZone: 'Asia/Kuala_Lumpur',
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })
        ),
        csvCell(e.actor),
        csvCell(e.event),
        csvCell(e.dealer),
        csvCell(e.amount),
        csvCell(e.status),
      ].join(',')
    )
  }

  if (truncated) {
    lines.push([csvCell(`⚠ Hit the ${EXPORT_CAP.toLocaleString()}-event export cap — this is not the full result set. Narrow your filters and export again to see the rest.`)].join(','))
  }

  const csv = '﻿' + lines.join('\r\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
