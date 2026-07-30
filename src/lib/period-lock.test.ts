import { describe, it, expect } from 'vitest'
import { monthOf, isPeriodLockError, monthFromPeriodLockError, periodLockedMessage } from './period-lock'

describe('monthOf', () => {
  it('reduces a transaction date to the month that gets reconciled', () => {
    expect(monthOf('2026-06-05')).toBe('2026-06')
    expect(monthOf('2026-06-30')).toBe('2026-06')
    expect(monthOf('2026-07-01')).toBe('2026-07')
  })

  it('does not shift the month at a boundary date', () => {
    // A backdated 1st or last-of-month is exactly the case that decides which
    // month's reconciliation a write would invalidate, so it must not drift.
    expect(monthOf('2026-01-01')).toBe('2026-01')
    expect(monthOf('2026-12-31')).toBe('2026-12')
  })
})

describe('isPeriodLockError', () => {
  it('recognises the trigger exception from migration 0031', () => {
    expect(isPeriodLockError('period_locked: 2026-06 is already reconciled')).toBe(true)
  })

  it('leaves unrelated database errors alone', () => {
    // These must keep surfacing as themselves — swallowing an oversell or a
    // duplicate-key error behind a "month is closed" message would hide a
    // completely different failure.
    expect(isPeriodLockError('insufficient_credit_balance: 100 pts available, 500 pts requested')).toBe(false)
    expect(isPeriodLockError('duplicate key value violates unique constraint')).toBe(false)
    expect(isPeriodLockError(undefined)).toBe(false)
    expect(isPeriodLockError(null)).toBe(false)
  })
})

describe('monthFromPeriodLockError', () => {
  it('pulls the locked month out of the trigger message', () => {
    expect(monthFromPeriodLockError('period_locked: 2026-06 is already reconciled')).toBe('2026-06')
  })

  it('returns null when the message is not a period-lock error', () => {
    expect(monthFromPeriodLockError('something else entirely')).toBeNull()
  })
})

describe('periodLockedMessage', () => {
  it('names the blocked month and how to proceed', () => {
    const msg = periodLockedMessage('2026-06-05')
    expect(msg).toContain('2026-06')
    // The message is the only place an operator learns the way forward, so
    // it has to point at the reopen route rather than just refusing.
    expect(msg).toContain('reopen')
  })
})
