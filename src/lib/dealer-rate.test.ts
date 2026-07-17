import { describe, expect, it } from 'vitest'
import { pickCurrentPackage } from './dealer-rate'
import { PACKAGES } from './packages'

describe('pickCurrentPackage', () => {
  it('returns null/null when the dealer has no package purchases', () => {
    expect(pickCurrentPackage([])).toEqual({ package: null, rate: null })
  })

  it('picks the single package when there is only one', () => {
    expect(pickCurrentPackage([{ package: 'A', tx_date: '2026-07-01' }])).toEqual({
      package: 'A',
      rate: PACKAGES.A.rate,
    })
  })

  it('same-day batch: picks the bigger package (by reload), not whichever sorts first', () => {
    // Input order deliberately has the smaller package first — if this
    // regressed back to "first in the array wins," this would catch it.
    const txs = [
      { package: 'A' as const, tx_date: '2026-07-10' },
      { package: 'C' as const, tx_date: '2026-07-10' },
      { package: 'B' as const, tx_date: '2026-07-10' },
    ]
    expect(pickCurrentPackage(txs)).toEqual({ package: 'C', rate: PACKAGES.C.rate })
  })

  it('ignores older purchases once a newer date is present', () => {
    const txs = [
      { package: 'A' as const, tx_date: '2026-07-10' }, // latest, smaller
      { package: 'C' as const, tx_date: '2026-06-01' }, // older but bigger — must lose
    ]
    expect(pickCurrentPackage(txs)).toEqual({ package: 'A', rate: PACKAGES.A.rate })
  })

  it('all packages carry the same flat rate post-0010, so the winner is decided by reload even when rates tie', () => {
    const ratesAreFlat = new Set(Object.values(PACKAGES).map((p) => p.rate)).size === 1
    expect(ratesAreFlat).toBe(true)
    const txs = [
      { package: 'A' as const, tx_date: '2026-07-10' },
      { package: 'B' as const, tx_date: '2026-07-10' },
    ]
    expect(pickCurrentPackage(txs).package).toBe('B')
  })
})
