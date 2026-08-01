import { describe, expect, it } from 'vitest'
import { balanceSeries, dealersTradingSeries, resolvePeriod, sameSpanTotal } from './dashboard-period'

const MONTHS = [
  { key: '2026-03', label: 'Mar' },
  { key: '2026-04', label: 'Apr' },
  { key: '2026-05', label: 'May' },
  { key: '2026-06', label: 'Jun' },
  { key: '2026-07', label: 'Jul' },
  { key: '2026-08', label: 'Aug' },
]

describe('resolvePeriod', () => {
  it('honours an explicit month even when the current one has data', () => {
    expect(resolvePeriod('2026-05', MONTHS, new Set(['2026-08', '2026-05']))).toEqual({ key: '2026-05', auto: false })
  })

  it('ignores a month outside the window rather than showing an empty page', () => {
    expect(resolvePeriod('2019-01', MONTHS, new Set(['2026-08']))).toEqual({ key: '2026-08', auto: false })
  })

  it('stays on the current month when it has anything at all', () => {
    expect(resolvePeriod(undefined, MONTHS, new Set(['2026-08']))).toEqual({ key: '2026-08', auto: false })
  })

  it('falls back to the newest month that has data, and says it did', () => {
    expect(resolvePeriod(undefined, MONTHS, new Set(['2026-06', '2026-07']))).toEqual({ key: '2026-07', auto: true })
  })

  it('stays on the current month when nothing anywhere has data', () => {
    expect(resolvePeriod(undefined, MONTHS, new Set())).toEqual({ key: '2026-08', auto: false })
  })
})

describe('sameSpanTotal', () => {
  const rows = [
    { tx_date: '2026-07-01', commission_rm: 10, points: 100 },
    { tx_date: '2026-07-02', commission_rm: 20, points: 200 },
    { tx_date: '2026-07-15', commission_rm: 400, points: 4000 },
    { tx_date: '2026-08-01', commission_rm: 5, points: 50 },
  ]

  it('counts only the days up to the cut, which is the whole point', () => {
    expect(sameSpanTotal(rows, '2026-07', 2, 'commission_rm')).toBe(30)
  })

  it('is not the full-month total — the bug it replaces', () => {
    expect(sameSpanTotal(rows, '2026-07', 31, 'commission_rm')).toBe(430)
  })

  it('includes the cut day itself', () => {
    expect(sameSpanTotal(rows, '2026-07', 1, 'commission_rm')).toBe(10)
  })

  it('ignores other months', () => {
    expect(sameSpanTotal(rows, '2026-08', 31, 'points')).toBe(50)
  })

  it('is zero when the span has nothing in it', () => {
    expect(sameSpanTotal(rows, '2026-06', 30, 'points')).toBe(0)
  })
})

describe('balanceSeries', () => {
  // Balance now is 500. In August 300 was bought and 100 sold, so July closed
  // at 500 - 300 + 100 = 300. In July 0 was bought and 200 sold, so June
  // closed at 300 + 200 = 500.
  const purchases = [{ purchase_date: '2026-08-10', points: 300 }]
  const committed = [
    { tx_date: '2026-08-05', points: 100 },
    { tx_date: '2026-07-20', points: 200 },
  ]

  it('lands exactly on the current balance for the current month', () => {
    const s = balanceSeries(500, purchases, committed, MONTHS)
    expect(s[s.length - 1]).toBe(500)
  })

  it('walks backwards correctly one month at a time', () => {
    const s = balanceSeries(500, purchases, committed, MONTHS)
    expect(s[4]).toBe(300) // end of July
    expect(s[3]).toBe(500) // end of June
  })

  it('treats string points the way PostgREST returns them', () => {
    const s = balanceSeries(500, [{ purchase_date: '2026-08-10', points: '300' }], [{ tx_date: '2026-08-05', points: '100' }], MONTHS)
    expect(s[4]).toBe(300)
  })
})

describe('dealersTradingSeries', () => {
  it('counts each dealer once per month', () => {
    const tx = [
      { tx_date: '2026-07-01', dealer_id: 'a' },
      { tx_date: '2026-07-09', dealer_id: 'a' },
      { tx_date: '2026-07-20', dealer_id: 'b' },
      { tx_date: '2026-08-02', dealer_id: 'c' },
    ]
    expect(dealersTradingSeries(tx, MONTHS)).toEqual([0, 0, 0, 0, 2, 1])
  })
})
