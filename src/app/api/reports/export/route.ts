import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { monthRange, currentMonth } from '@/lib/month'
import { csvCell } from '@/lib/csv'

export async function GET(request: NextRequest) {
  const user = await requireUser()
  if (user.role !== 'accountant' && user.role !== 'master') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const month = request.nextUrl.searchParams.get('month') || currentMonth()
  const { start, end } = monthRange(month)

  const supabase = await createClient()
  const { data: rows } = await supabase
    .from('transactions')
    .select('dealer_id, type, package, points, money_rm, commission_rm, dealers(company_name)')
    .eq('status', 'verified')
    .gte('tx_date', start)
    .lte('tx_date', end)

  const byDealer = new Map<string, { name: string; points: number; money: number; commission: number }>()
  // Same 3-way label as the By Package section on the page itself (and
  // Records/Reconcile/dealer-detail) — grouped by that instead of a new
  // categorization, so the exported file reads the same as the screen.
  const byType = new Map<string, { label: string; count: number; points: number; money: number; commission: number }>()
  for (const t of rows ?? []) {
    const rel = t.dealers as { company_name: string } | { company_name: string }[] | null
    const name = (Array.isArray(rel) ? rel[0]?.company_name : rel?.company_name) ?? '—'
    const prev = byDealer.get(t.dealer_id) ?? { name, points: 0, money: 0, commission: 0 }
    prev.points += Number(t.points)
    prev.money += Number(t.money_rm)
    prev.commission += Number(t.commission_rm)
    byDealer.set(t.dealer_id, prev)

    const label = t.type === 'package' ? `Package ${t.package}` : t.type === 'adjustment' ? 'Adjustment' : 'Top-up'
    const prevType = byType.get(label) ?? { label, count: 0, points: 0, money: 0, commission: 0 }
    prevType.count += 1
    prevType.points += Number(t.points)
    prevType.money += Number(t.money_rm)
    prevType.commission += Number(t.commission_rm)
    byType.set(label, prevType)
  }

  const lines = [['Dealer', 'Total Top-up (pts)', 'Money Collected (RM)', 'Your 2% (RM)'].map(csvCell).join(',')]
  for (const d of [...byDealer.values()].sort((a, b) => b.points - a.points)) {
    // Math.round(...)/100, not .toFixed(2) — toFixed returns a string, which
    // re-triggers csvCell's formula-injection guard on any negative amount
    // (a downward adjustment can make a dealer's monthly total negative) and
    // corrupts it into text. A plain rounded number bypasses that guard
    // correctly, same as every other numeric cell in this file already does.
    lines.push([csvCell(d.name), csvCell(d.points), csvCell(Math.round(d.money * 100) / 100), csvCell(Math.round(d.commission * 100) / 100)].join(','))
  }

  lines.push('')
  lines.push(['Type', 'Count', 'Points', 'Money Collected (RM)', 'Your 2% (RM)'].map(csvCell).join(','))
  for (const t of [...byType.values()].sort((a, b) => b.money - a.money)) {
    lines.push(
      [csvCell(t.label), csvCell(t.count), csvCell(t.points), csvCell(Math.round(t.money * 100) / 100), csvCell(Math.round(t.commission * 100) / 100)].join(
        ','
      )
    )
  }

  const csv = '﻿' + lines.join('\r\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="report-${month}.csv"`,
    },
  })
}
