import { describe, expect, it } from 'vitest'
import { pickReportMonth } from './reporting-month'

describe('pickReportMonth', () => {
  it('falls back to the last month with data when the current one is empty', () => {
    expect(pickReportMonth(undefined, '2026-08', '2026-07')).toEqual({ month: '2026-07', auto: true })
  })

  it('stays on the current month once it has data', () => {
    expect(pickReportMonth(undefined, '2026-08', '2026-08')).toEqual({ month: '2026-08', auto: false })
  })

  it('honours an explicit choice even when that month is empty', () => {
    expect(pickReportMonth('2026-08', '2026-08', '2026-07')).toEqual({ month: '2026-08', auto: false })
    expect(pickReportMonth('2025-01', '2026-08', '2026-07')).toEqual({ month: '2025-01', auto: false })
  })

  it('stays on the current month when nothing has ever been verified', () => {
    expect(pickReportMonth(undefined, '2026-08', null)).toEqual({ month: '2026-08', auto: false })
  })

  it('never jumps forward past the current month', () => {
    // A backdating mistake could leave a verified row in the future; the report
    // must not follow it there.
    expect(pickReportMonth(undefined, '2026-08', '2027-03')).toEqual({ month: '2026-08', auto: false })
  })

  it('skips back more than one month when several are empty', () => {
    expect(pickReportMonth(undefined, '2026-08', '2026-04')).toEqual({ month: '2026-04', auto: true })
  })
})
