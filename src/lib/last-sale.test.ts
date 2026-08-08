import { describe, it, expect } from 'vitest'
import { buildLastSales, type RawTxRow } from './last-sale'

const row = (o: Partial<RawTxRow> & { dealer_id: string; type: string }): RawTxRow => ({
  package: null, points: 1000, money_rm: 940, ...o,
})

describe('buildLastSales', () => {
  it('remembers what a dealer last bought', () => {
    const { byDealer, recentIds } = buildLastSales([
      row({ dealer_id: 'a', type: 'topup', money_rm: 500, points: 532 }),
      row({ dealer_id: 'b', type: 'package', package: 'B' }),
    ])
    expect(recentIds).toEqual(['a', 'b'])
    expect(byDealer.a).toEqual({ type: 'topup', package: null, points: 532, money_rm: 500 })
    expect(byDealer.b.package).toBe('B')
  })

  it('keeps the newest row per dealer and ignores older ones', () => {
    const { byDealer } = buildLastSales([
      row({ dealer_id: 'a', type: 'topup', money_rm: 900 }),
      row({ dealer_id: 'a', type: 'topup', money_rm: 100 }),
    ])
    expect(byDealer.a.money_rm).toBe(900)
  })

  it('does not let a correction become the last sale', () => {
    // The bug this file exists for. 'adjustment' reached a field declared as
    // 'package' | 'topup', the form set its Type to it, neither Type button
    // matched, and the server refused the entry with "Please select a
    // transaction type" — on a dealer the shortcut was meant to speed up.
    const { byDealer } = buildLastSales([
      row({ dealer_id: 'a', type: 'adjustment', points: -500, money_rm: -470 }),
      row({ dealer_id: 'a', type: 'topup', money_rm: 800 }),
    ])
    expect(byDealer.a.type).toBe('topup')
    expect(byDealer.a.money_rm).toBe(800)
  })

  it('leaves out a dealer whose only recent activity is a correction', () => {
    // Not "recent" in the sense the shortcut means. Nobody repeats a
    // correction, so there is nothing to offer and no reason to take a slot
    // from a dealer who was actually sold to.
    const { byDealer, recentIds } = buildLastSales([row({ dealer_id: 'a', type: 'adjustment' })])
    expect(recentIds).toEqual([])
    expect(byDealer.a).toBeUndefined()
  })

  it('ignores a type nobody has invented yet', () => {
    // The guard is a whitelist, not a blacklist of 'adjustment'. A fourth
    // transaction type added later must not silently reach the form.
    const { recentIds } = buildLastSales([row({ dealer_id: 'a', type: 'refund' })])
    expect(recentIds).toEqual([])
  })

  it('turns whatever PostgREST sends into numbers', () => {
    // numeric columns come back as strings, and String(940) + 100 is a bug
    // that reaches the person as a wrong amount rather than as an error.
    const { byDealer } = buildLastSales([row({ dealer_id: 'a', type: 'topup', points: '1500', money_rm: '1410.00' })])
    expect(byDealer.a.points).toBe(1500)
    expect(byDealer.a.money_rm).toBe(1410)
  })

  it('says nothing about a day with no trading', () => {
    expect(buildLastSales([])).toEqual({ byDealer: {}, recentIds: [] })
  })
})
