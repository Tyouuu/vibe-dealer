import { describe, it, expect } from 'vitest'
import { formatMYR, formatPoints } from './money'

// Intl puts a NON-BREAKING space (U+00A0) between the symbol and the number,
// not a plain one. That's the locale-correct behaviour and it's what stops
// "RM" wrapping onto a different line from the amount it labels, so it's kept
// rather than normalised away — but it means a naive toBe('RM 1,234.50')
// with a regular space fails, which is exactly how this was caught. Written
// as an escape rather than a literal NBSP so a formatter can't silently
// normalise it back to a plain space and break the suite mysteriously.
const RM = `RM${String.fromCharCode(0xa0)}`

describe('formatMYR', () => {
  it('always shows two decimal places', () => {
    // The whole reason this helper exists: toLocaleString() gave RM 1,234.5
    // for the first and RM 1,234 for the second, so the same column rendered
    // three different shapes depending on the value.
    expect(formatMYR(1234.5)).toBe(`${RM}1,234.50`)
    expect(formatMYR(1234)).toBe(`${RM}1,234.00`)
    expect(formatMYR(0.5)).toBe(`${RM}0.50`)
  })

  it('keeps sen exactly, and separates thousands', () => {
    expect(formatMYR(695.98)).toBe(`${RM}695.98`)
    expect(formatMYR(1234567.89)).toBe(`${RM}1,234,567.89`)
  })

  it('rounds to sen rather than showing a third decimal', () => {
    expect(formatMYR(1234567.891)).toBe(`${RM}1,234,567.89`)
  })

  it('handles zero, negatives and string input from Postgres numerics', () => {
    expect(formatMYR(0)).toBe(`${RM}0.00`)
    // Cash-margin-vs-2% on /purchases can legitimately go negative.
    expect(formatMYR(-19512)).toBe(`-${RM}19,512.00`)
    // Supabase returns numeric columns as strings.
    expect(formatMYR('783.98')).toBe(`${RM}783.98`)
  })

  it('never renders NaN or undefined into the UI', () => {
    expect(formatMYR(null)).toBe(`${RM}0.00`)
    expect(formatMYR(undefined)).toBe(`${RM}0.00`)
    expect(formatMYR(Number.NaN)).toBe(`${RM}0.00`)
  })
})

describe('formatPoints', () => {
  it('separates thousands without padding whole numbers', () => {
    expect(formatPoints(34799)).toBe('34,799')
    expect(formatPoints(1000)).toBe('1,000')
  })

  it('keeps a fractional point when an adjustment produces one', () => {
    expect(formatPoints(99.5)).toBe('99.5')
  })

  it('handles null and string input', () => {
    expect(formatPoints(null)).toBe('0')
    expect(formatPoints('2600')).toBe('2,600')
  })
})
