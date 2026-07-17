import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { getAuditEvents, filterAuditEvents, type AuditKind } from '@/lib/audit-events'
import { csvCell } from '@/lib/csv'

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
  const events = filterAuditEvents(await getAuditEvents(supabase), { q, kind: view, actor, month })

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

  const csv = '﻿' + lines.join('\r\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
