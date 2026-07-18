import { NextResponse, type NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { getAuditEvents, filterAuditEvents, type AuditEvent, type AuditKind } from '@/lib/audit-events'
import { csvCell } from '@/lib/csv'

// The Audit Log page only ever shows one page (75 merged events) at a time —
// export is the one place that's supposed to answer "the complete record",
// so it pages through getAuditEvents itself rather than reusing the UI's
// single-page fetch, up to a generous cap with an honest truncation notice
// if even that isn't enough (same pattern as /api/records/export).
const EXPORT_CAP = 5000

async function getAllAuditEventsForExport(supabase: SupabaseClient): Promise<{ events: AuditEvent[]; truncated: boolean }> {
  const events: AuditEvent[] = []
  let before: string | undefined
  for (;;) {
    const page = await getAuditEvents(supabase, { before })
    events.push(...page.events)
    if (!page.hasMore || events.length >= EXPORT_CAP) {
      return { events: events.slice(0, EXPORT_CAP), truncated: page.hasMore && events.length >= EXPORT_CAP }
    }
    before = page.nextCursor ?? undefined
  }
}

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
  const { events: allEvents, truncated } = await getAllAuditEventsForExport(supabase)
  const events = filterAuditEvents(allEvents, { q, kind: view, actor, month })

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
