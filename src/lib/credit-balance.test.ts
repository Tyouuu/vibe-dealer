import { describe, expect, it } from 'vitest'
import { computeAvailableBalance, LOW_BALANCE_THRESHOLD } from './credit-balance'
import { PACKAGES } from './packages'

describe('computeAvailableBalance', () => {
  it('is total purchased minus total committed', () => {
    expect(computeAvailableBalance(1000, 600)).toBe(400)
  })

  it('blocks a sale bigger than what remains (New Transaction hard-block)', () => {
    const available = computeAvailableBalance(1000, 600)
    const requestedSale = 500
    expect(requestedSale > available).toBe(true)
  })

  it('allows a sale that fits within what remains', () => {
    const available = computeAvailableBalance(1000, 600)
    const requestedSale = 400
    expect(requestedSale > available).toBe(false)
  })

  it('goes negative if more was committed than purchased (already-oversold state, not clamped)', () => {
    expect(computeAvailableBalance(500, 600)).toBe(-100)
  })

  it('treats zero purchases as zero balance, not a crash', () => {
    expect(computeAvailableBalance(0, 0)).toBe(0)
  })
})

describe('LOW_BALANCE_THRESHOLD', () => {
  it('equals the biggest package size, so it always warns before the next big sale would be blocked', () => {
    const biggest = Math.max(...Object.values(PACKAGES).map((p) => p.reload))
    expect(LOW_BALANCE_THRESHOLD).toBe(biggest)
    expect(LOW_BALANCE_THRESHOLD).toBe(PACKAGES.C.reload)
  })
})
