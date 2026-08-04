import { describe, it, expect } from 'vitest'
import { resolveReportPeriod } from './report-period'

// 2026-08-03 is a Monday, 2026-08-04 a Tuesday, 2026-08-01 a Saturday.
describe('resolveReportPeriod', () => {
  it('daily covers yesterday, every day', () => {
    expect(resolveReportPeriod('daily', '2026-08-04')).toEqual({ from: '2026-08-03', to: '2026-08-03', label: '2026-08-03' })
    expect(resolveReportPeriod('daily', '2026-08-01')).toEqual({ from: '2026-07-31', to: '2026-07-31', label: '2026-07-31' })
  })

  it('weekly sends only on a Monday', () => {
    expect(resolveReportPeriod('weekly', '2026-08-04')).toBeNull() // Tuesday
    expect(resolveReportPeriod('weekly', '2026-08-05')).toBeNull() // Wednesday
    expect(resolveReportPeriod('weekly', '2026-08-03')).not.toBeNull() // Monday
  })

  it('weekly covers the week that just ended, never the day it is sent', () => {
    const p = resolveReportPeriod('weekly', '2026-08-03')!
    expect(p.from).toBe('2026-07-27') // the previous Monday
    expect(p.to).toBe('2026-08-02') // Sunday
  })

  it('monthly sends only on the 1st', () => {
    expect(resolveReportPeriod('monthly', '2026-08-02')).toBeNull()
    expect(resolveReportPeriod('monthly', '2026-08-31')).toBeNull()
    expect(resolveReportPeriod('monthly', '2026-08-01')).not.toBeNull()
  })

  it('monthly covers the whole month that just ended', () => {
    const p = resolveReportPeriod('monthly', '2026-08-01')!
    expect(p).toEqual({ from: '2026-07-01', to: '2026-07-31', label: '2026-07' })
  })

  it('handles a January 1st, where the month before is in the previous year', () => {
    const p = resolveReportPeriod('monthly', '2027-01-01')!
    expect(p).toEqual({ from: '2026-12-01', to: '2026-12-31', label: '2026-12' })
  })

  it('handles a March 1st after a February, leap year or not', () => {
    expect(resolveReportPeriod('monthly', '2027-03-01')!).toEqual({ from: '2027-02-01', to: '2027-02-28', label: '2027-02' })
    expect(resolveReportPeriod('monthly', '2028-03-01')!).toEqual({ from: '2028-02-01', to: '2028-02-29', label: '2028-02' })
  })

  it('off never sends', () => {
    for (const day of ['2026-08-01', '2026-08-03', '2026-08-04']) {
      expect(resolveReportPeriod('off', day)).toBeNull()
    }
  })
})
