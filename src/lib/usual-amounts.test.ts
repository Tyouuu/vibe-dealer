import { describe, expect, it } from 'vitest'
import { usualAmounts } from './usual-amounts'

describe('usualAmounts', () => {
  it('offers nothing to a dealer with no history', () => {
    expect(usualAmounts([])).toEqual([])
  })

  it('offers the amounts this dealer actually sends, most frequent first', () => {
    expect(usualAmounts([470, 940, 940, 4700, 940, 470])).toEqual([940, 470, 4700])
  })

  it('breaks a tie by the most recent', () => {
    // 500 and 1000 each twice; 500 is the newer.
    expect(usualAmounts([500, 1000, 1000, 500])).toEqual([500, 1000])
  })

  it('offers each amount once and no more than the limit', () => {
    expect(usualAmounts([100, 200, 300, 400, 500])).toHaveLength(3)
    expect(usualAmounts([100, 200, 300, 400, 500], 2)).toEqual([100, 200])
  })

  it('never offers a figure that is not a real amount', () => {
    expect(usualAmounts([0, -50, Number.NaN, 940])).toEqual([940])
  })

  it('treats 940 and 940.00 as one amount', () => {
    expect(usualAmounts([940, 940.0, 940.001])).toEqual([940])
  })
})
