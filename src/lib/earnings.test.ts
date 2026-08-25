import { describe, expect, it } from 'vitest'
import { earningsFrom, periodRange, isEarningsPeriod, type EarningsTx } from './earnings'

const tx = (o: Partial<EarningsTx>): EarningsTx => ({
  dealer_id: 'd1',
  tx_date: '2026-08-26',
  type: 'topup',
  package: null,
  quantity: 1,
  status: 'verified',
  commission_rm: 0,
  ...o,
})

describe('earningsFrom', () => {
  it('adds the two kinds of money and keeps them apart', () => {
    // One Package C — 100 cards at RM1.50 — plus 2% on its 1,000 points.
    const t = earningsFrom([tx({ type: 'package', package: 'C', quantity: 1, commission_rm: 20 })])
    expect(t.cardRm).toBe(150)
    expect(t.commissionRm).toBe(20)
    expect(t.totalRm).toBe(170)
    expect(t.cards).toBe(100)
  })

  it('multiplies the card money by the quantity on the row', () => {
    // The whole reason 0048 exists: three packages on one row.
    const t = earningsFrom([tx({ type: 'package', package: 'A', quantity: 3, commission_rm: 18 })])
    expect(t.cards).toBe(60)
    expect(t.cardRm).toBe(90)
    expect(t.byDealer[0].packagesLabel).toBe('3 × A')
  })

  it('leaves pending money outside the total and names it separately', () => {
    // A figure that moves on a row nobody has checked is the figure that gets
    // argued about later.
    const t = earningsFrom([
      tx({ type: 'package', package: 'C', quantity: 1, commission_rm: 20 }),
      tx({ type: 'package', package: 'C', quantity: 1, commission_rm: 20, status: 'pending' }),
    ])
    expect(t.totalRm).toBe(170)
    expect(t.pendingRm).toBe(170)
    expect(t.pendingCount).toBe(1)
  })

  it('ignores a flagged row entirely — not pending, not counted', () => {
    const t = earningsFrom([tx({ type: 'package', package: 'C', commission_rm: 20, status: 'flagged' })])
    expect(t.totalRm).toBe(0)
    expect(t.pendingRm).toBe(0)
    expect(t.pendingCount).toBe(0)
  })

  it('ranks dealers by what they were worth, biggest first', () => {
    const t = earningsFrom([
      tx({ dealer_id: 'small', commission_rm: 10 }),
      tx({ dealer_id: 'big', type: 'package', package: 'C', quantity: 2, commission_rm: 40 }),
      tx({ dealer_id: 'middle', type: 'package', package: 'A', quantity: 1, commission_rm: 6 }),
    ])
    expect(t.byDealer.map((d) => d.dealerId)).toEqual(['big', 'middle', 'small'])
  })

  it('breaks a tie the same way every time, so the list does not shuffle itself', () => {
    // This page refreshes whenever a sale lands. Two dealers on the same
    // figure swapping places on every refresh is unreadable under a thumb.
    const rows = [tx({ dealer_id: 'bbb', commission_rm: 50 }), tx({ dealer_id: 'aaa', commission_rm: 50 })]
    expect(earningsFrom(rows).byDealer.map((d) => d.dealerId)).toEqual(['aaa', 'bbb'])
    expect(earningsFrom([...rows].reverse()).byDealer.map((d) => d.dealerId)).toEqual(['aaa', 'bbb'])
  })

  it('drops a dealer worth nothing rather than listing them at RM 0.00', () => {
    const t = earningsFrom([tx({ dealer_id: 'zero', commission_rm: 0 }), tx({ dealer_id: 'real', commission_rm: 5 })])
    expect(t.byDealer.map((d) => d.dealerId)).toEqual(['real'])
  })

  it('says "3 × B + 1 × C" for a dealer who bought two kinds, A then B then C', () => {
    const t = earningsFrom([
      tx({ type: 'package', package: 'C', quantity: 1 }),
      tx({ type: 'package', package: 'B', quantity: 3 }),
    ])
    expect(t.byDealer[0].packagesLabel).toBe('3 × B + 1 × C')
  })

  it('gives a top-ups-only dealer no package label at all', () => {
    const t = earningsFrom([tx({ commission_rm: 12 })])
    expect(t.byDealer[0].packagesLabel).toBeNull()
    expect(t.byDealer[0].cardRm).toBe(0)
  })

  it('the rows always add up to the headline', () => {
    // The Earnings page prints both, one under the other. If they can ever
    // disagree, the page is arguing with itself in front of the owner.
    const t = earningsFrom([
      tx({ dealer_id: 'a', type: 'package', package: 'A', quantity: 7, commission_rm: 42 }),
      tx({ dealer_id: 'b', type: 'package', package: 'C', quantity: 3, commission_rm: 60 }),
      tx({ dealer_id: 'c', commission_rm: 13.37 }),
    ])
    const sum = Math.round(t.byDealer.reduce((s, d) => s + d.totalRm, 0) * 100) / 100
    expect(sum).toBe(t.totalRm)
  })

  it('treats a null quantity on an old row as one package', () => {
    // Every row written before 0048 carries the column default, but a null
    // must not silently entitle a dealer to nothing.
    const t = earningsFrom([tx({ type: 'package', package: 'B', quantity: null })])
    expect(t.cardRm).toBe(60)
  })
})

describe('periodRange', () => {
  it('today is one day', () => {
    expect(periodRange('today', '2026-08-26')).toEqual({ from: '2026-08-26', to: '2026-08-26' })
  })

  it('this month runs from the first to today, not to the end of the month', () => {
    // A month that has not finished must not count days that have not happened.
    expect(periodRange('month', '2026-08-26')).toEqual({ from: '2026-08-01', to: '2026-08-26' })
  })

  it('all time has no lower bound', () => {
    expect(periodRange('all', '2026-08-26')).toEqual({ from: null, to: '2026-08-26' })
  })
})

describe('isEarningsPeriod', () => {
  it('accepts only the three real periods', () => {
    expect(isEarningsPeriod('today')).toBe(true)
    expect(isEarningsPeriod('month')).toBe(true)
    expect(isEarningsPeriod('all')).toBe(true)
    expect(isEarningsPeriod('year')).toBe(false)
    expect(isEarningsPeriod(undefined)).toBe(false)
  })
})
