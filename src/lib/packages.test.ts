import { describe, expect, it } from 'vitest'
import { FLAT_DEALER_RATE, PACKAGES, rateOrFlat } from './packages'

describe('the flat dealer rate', () => {
  // The whole reason a dealer with no package can be priced at all: every package is the same 6%. If Vibe ever
  // prices packages differently again, "no package on file" stops meaning "the same rate", and the fallback
  // below would quietly under- or over-credit those dealers. This fails first.
  it('is what every package gives', () => {
    for (const code of ['A', 'B', 'C'] as const) expect(PACKAGES[code].rate).toBe(FLAT_DEALER_RATE)
    expect(FLAT_DEALER_RATE).toBe(6)
  })
})

describe('rateOrFlat', () => {
  it('uses the dealer’s own rate when there is one', () => {
    expect(rateOrFlat(6)).toBe(6)
    expect(rateOrFlat('7.5')).toBe(7.5)
  })

  it('a dealer with no package on file is on the flat rate, not unpriced', () => {
    expect(rateOrFlat(null)).toBe(6)
    expect(rateOrFlat(undefined)).toBe(6)
    expect(rateOrFlat('')).toBe(6)
  })

  it('never returns a rate that would break the points maths', () => {
    // points = money / (1 - rate/100): zero, negative or not-a-number rates fall back rather than propagate.
    expect(rateOrFlat(0)).toBe(6)
    expect(rateOrFlat(-3)).toBe(6)
    expect(rateOrFlat(Number.NaN)).toBe(6)
    expect(rateOrFlat('abc')).toBe(6)
  })

  it('prices a top-up the way the form and the server both do', () => {
    // RM 940 at 6% is 1,000 points: the figure the owner checks every entry against.
    expect(Math.round(940 / (1 - rateOrFlat(null) / 100))).toBe(1000)
  })
})
