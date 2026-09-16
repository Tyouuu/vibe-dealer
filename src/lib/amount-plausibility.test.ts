import { describe, it, expect } from 'vitest'
import { typicalAmount, isUnusuallyHigh, UNUSUAL_AMOUNT_MULTIPLIER } from './amount-plausibility'

describe('typicalAmount', () => {
  it('is null with fewer than 3 past amounts — too thin a sample to mean anything', () => {
    expect(typicalAmount([])).toBeNull()
    expect(typicalAmount([500])).toBeNull()
    expect(typicalAmount([500, 600])).toBeNull()
  })

  it('is the median of at least 3 amounts', () => {
    expect(typicalAmount([500, 600, 700])).toBe(600)
    expect(typicalAmount([700, 500, 600])).toBe(600) // order doesn't matter
  })

  it('averages the middle two on an even count', () => {
    expect(typicalAmount([500, 600, 700, 800])).toBe(650)
  })

  it('is not dragged by one outlier the way a mean would be', () => {
    // A mean here would be 1,650; the median stays anchored to the ordinary case.
    const amounts = [500, 550, 600, 620, 8000]
    expect(typicalAmount(amounts)).toBe(600)
  })

  it('ignores non-positive or non-finite values', () => {
    expect(typicalAmount([500, 600, 700, 0, -50, NaN])).toBe(600)
  })
})

describe('isUnusuallyHigh', () => {
  it('is false with no baseline to compare against', () => {
    expect(isUnusuallyHigh(5000, null)).toBe(false)
  })

  it(`is false at or under ${UNUSUAL_AMOUNT_MULTIPLIER}x the typical amount`, () => {
    expect(isUnusuallyHigh(600, 600)).toBe(false)
    expect(isUnusuallyHigh(1800, 600)).toBe(false) // exactly 3x
  })

  it(`is true once past ${UNUSUAL_AMOUNT_MULTIPLIER}x the typical amount`, () => {
    expect(isUnusuallyHigh(1801, 600)).toBe(true)
    expect(isUnusuallyHigh(5000, 600)).toBe(true)
  })

  it('is false for a non-finite amount rather than throwing', () => {
    expect(isUnusuallyHigh(NaN, 600)).toBe(false)
  })
})
