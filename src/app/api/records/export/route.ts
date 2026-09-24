import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { monthRange } from '@/lib/month'
import { csvCell } from '@/lib/csv'
import { sanitizeSearchTerm } from '@/lib/search'
import { fetchAll } from '@/lib/fetch-all'

const DELIVERY_LABEL: Record<string, string> = { na: '—', pending: 'Pending', sent: 'Sent' }

type TxRow = {
  tx_date: string
  type: 'package' | 'topup' | 'adjustment'
  package: string | null
  quantity: number | null
  points: number
  money_rm: number
  rate: number | null
  commission_rm: number
  coupon_rm: number
  delivery_status: string
  status: 'pending' | 'verified' | 'flagged'
  dealers: { company_name: string } | { company_name: string }[] | null
}

// Mirrors /records' own filters (status/type/month/date range/amount range/
// recorded-by/q/dealer/sort) so "Export" downloads exactly what's currently on
// screen, not the unfiltered full table. Every filter added to the page has to
// be added here in the same commit: an Export that quietly ignores one hands
// someone a file that disagrees with the screen they exported it from, and
// that file is what ends up in a dispute.
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
  const txType = ['package', 'topup', 'adjustment'].includes(params.get('type') ?? '') ? params.get('type')! : ''
  const rawMin = params.get('min') ?? ''
  const rawMax = params.get('max') ?? ''
  const minRm = rawMin.trim() !== '' && Number.isFinite(Number(rawMin)) ? Number(rawMin) : null
  const maxRm = rawMax.trim() !== '' && Number.isFinite(Number(rawMax)) ? Number(rawMax) : null
  const isDate = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '')
  const dateFrom = isDate(params.get('from'))
  const dateTo = isDate(params.get('to'))
  const recordedBy = /^[0-9a-f-]{36}$/i.test(params.get('by') ?? '') ? params.get('by')! : ''

  const supabase = await createClient()
  const safeQ = sanitizeSearchTerm(q)
  let searchOr: string | null = null
  if (safeQ) {
    // Matches /records' own search exactly (dealer name OR note OR
    // flag_reason) — previously name-only here, so a search that matched a
    // flag/adjustment reason on screen exported an empty file.
    const { data: matchingDealers } = await supabase.from('dealers').select('id').ilike('company_name', `%${safeQ}%`)
    const dealerIds = (matchingDealers ?? []).map((d) => d.id)
    const orParts = [`note.ilike.%${safeQ}%`, `flag_reason.ilike.%${safeQ}%`]
    if (dealerIds.length) orParts.push(`dealer_id.in.(${dealerIds.join(',')})`)
    searchOr = orParts.join(',')
  }

  // A fresh query per page: each request is built and sent on its own, and a shared builder
  // would have its range overwritten by the request racing it.
  const build = () => {
    let query = supabase
      .from('transactions')
      .select('tx_date, type, package, quantity, points, money_rm, rate, commission_rm, coupon_rm, delivery_status, status, dealers(company_name)')
      .order('tx_date', { ascending: sortAscending })
      .order('created_at', { ascending: sortAscending })
      .order('id')
    if (status !== 'all') query = query.eq('status', status)
    if (txType) query = query.eq('type', txType)
    if (month) {
      const { start, end } = monthRange(month)
      query = query.gte('tx_date', start).lte('tx_date', end)
    }
    if (dateFrom) query = query.gte('tx_date', dateFrom)
    if (dateTo) query = query.lte('tx_date', dateTo)
    if (minRm != null) query = query.gte('money_rm', minRm)
    if (maxRm != null) query = query.lte('money_rm', maxRm)
    if (recordedBy) query = query.eq('recorded_by', recordedBy)
    if (dealerId) query = query.eq('dealer_id', dealerId)
    if (searchOr) query = query.or(searchOr)
    return query
  }

  // All of it. The old ".limit(2000)" was really 1,000 — the API caps every request there and
  // says nothing — so `truncated` below could never be true and the file was cut with no
  // warning: "export the audit trail" quietly meant "the newest third of it". Now paged to the
  // end; fetchAll refuses (rather than truncates) if a filter somehow matches 200,000 rows.
  const rows = await fetchAll<TxRow>((from, to) => build().range(from, to) as unknown as PromiseLike<{ data: TxRow[] | null; error: { message: string } | null }>)
  const txRows = rows

  const lines = [
    ['Date', 'Dealer', 'Type', 'In (RM)', 'Out (pts)', 'Rate', 'Your 2%', 'Coupon (RM)', 'Delivery', 'Status'].map(csvCell).join(','),
  ]
  for (const tx of txRows) {
    const rel = tx.dealers
    const dealerName = (Array.isArray(rel) ? rel[0]?.company_name : rel?.company_name) ?? '—'
    lines.push(
      [
        csvCell(tx.tx_date),
        csvCell(dealerName),
        // The export is what gets reconciled against the carrier's own
        // statement, so it has to carry the count too — a spreadsheet row
        // reading "Package C" against RM3,810 is the same lie the screen used
        // to tell, and harder to catch once it is out of the app.
        csvCell(
          tx.type === 'package'
            ? Number(tx.quantity ?? 1) > 1
              ? `${tx.quantity} × Package ${tx.package}`
              : `Package ${tx.package}`
            : tx.type === 'adjustment'
              ? 'Correction'
              : 'Top-up'
        ),
        // Number(...) — these arrive over PostgREST as numeric-typed JSON
        // strings, not real numbers, despite TxRow's type claiming otherwise.
        // Passed raw, a negative amount (any adjustment correction) hits
        // csvCell's string-only formula-injection guard and gets corrupted
        // into text ('-50.10) instead of staying a real negative number.
        csvCell(Number(tx.money_rm)),
        csvCell(Number(tx.points)),
        csvCell(tx.rate != null ? `${tx.rate}%` : ''),
        csvCell(Number(tx.commission_rm)),
        csvCell(Number(tx.coupon_rm) > 0 ? Number(tx.coupon_rm) : ''),
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
