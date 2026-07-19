import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { csvCell } from '@/lib/csv'
import { sanitizeSearchTerm } from '@/lib/search'

const ALL_COLUMNS = ['company_name', 'company_no', 'contact_person', 'phone', 'email', 'region', 'address', 'notes', 'package', 'rate', 'status'] as const

export async function GET(request: NextRequest) {
  // Same view every role that can see /dealers can already see — export just
  // packages it into a file. rate is a commission figure (PROJECT_SPEC.md
  // section 4: "CS 看不到财务"), so it's excluded for cs same as the page itself.
  const user = await requireUser()
  const COLUMNS = user.role === 'cs' ? ALL_COLUMNS.filter((c) => c !== 'rate') : ALL_COLUMNS

  const params = request.nextUrl.searchParams
  const q = params.get('q') ?? ''
  const region = params.get('region') ?? 'all'
  const view = params.get('view') ?? 'all'

  const supabase = await createClient()
  // cs has no SELECT on the dealers base table (0015) — read through
  // dealers_directory instead, which has every column except rate.
  // id is always fetched (even though it's not one of the exported columns)
  // so the Needs-Follow-up filter below can match by id like the /dealers
  // page itself does — matching by company_name instead would wrongly sweep
  // an unrelated active dealer into the export if two dealers ever share a name.
  let query = supabase
    .from(user.role === 'cs' ? 'dealers_directory' : 'dealers')
    .select(['id', ...COLUMNS].join(', '))
    .order('company_name', { ascending: true })

  if (q) {
    const safeQ = sanitizeSearchTerm(q)
    if (safeQ) query = query.or(`company_name.ilike.%${safeQ}%,region.ilike.%${safeQ}%,contact_person.ilike.%${safeQ}%`)
  }
  if (region !== 'all') query = query.eq('region', region)

  const { data: rows } = await query

  let filtered = (rows ?? []) as unknown as (Record<(typeof COLUMNS)[number], string | number | null> & { id: string })[]
  if (view === 'inactive') {
    const { getDealerActivityMap } = await import('@/lib/dealer-activity')
    const activityMap = await getDealerActivityMap(supabase)
    filtered = filtered.filter((r) => activityMap.get(r.id)?.isInactive)
  }

  const lines = [COLUMNS.map(csvCell).join(',')]
  for (const r of filtered) {
    lines.push(COLUMNS.map((c) => csvCell(r[c])).join(','))
  }

  const csv = '﻿' + lines.join('\r\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="dealers-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
