import { describe, it, expect } from 'vitest'
import { decideAlerts, REPEAT_AFTER_DAYS, RECONCILE_CHASE_FROM_DAY, PENDING_STALE_DAYS, type AlertFacts } from './alerts'

const quiet: AlertFacts = {
  availablePoints: 500_000,
  lowBalanceThreshold: 12_000,
  hasEverPurchased: true,
  previousMonth: '2026-07',
  previousMonthReconciled: true,
  previousMonthHadActivity: true,
  dayOfMonth: 10,
  oldestPendingDays: null,
  pendingCount: 0,
}

describe('decideAlerts', () => {
  it('says nothing when nothing is wrong', () => {
    // The whole design rests on this: an email from this cron has to mean
    // something, which it cannot if one arrives on a quiet day too.
    expect(decideAlerts(quiet, {}, '2026-08-10')).toEqual([])
  })

  it('raises credit before it runs out, not after', () => {
    const [a] = decideAlerts({ ...quiet, availablePoints: 11_999 }, {}, '2026-08-10')
    expect(a.kind).toBe('credit_low')
    expect(a.headline).toContain('11,999')
  })

  it('does not call an unused system short of credit', () => {
    // The state production is in right now: nothing bought, nothing sold. A
    // shortage warning here would be the first thing the system ever said to
    // its owner, and it would be wrong.
    expect(decideAlerts({ ...quiet, availablePoints: 0, hasEverPurchased: false }, {}, '2026-08-10')).toEqual([])
  })

  it('leaves credit alone exactly at the threshold', () => {
    expect(decideAlerts({ ...quiet, availablePoints: 12_000 }, {}, '2026-08-10')).toEqual([])
  })

  it('does not chase the month before there was time to close it', () => {
    const facts = { ...quiet, previousMonthReconciled: false }
    expect(decideAlerts({ ...facts, dayOfMonth: RECONCILE_CHASE_FROM_DAY - 1 }, {}, '2026-08-04')).toEqual([])
    expect(decideAlerts({ ...facts, dayOfMonth: RECONCILE_CHASE_FROM_DAY }, {}, '2026-08-05')[0].kind)
      .toBe('month_unreconciled')
  })

  it('does not chase a month nobody traded in', () => {
    // Before go-live every past month is empty; an alert telling the owner to
    // close one is a false alarm on the system's very first day.
    const facts = { ...quiet, previousMonthReconciled: false, previousMonthHadActivity: false, dayOfMonth: 20 }
    expect(decideAlerts(facts, {}, '2026-08-20')).toEqual([])
  })

  it('waits three days before calling a pending transaction forgotten', () => {
    const facts = { ...quiet, pendingCount: 2 }
    expect(decideAlerts({ ...facts, oldestPendingDays: PENDING_STALE_DAYS - 1 }, {}, '2026-08-10')).toEqual([])
    const [a] = decideAlerts({ ...facts, oldestPendingDays: PENDING_STALE_DAYS }, {}, '2026-08-10')
    expect(a.kind).toBe('pending_too_long')
    expect(a.headline).toContain('2 transactions')
  })

  it('counts one waiting transaction in the singular', () => {
    const [a] = decideAlerts({ ...quiet, oldestPendingDays: 4, pendingCount: 1 }, {}, '2026-08-10')
    expect(a.headline).toBe('1 transaction has been waiting 4 days to be verified')
  })

  it('does not repeat the same unresolved problem daily', () => {
    const facts = { ...quiet, availablePoints: 1_000 }
    // Sent yesterday, still broken today: silence, or it trains people to
    // delete it unread.
    expect(decideAlerts(facts, { credit_low: '2026-08-09' }, '2026-08-10')).toEqual([])
    expect(decideAlerts(facts, { credit_low: '2026-08-08' }, '2026-08-10')).toEqual([])
  })

  it('raises it again once it has been quiet long enough', () => {
    const facts = { ...quiet, availablePoints: 1_000 }
    const today = '2026-08-10'
    const due = new Date(Date.parse(`${today}T00:00:00Z`) - REPEAT_AFTER_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10)
    expect(decideAlerts(facts, { credit_low: due }, today)).toHaveLength(1)
  })

  it('suppresses one kind without silencing another', () => {
    // The bug this guards: a shared "last sent" date, so the first alert of
    // the day stops every other alert for three days.
    const facts = { ...quiet, availablePoints: 1_000, previousMonthReconciled: false, dayOfMonth: 9 }
    const out = decideAlerts(facts, { credit_low: '2026-08-09' }, '2026-08-10')
    expect(out.map((a) => a.kind)).toEqual(['month_unreconciled'])
  })

  it('reports everything wrong at once rather than one thing a day', () => {
    const facts: AlertFacts = {
      ...quiet,
      availablePoints: 500,
      previousMonthReconciled: false,
      dayOfMonth: 12,
      oldestPendingDays: 6,
      pendingCount: 3,
    }
    expect(decideAlerts(facts, {}, '2026-08-12').map((a) => a.kind))
      .toEqual(['credit_low', 'month_unreconciled', 'pending_too_long'])
  })

  it('crosses a month boundary without forgetting it already sent', () => {
    const facts = { ...quiet, availablePoints: 1_000 }
    expect(decideAlerts(facts, { credit_low: '2026-07-31' }, '2026-08-01')).toEqual([])
    expect(decideAlerts(facts, { credit_low: '2026-07-29' }, '2026-08-01')).toHaveLength(1)
  })
})
