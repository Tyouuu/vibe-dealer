import { describe, expect, it } from 'vitest'
import { parseBusinessDate } from './month'

const TODAY = '2026-08-03'

describe('parseBusinessDate', () => {
  it('accepts today', () => {
    expect(parseBusinessDate(TODAY, TODAY)).toBe(TODAY)
  })

  it('accepts a past date — backdating is normal here', () => {
    expect(parseBusinessDate('2026-06-15', TODAY)).toBe('2026-06-15')
  })

  it('trims surrounding whitespace', () => {
    expect(parseBusinessDate('  2026-06-15  ', TODAY)).toBe('2026-06-15')
  })

  it('rejects a future date', () => {
    expect(parseBusinessDate('2030-01-01', TODAY)).toBeNull()
    expect(parseBusinessDate('2026-08-04', TODAY)).toBeNull()
  })

  it('rejects a calendar date that does not exist', () => {
    expect(parseBusinessDate('2026-02-31', TODAY)).toBeNull()
    expect(parseBusinessDate('2026-13-01', TODAY)).toBeNull()
    expect(parseBusinessDate('2026-00-10', TODAY)).toBeNull()
  })

  it('rejects the wrong shape', () => {
    expect(parseBusinessDate('15/06/2026', TODAY)).toBeNull()
    expect(parseBusinessDate('2026-6-15', TODAY)).toBeNull()
    expect(parseBusinessDate('yesterday', TODAY)).toBeNull()
  })

  it('rejects empty, null and undefined rather than defaulting to a date', () => {
    expect(parseBusinessDate('', TODAY)).toBeNull()
    expect(parseBusinessDate(null, TODAY)).toBeNull()
    expect(parseBusinessDate(undefined, TODAY)).toBeNull()
  })

  it('accepts a leap day in a leap year and rejects it otherwise', () => {
    expect(parseBusinessDate('2024-02-29', TODAY)).toBe('2024-02-29')
    expect(parseBusinessDate('2025-02-29', TODAY)).toBeNull()
  })
})
