import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { monthRange } from '@/lib/month'
import { csvCell } from '@/lib/csv'
import { sanitizeSearchTerm } from '@/lib/search'

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

// Mirrors /records' own filters (status/month/q/dealer/sort) so "Export" downloads
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
  const dealerId = params.get('dealer') ?? ''
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
  if (dealerId) query = query.eq('dealer_id', dealerId)
  const safeQ = sanitizeSearchTerm(q)
  if (safeQ) {
    // Matches /records' own search exactly (dealer name OR note OR
    // flag_reason) — previously name-only here, so a search that matched a
    // flag/adjustment reason on screen exported an empty file.
    const { data: matchingDealers } = await supabase.from('dealers').select('id').ilike('company_name', `%${safeQ}%`)
    const dealerIds = (matchingDealers ?? []).map((d) => d.id)
    const orParts = [`note.ilike.%${safeQ}%`, `flag_reason.ilike.%${safeQ}%`]
    if (dealerIds.length) orParts.push(`dealer_id.in.(${dealerIds.join(',')})`)
    query = query.or(orParts.join(','))
  }

  const { data: rows } = await query
  const txRows = (rows as unknown as TxRow[] | null) ?? []
  // .limit(2000) with no signal if hit — "export the audit trail" implies
  // "the whole record," so a silently partial file is a real footgun for
  // anyone pulling this for a dispute. Not a precise "there are exactly N
  // more" count, just an honest "this isn't everything, narrow your filter."
  const truncated = txRows.length === 2000

  const lines = [
    ['Date', 'Dealer', 'Type', 'In (RM)', 'Out (pts)', 'Rate', 'Your 2%', 'Delivery', 'Status'].map(csvCell).join(','),
  ]
  for (const tx of txRows) {
    const rel = tx.dealers
    const dealerName = (Array.isArray(rel) ? rel[0]?.company_name : rel?.company_name) ?? '—'
    lines.push(
      [
        csvCell(tx.tx_date),
        csvCell(dealerName),
        csvCell(tx.type === 'package' ? `Package ${tx.package}` : tx.type === 'adjustment' ? 'Adjustment' : 'Top-up'),
        // Number(...) — these arrive over PostgREST as numeric-typed JSON
        // strings, not real numbers, despite TxRow's type claiming otherwise.
        // Passed raw, a negative amount (any adjustment correction) hits
        // csvCell's string-only formula-injection guard and gets corrupted
        // into text ('-50.10) instead of staying a real negative number.
        csvCell(Number(tx.money_rm)),
        csvCell(Number(tx.points)),
        csvCell(tx.rate != null ? `${tx.rate}%` : ''),
        csvCell(Number(tx.commission_rm)),
        csvCell(DELIVERY_LABEL[tx.delivery_status] ?? tx.delivery_status),
        csvCell(tx.status),
      ].join(',')
    )
  }

  if (truncated) {
    lines.push([csvCell('⚠ Hit the 2000-row export cap — this is not the full result set. Narrow your filters and export again to see the rest.')].join(','))
  }

  const csv = '﻿' + lines.join('\r\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="transactions-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
