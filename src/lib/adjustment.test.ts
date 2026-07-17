import { describe, expect, it } from 'vitest'
import { computeAdjustmentDelta } from './adjustment'

describe('computeAdjustmentDelta', () => {
  it('computes a negative delta when correcting downward', () => {
    // The example used to explain this feature: recorded 500, should have been 450.
    expect(computeAdjustmentDelta({ points: 500, money_rm: 0 }, { points: 450, money_rm: 0 })).toEqual({
      deltaPoints: -50,
      deltaMoneyRm: 0,
    })
  })

  it('computes a positive delta when correcting upward', () => {
    expect(computeAdjustmentDelta({ points: 450, money_rm: 200 }, { points: 500, money_rm: 220 })).toEqual({
      deltaPoints: 50,
      deltaMoneyRm: 20,
    })
  })

  it('is zero/zero when nothing actually changed', () => {
    expect(computeAdjustmentDelta({ points: 300, money_rm: 150 }, { points: 300, money_rm: 150 })).toEqual({
      deltaPoints: 0,
      deltaMoneyRm: 0,
    })
  })

  it('rounds to 2dp instead of leaking floating-point noise', () => {
    const result = computeAdjustmentDelta({ points: 0, money_rm: 500.1 }, { points: 0, money_rm: 450 })
    expect(result.deltaMoneyRm).toBe(-50.1)
  })

  it('lets points and money move independently (correcting one without the other)', () => {
    expect(computeAdjustmentDelta({ points: 300, money_rm: 150 }, { points: 280, money_rm: 150 })).toEqual({
      deltaPoints: -20,
      deltaMoneyRm: 0,
    })
  })
})
