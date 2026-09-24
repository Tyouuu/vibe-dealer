// The three things the system already knows and never told anyone.
//
// Each of these is on the dashboard. That is the problem: "it's on the
// dashboard" means "you have to log in to find out", and this business runs on
// WhatsApp — nobody opens a dashboard to check whether there is anything to
// check. The daily report goes out whether or not anything happened, which
// makes it a habit rather than a signal, and it follows each master's chosen
// frequency, so someone on 'monthly' would hear about running out of credit up
// to a month late.
//
// So: a separate daily pass that sends nothing at all unless something is
// wrong. An email from this one always means something.
//
// The decision is kept here, away from the route, because it is the part worth
// testing — dates and thresholds are where this sort of thing quietly stops
// firing, and a cron that has silently stopped firing looks exactly like a
// month with no problems.

export type AlertKind = 'not_started' | 'credit_low' | 'month_unreconciled' | 'pending_too_long' | 'system_check'

// How long before the same unresolved problem is raised again. Daily would
// train everyone to delete it unread, which is the failure mode that matters:
// an alert nobody reads is worse than no alert, because it feels like cover.
export const REPEAT_AFTER_DAYS = 3

// The exception is the system check. The other alerts are about work that has not been done yet; this
// one is about the books failing a rule they are supposed to keep at all times, and a broken ledger
// is the one thing worth hearing about every morning until it is fixed.
export const SYSTEM_CHECK_REPEAT_AFTER_DAYS = 1

// The month is only worth chasing once there has been time to do it. Vibe's
// own statement does not arrive on the 1st, and a reminder that fires before
// the work could possibly have been done is noise.
export const RECONCILE_CHASE_FROM_DAY = 5

// Three days is a working ledger's patience. Same-day is normal, next-day
// happens, three days means it has been forgotten — and until it is verified
// it counts toward nothing: not the reports, not the reconciliation, not the
// 2%.
export const PENDING_STALE_DAYS = 3

export type AlertFacts = {
  availablePoints: number
  lowBalanceThreshold: number
  /** Has credit ever been bought? Zero on a system nobody has started using is a setup state, not a shortage. */
  hasEverPurchased: boolean
  /** 'YYYY-MM' — the month that should have been closed by now. */
  previousMonth: string
  previousMonthReconciled: boolean
  /** Did anything actually happen in it? A month with no trading has nothing to reconcile. */
  previousMonthHadActivity: boolean
  /** Day of the month in Malaysia, 1–31. */
  dayOfMonth: number
  /** Age in days of the oldest pending transaction, or null if none are waiting. */
  oldestPendingDays: number | null
  pendingCount: number
  /**
   * What today's system check found (src/lib/system-check.ts). `ran: false` means the check itself
   * could not run — which is reported too, because a check that quietly stopped running looks exactly
   * like a month with nothing wrong. `problems` has one line per failing check, and is empty when
   * everything passed; warnings are for the System Check page and are not emailed.
   */
  systemCheck: { ran: boolean; problems: string[] }
}

export type Alert = {
  kind: AlertKind
  /** One line, because most of these are read on a phone's lock screen. */
  headline: string
  detail: string
}

function systemCheckAlert(check: AlertFacts['systemCheck']): Alert | null {
  if (!check.ran) {
    return {
      kind: 'system_check',
      headline: 'Today’s system check could not run',
      detail:
        'Nothing was checked today, so the books have not been tested against their own rules. Open System Check and run it by hand — ' +
        'if it fails there too, the database needs looking at.',
    }
  }
  if (!check.problems.length) return null
  const count = check.problems.length
  return {
    kind: 'system_check',
    headline: count === 1 ? '1 thing in the books does not add up' : `${count} things in the books do not add up`,
    detail:
      check.problems.join('\n') +
      '\n\nThese are rules the ledger is supposed to keep at all times. Open System Check to see the entries involved.',
  }
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`)
  const b = Date.parse(`${toIso}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}

/**
 * What is worth saying today, given what is true and what was already said.
 *
 * `lastSentOn` maps a kind to the ISO date it last went out, or null/undefined
 * if it never has. Anything raised again inside REPEAT_AFTER_DAYS is dropped.
 */
export function decideAlerts(
  facts: AlertFacts,
  lastSentOn: Partial<Record<AlertKind, string | null>>,
  today: string,
): Alert[] {
  const raised: Alert[] = []

  const isDue = (a: Alert): boolean => {
    const last = lastSentOn[a.kind]
    if (!last) return true
    return daysBetween(last, today) >= (a.kind === 'system_check' ? SYSTEM_CHECK_REPEAT_AFTER_DAYS : REPEAT_AFTER_DAYS)
  }
  const systemAlert = systemCheckAlert(facts.systemCheck)

  // Before anything else, and only once.
  //
  // credit_low deliberately stays quiet until the first purchase — see its
  // comment — because "you are running low" is a false alarm on a system
  // nobody has started. That was the right call and it left a hole: on a
  // system nobody has started, this said *nothing at all*, while every sale
  // the owner tried to record was refused for a reason the screen never gave.
  // Silence is the worse failure of the two. This is the setup prompt that
  // belongs in that gap.
  if (!facts.hasEverPurchased) {
    raised.push({
      kind: 'not_started',
      headline: 'No credit bought from Vibe yet',
      detail:
        'Every sale is checked against the credit you have bought, and the balance starts at zero — so until a purchase is logged, ' +
        'every top-up and package you try to record will be refused. Log what you paid Vibe Mobile and how many points they gave you, and the ledger opens.',
    })
    // Nothing below this is worth saying yet. An unreconciled month and a
    // stale pending row are both about work in progress, and there is none.
    // The system check is the exception: it is about the books, not the work.
    return systemAlert && isDue(systemAlert) ? [systemAlert, ...raised] : raised
  }

  // First, because it is the most serious thing this can say and the subject line of the
  // email carries the first headline.
  if (systemAlert) raised.unshift(systemAlert)

  // Below the threshold, not at zero. At zero the ledger already refuses the
  // sale and the dealer is standing there — the point of saying anything is to
  // reach him while there is still time to buy more.
  // "Running low" only means something once there has been something to run
  // low on. Before the first purchase the balance is zero because nobody has
  // started, and telling the owner his credit is short on the day he is still
  // setting up is a false alarm in the worst possible place — the first message
  // the system ever sends him.
  if (facts.hasEverPurchased && facts.availablePoints < facts.lowBalanceThreshold) {
    raised.push({
      kind: 'credit_low',
      headline: `Credit is down to ${facts.availablePoints.toLocaleString()} pts`,
      detail:
        `That is below ${facts.lowBalanceThreshold.toLocaleString()} pts, the largest package you sell — so the next dealer who asks for one will be refused. ` +
        `A sale that would take the balance past zero is blocked outright, not warned about. Log a purchase from Vibe Mobile before that happens.`,
    })
  }

  // A month nobody traded in has nothing to compare against Vibe's statement,
  // and chasing one is how a useful alert becomes a monthly false alarm. Caught
  // before go-live: production has no transactions yet, so the first thing this
  // would ever have said to the owner was to close an empty month.
  if (facts.dayOfMonth >= RECONCILE_CHASE_FROM_DAY && facts.previousMonthHadActivity && !facts.previousMonthReconciled) {
    raised.push({
      kind: 'month_unreconciled',
      headline: `${facts.previousMonth} is still open`,
      detail:
        `It has not been reconciled against Vibe's statement, so last month's figures are not final and the month is not locked — ` +
        `a transaction dated in it can still be added or changed.`,
    })
  }

  if (facts.oldestPendingDays !== null && facts.oldestPendingDays >= PENDING_STALE_DAYS) {
    raised.push({
      kind: 'pending_too_long',
      headline:
        facts.pendingCount === 1
          ? `1 transaction has been waiting ${facts.oldestPendingDays} days to be verified`
          : `${facts.pendingCount} transactions are waiting, the oldest for ${facts.oldestPendingDays} days`,
      detail:
        `Until it is verified it counts toward nothing — not the reports, not the reconciliation, not the 2%. ` +
        `The dealer has the credit either way.`,
    })
  }

  return raised.filter(isDue)
}
