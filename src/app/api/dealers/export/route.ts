import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'

function csvCell(value: string | number | null) {
  if (value == null) return ''
  // Prevent CSV/Excel formula injection: several of these columns are free
  // text (entered by CS on onboarding) and get opened directly in Excel/Sheets.
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(value)) {
    value = `'${value}`
  }
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const ALL_COLUMNS = ['company_name', 'company_no', 'contact_person', 'phone', 'email', 'region', 'address', 'package', 'rate', 'status'] as const

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
  let query = supabase.from('dealers').select(COLUMNS.join(', ')).order('company_name', { ascending: true })

  if (q) {
    const safeQ = q.replace(/[,()%]/g, '')
    if (safeQ) query = query.or(`company_name.ilike.%${safeQ}%,region.ilike.%${safeQ}%,contact_person.ilike.%${safeQ}%`)
  }
  if (region !== 'all') query = query.eq('region', region)

  const { data: rows } = await query

  let filtered = (rows ?? []) as unknown as Record<(typeof COLUMNS)[number], string | number | null>[]
  if (view === 'inactive') {
    const { getDealerActivityMap } = await import('@/lib/dealer-activity')
    const { data: idRows } = await supabase.from('dealers').select('id, company_name').order('company_name')
    const activityMap = await getDealerActivityMap(supabase)
    const inactiveNames = new Set(
      (idRows ?? []).filter((d) => activityMap.get(d.id)?.isInactive).map((d) => d.company_name)
    )
    filtered = filtered.filter((r) => inactiveNames.has(String(r.company_name)))
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
