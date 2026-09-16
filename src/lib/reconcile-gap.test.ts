import { describe, it, expect } from 'vitest'
import { findReconciliationGapLeads, type GapTx } from './reconcile-gap'

const tx = (id: string, points: number, txDate: string, dealerName = 'Test Dealer'): GapTx => ({
  id,
  dealerId: `dealer-${id}`,
  points,
  txDate,
  dealerName,
})

describe('findReconciliationGapLeads', () => {
  it('returns nothing when the gap is already zero', () => {
    expect(findReconciliationGapLeads([tx('1', 500, '2026-08-10')], 0, '2026-08-31')).toEqual([])
  })

  it('explains a negative gap without searching — the excess is not in our own rows', () => {
    const rows = [tx('1', 500, '2026-08-10')]
    expect(findReconciliationGapLeads(rows, -300, '2026-08-31')).toEqual([{ kind: 'gap-negative' }])
  })

  it('finds a single transaction that exactly matches the gap', () => {
    const rows = [tx('1', 500, '2026-08-10'), tx('2', 3000, '2026-08-15'), tx('3', 200, '2026-08-20')]
    const result = findReconciliationGapLeads(rows, 3000, '2026-08-31')
    expect(result).toEqual([{ kind: 'exact-single', tx: rows[1] }])
  })

  it('prefers a single match over a pair even when a pair would also work', () => {
    // 500 + 200 also equals 700, but the direct single-row answer is the
    // simpler true lead and should win.
    const rows = [tx('1', 700, '2026-08-10'), tx('2', 500, '2026-08-15'), tx('3', 200, '2026-08-20')]
    const result = findReconciliationGapLeads(rows, 700, '2026-08-31')
    expect(result).toEqual([{ kind: 'exact-single', tx: rows[0] }])
  })

  it('finds a pair of transactions that together match the gap', () => {
    const rows = [tx('1', 500, '2026-08-10'), tx('2', 800, '2026-08-15'), tx('3', 200, '2026-08-20')]
    const result = findReconciliationGapLeads(rows, 700, '2026-08-31')
    expect(result).toEqual([{ kind: 'exact-pair', a: rows[0], b: rows[2] }])
  })

  it('discards pair matches as noise once there are too many of them', () => {
    // Six different pairs summing to 100 -- treated as coincidence, not a
    // lead, and none of these rows are near the month boundary either.
    const rows = [10, 90, 20, 80, 30, 70, 40, 60, 50, 50, 15, 85].map((points, i) => tx(String(i), points, '2026-08-10'))
    const result = findReconciliationGapLeads(rows, 100, '2026-08-31')
    expect(result).toEqual([{ kind: 'no-lead' }])
  })

  it('falls back to transactions near the month boundary when no exact match exists', () => {
    const rows = [
      tx('1', 111, '2026-08-05'),
      tx('2', 222, '2026-08-30'),
      tx('3', 333, '2026-08-31'),
    ]
    const result = findReconciliationGapLeads(rows, 9999, '2026-08-31')
    expect(result).toEqual([{ kind: 'boundary', txs: [rows[1], rows[2]] }])
  })

  it('reports no lead at all when nothing matches and nothing is near the boundary', () => {
    const rows = [tx('1', 111, '2026-08-05')]
    const result = findReconciliationGapLeads(rows, 9999, '2026-08-31')
    expect(result).toEqual([{ kind: 'no-lead' }])
  })
})
