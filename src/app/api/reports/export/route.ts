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
  // The same four things the page reads, so the file and the screen agree.
  // This export used to carry the dealer and type tables only, which meant it
  // stated the 2% and nothing else — no SIM margin, no note of what had been
  // excluded, no word on whether the month had been agreed with Vibe.
  const [{ data: rows }, { data: allTx }, { data: simOrders }, { data: statement }] = await Promise.all([
    supabase
      .from('transactions')
      .select('dealer_id, type, package, points, money_rm, commission_rm, dealers(company_name)')
      .eq('status', 'verified')
      .gte('tx_date', start)
      .lte('tx_date', end),
    supabase.from('transactions').select('status, points, money_rm, commission_rm').gte('tx_date', start).lte('tx_date', end),
    supabase.from('sim_orders').select('sim_type, quantity, unit_price_rm, unit_cost_rm, shipping_fee_rm').gte('order_date', start).lte('order_date', end),
    supabase.from('company_statements').select('reconciled, company_total_points').eq('month', `${month}-01`).maybeSingle(),
  ])

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

  const r2 = (n: number) => Math.round(n * 100) / 100
  const sim = (simOrders ?? []) as { sim_type: string; quantity: number; unit_price_rm: number | string; unit_cost_rm: number | string; shipping_fee_rm: number | string | null }[]
  const simRevenue = sim.reduce((s, o) => s + o.quantity * Number(o.unit_price_rm), 0)
  const simShipping = sim.reduce((s, o) => s + Number(o.shipping_fee_rm ?? 0), 0)
  const simCards = sim.reduce((s, o) => s + o.quantity, 0)
  // Net of shipping, matching every margin figure in the app now.
  const simMargin = sim.reduce((s, o) => s + o.quantity * (Number(o.unit_price_rm) - Number(o.unit_cost_rm)) - Number(o.shipping_fee_rm ?? 0), 0)

  const every = (allTx ?? []) as { status: string; points: number | string; money_rm: number | string; commission_rm: number | string }[]
  const verifiedPoints = every.filter((t) => t.status === 'verified').reduce((s, t) => s + Number(t.points), 0)
  const verifiedCommission = every.filter((t) => t.status === 'verified').reduce((s, t) => s + Number(t.commission_rm), 0)
  const verifiedMoney = every.filter((t) => t.status === 'verified').reduce((s, t) => s + Number(t.money_rm), 0)
  const held = every.filter((t) => t.status !== 'verified')
  const companyPoints = statement?.company_total_points != null ? Number(statement.company_total_points) : null

  // A summary block first, so the file opens with what the month made rather
  // than with a table of dealers.
  const lines: string[] = [['Monthly report', month].map(csvCell).join(',')]
  lines.push(['What you made (RM)', r2(verifiedCommission + simMargin)].map(csvCell).join(','))
  lines.push(['  Points — your 2% (RM)', r2(verifiedCommission)].map(csvCell).join(','))
  lines.push(['  SIM cards — margin after shipping (RM)', r2(simMargin)].map(csvCell).join(','))
  lines.push(['Money collected (RM)', r2(verifiedMoney + simRevenue)].map(csvCell).join(','))
  lines.push(['  Points (RM)', r2(verifiedMoney)].map(csvCell).join(','))
  lines.push(['  SIM cards (RM)', r2(simRevenue)].map(csvCell).join(','))
  lines.push(['Total top-up (pts)', verifiedPoints].map(csvCell).join(','))
  lines.push(['SIM cards sold', simCards].map(csvCell).join(','))
  lines.push(['SIM shipping paid (RM)', r2(simShipping)].map(csvCell).join(','))
  lines.push(
    ['Not counted', held.length ? `${held.length} transaction(s), ${held.reduce((s, t) => s + Number(t.points), 0)} pts` : 'nothing'].map(csvCell).join(',')
  )
  lines.push(
    [
      'Checked against Vibe',
      companyPoints == null
        ? 'statement not entered'
        : `Vibe ${companyPoints} pts, difference ${r2(verifiedPoints - companyPoints)} pts, month ${statement?.reconciled ? 'closed' : 'open'}`,
    ]
      .map(csvCell)
      .join(',')
  )
  lines.push('')

  lines.push(['Dealer', 'Total Top-up (pts)', 'Money Collected (RM)', 'Your 2% (RM)'].map(csvCell).join(','))
  for (const d of [...byDealer.values()].sort((a, b) => b.points - a.points)) {
    // Math.round(...)/100, not .toFixed(2) — toFixed returns a string, which
    // re-triggers csvCell's formula-injection guard on any negative amount
    // (a downward adjustment can make a dealer's monthly total negative) and
    // corrupts it into text. A plain rounded number bypasses that guard
    // correctly, same as every other numeric cell in this file already does.
    lines.push([csvCell(d.name), csvCell(d.points), csvCell(r2(d.money)), csvCell(r2(d.commission))].join(','))
  }

  lines.push('')
  lines.push(['Type', 'Count', 'Points', 'Money Collected (RM)', 'Your 2% (RM)'].map(csvCell).join(','))
  for (const t of [...byType.values()].sort((a, b) => b.money - a.money)) {
    lines.push(
      [csvCell(t.label), csvCell(t.count), csvCell(t.points), csvCell(r2(t.money)), csvCell(r2(t.commission))].join(',')
    )
  }

  // The second revenue line gets its own table, the way the first two do.
  const bySim = new Map<string, { label: string; orders: number; cards: number; revenue: number; shipping: number; margin: number }>()
  for (const o of sim) {
    const label = o.sim_type === 'esim' ? 'eSIM' : o.sim_type === 'physical_no_number' ? 'Physical (No Number)' : 'Physical (With Number)'
    const p = bySim.get(label) ?? { label, orders: 0, cards: 0, revenue: 0, shipping: 0, margin: 0 }
    p.orders += 1
    p.cards += o.quantity
    p.revenue += o.quantity * Number(o.unit_price_rm)
    p.shipping += Number(o.shipping_fee_rm ?? 0)
    p.margin += o.quantity * (Number(o.unit_price_rm) - Number(o.unit_cost_rm)) - Number(o.shipping_fee_rm ?? 0)
    bySim.set(label, p)
  }
  if (bySim.size) {
    lines.push('')
    lines.push(['SIM Type', 'Orders', 'Cards', 'Collected (RM)', 'Shipping (RM)', 'Margin (RM)'].map(csvCell).join(','))
    for (const s of [...bySim.values()].sort((a, b) => b.margin - a.margin)) {
      lines.push([csvCell(s.label), csvCell(s.orders), csvCell(s.cards), csvCell(r2(s.revenue)), csvCell(r2(s.shipping)), csvCell(r2(s.margin))].join(','))
    }
  }

  const csv = '﻿' + lines.join('\r\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="report-${month}.csv"`,
    },
  })
}
