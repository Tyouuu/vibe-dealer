import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { monthRange } from '@/lib/month'
import { csvCell } from '@/lib/csv'

const DELIVERY_LABEL: Record<string, string> = { na: '—', pending: 'Pending', sent: 'Sent' }

type TxRow = {
  tx_date: string
  type: 'package' | 'topup' | 'adjustment'
  package: string | null
  points: number
  money_rm: number
  rate: number | null
  commission_rm: number
  delivery_status: string
  status: 'pending' | 'verified' | 'flagged'
  dealers: { company_name: string } | { company_name: string }[] | null
}

// Mirrors /records' own filters (status/month/q/sort) so "Export" downloads
// exactly what's currently on screen, not the unfiltered full table.
export async function GET(request: NextRequest) {
  const user = await requireUser()
  if (user.role !== 'accountant' && user.role !== 'master') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const params = request.nextUrl.searchParams
  const status = params.get('status') ?? 'all'
  const month = params.get('month') ?? ''
  const q = params.get('q') ?? ''
  const sortAscending = params.get('sort') === 'asc'

  const supabase = await createClient()
  let query = supabase
    .from('transactions')
    .select('tx_date, type, package, points, money_rm, rate, commission_rm, delivery_status, status, dealers(company_name)')
    .order('tx_date', { ascending: sortAscending })
    .order('created_at', { ascending: sortAscending })
    .limit(2000)

  if (status !== 'all') query = query.eq('status', status)
  if (month) {
    const { start, end } = monthRange(month)
    query = query.gte('tx_date', start).lte('tx_date', end)
  }
  const safeQ = q.replace(/[,()%]/g, '').trim()
  if (safeQ) {
    const { data: matchingDealers } = await supabase.from('dealers').select('id').ilike('company_name', `%${safeQ}%`)
    const dealerIds = (matchingDealers ?? []).map((d) => d.id)
    query = query.in('dealer_id', dealerIds.length ? dealerIds : ['00000000-0000-0000-0000-000000000000'])
  }

  const { data: rows } = await query

  const lines = [
    ['Date', 'Dealer', 'Type', 'In (RM)', 'Out (pts)', 'Rate', 'Your 2%', 'Delivery', 'Status'].map(csvCell).join(','),
  ]
  for (const tx of (rows as unknown as TxRow[] | null) ?? []) {
    const rel = tx.dealers
    const dealerName = (Array.isArray(rel) ? rel[0]?.company_name : rel?.company_name) ?? '—'
    lines.push(
      [
        csvCell(tx.tx_date),
        csvCell(dealerName),
        csvCell(tx.type === 'package' ? `Package ${tx.package}` : tx.type === 'adjustment' ? 'Adjustment' : 'Top-up'),
        csvCell(tx.money_rm),
        csvCell(tx.points),
        csvCell(tx.rate != null ? `${tx.rate}%` : ''),
        csvCell(tx.commission_rm),
        csvCell(DELIVERY_LABEL[tx.delivery_status] ?? tx.delivery_status),
        csvCell(tx.status),
      ].join(',')
    )
  }

  const csv = '﻿' + lines.join('\r\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="transactions-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
