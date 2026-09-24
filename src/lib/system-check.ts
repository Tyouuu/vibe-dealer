// What the nightly system check says, in words, and how seriously to take each line.
//
// The database function run_system_checks() (0058) only counts: for each check, how many things it
// looked at and how many were wrong, plus up to five examples. It never says whether a count is an
// emergency. That is decided here, where the wording lives and is tested, so a person reading
// "12 top-ups differ from the rate maths" is told once and consistently whether that is a problem
// or a note.
//
// Three levels, and the difference is the whole design:
//
//   fail  The books cannot be right while this is true. A balance that adds up two ways, a verified
//         entry nobody signed, a closed month that has moved. A bug, a bad import or a hand-edit
//         is the only way to get here. These are emailed, daily, until they are gone.
//   warn  Usually a mistake, occasionally a decision. A top-up typed with points other than the
//         rate gives, the same amount twice in a day. Shown, not emailed: a person looks and either
//         fixes it or knows it was on purpose.
//   info  A figure, not a fault. How much of the money has its receipt attached.
//
// A check the database did not return counts as FAILED. Silence must never read as a pass — a check
// that stopped running looks exactly like a system with nothing wrong.

export type CheckSeverity = 'fail' | 'warn' | 'info'
export type CheckStatus = 'ok' | CheckSeverity

export type CheckSample = {
  id: string | null
  dealer_id: string | null
  label: string
  detail: string
}

/** One row of run_system_checks(). */
export type RawCheckRow = {
  check_key: string
  checked: number
  problems: number
  samples: CheckSample[] | null
}

type Definition = {
  severity: CheckSeverity
  /** The rule, as a thing that is true when the books are healthy. */
  title: string
  /** Why this matters, one sentence, for the person deciding whether to worry. */
  why: string
  /** What to say when nothing is wrong. `checked` is how many things were looked at. */
  ok: (checked: number) => string
  /** What to say when something is. */
  bad: (problems: number, checked: number) => string
}

const n = (x: number) => x.toLocaleString('en-MY')
const s = (x: number, one: string, many: string) => `${n(x)} ${x === 1 ? one : many}`

// In the order they are shown: what would make the books untrustworthy first.
export const CHECKS = {
  balance_agrees: {
    severity: 'fail',
    title: 'The credit balance adds up the same way every time',
    why: 'It is counted three separate ways — the balance function every sale is checked against, the raw purchase and sale rows, and the ledger page — and they must agree to the point.',
    ok: () => 'All three ways of counting agree',
    bad: () => 'The credit balance changes depending on how it is counted',
  },
  balance_not_negative: {
    severity: 'fail',
    title: 'Nothing has been given out that was not bought',
    why: 'Every point handed to a dealer has to come from credit already bought from Vibe. A balance below zero means the block on overselling was bypassed.',
    ok: () => 'The balance is not below zero',
    bad: () => 'The credit balance is below zero',
  },
  closed_months_hold: {
    severity: 'fail',
    title: 'Closed months still match Vibe’s statement',
    why: 'Closing a month says “our verified total equals Vibe’s statement”. If the total has moved since, the books and the statement quietly disagree.',
    ok: (c) => (c === 0 ? 'No month has been closed yet' : `${s(c, 'closed month', 'closed months')} still match`),
    bad: (p) => `${s(p, 'closed month no longer matches', 'closed months no longer match')} the statement it was closed against`,
  },
  signed_off: {
    severity: 'fail',
    title: 'Every verified entry has a name against it',
    why: 'An entry counts toward the reports and the reconciliation only once someone has verified it. A verified entry with nobody recorded on it cannot be traced back to a person.',
    ok: (c) => (c === 0 ? 'Nothing verified yet' : `All ${s(c, 'verified entry', 'verified entries')} name who entered and who verified them`),
    bad: (p) => `${s(p, 'verified entry has', 'verified entries have')} nobody recorded against them`,
  },
  adjustment_links: {
    severity: 'fail',
    title: 'Every correction points at one real entry',
    why: 'A mistake is fixed by adding a linked correction, never by editing. A correction that corrects another correction, or sits under a different dealer, breaks the trail.',
    ok: (c) => (c === 0 ? 'No corrections yet' : `All ${s(c, 'correction', 'corrections')} point at a real entry for the same dealer`),
    bad: (p) => `${s(p, 'correction is', 'corrections are')} linked wrongly`,
  },
  sane_values: {
    severity: 'fail',
    title: 'No entry that cannot exist',
    why: 'An entry with no dealer, a negative amount, no points, or a date in the future cannot be real, and is usually what a bad import or a manual edit leaves behind.',
    ok: (c) => (c === 0 ? 'Nothing recorded yet' : `${s(c, 'entry looks', 'entries all look')} possible`),
    bad: (p) => `${s(p, 'entry cannot', 'entries cannot')} be right`,
  },
  parcels_have_status: {
    severity: 'fail',
    title: 'No SIM parcel is lost from the delivery queue',
    why: 'The queue shows every physical SIM waiting to ship. A physical SIM sale that was never queued is a parcel nobody will ever send.',
    ok: (c) => (c === 0 ? 'Nothing recorded yet' : `All ${s(c, 'sale', 'sales')} are where the person who ships can see them`),
    bad: (p) => `${s(p, 'sale', 'sales')} can’t be seen in the delivery queue`,
  },
  sim_stock_not_negative: {
    severity: 'fail',
    title: 'No more SIM cards out than came in',
    why: 'Stock is what was received minus what was sold. Below zero means cards were sold that were never logged as received.',
    ok: () => 'Every kind of SIM card has stock on hand or zero',
    bad: (p) => `${s(p, 'kind of SIM card', 'kinds of SIM card')} show more sold than received`,
  },
  package_maths: {
    severity: 'fail',
    title: 'Package sales match the price list',
    why: 'A package is a fixed price for fixed points. A package row with any other figures did not come from the entry form.',
    ok: (c) => (c === 0 ? 'No package sales yet' : `All ${s(c, 'package sale', 'package sales')} match the price list`),
    bad: (p) => `${s(p, 'package sale does', 'package sales do')} not match the price list`,
  },
  topup_maths: {
    severity: 'warn',
    title: 'Top-ups match the dealer’s rate',
    why: 'Points are worked out from the amount paid and the dealer’s rate. Overriding them by hand is allowed, but it should be a decision, not a slip.',
    ok: (c) => (c === 0 ? 'No top-ups yet' : `All ${s(c, 'top-up', 'top-ups')} match the rate`),
    bad: (p) => `${s(p, 'top-up differs', 'top-ups differ')} from what the rate gives`,
  },
  purchase_rate: {
    severity: 'warn',
    title: 'Credit purchases are at the usual rate',
    why: 'Credit has always been bought at 8% off. A batch credited at a different rate may be right, but is worth confirming once rather than finding at month end.',
    ok: (c) => (c === 0 ? 'No purchases yet' : `All ${s(c, 'purchase', 'purchases')} are at the usual rate`),
    bad: (p) => `${s(p, 'purchase was', 'purchases were')} credited at an unusual rate`,
  },
  duplicate_references: {
    severity: 'warn',
    title: 'No slip or invoice is counted twice',
    why: 'A bank prints a different reference on every transfer, and Vibe a different number on every invoice. The same one on two entries is one payment or purchase recorded twice — points handed out, or credit added, that was only ever paid for once.',
    ok: (c) => (c === 0 ? 'No entry carries a reference yet' : `${s(c, 'reference is', 'references are')} all different`),
    bad: (p) => `${s(p, 'reference appears', 'references appear')} on more than one entry`,
  },
  possible_duplicates: {
    severity: 'warn',
    title: 'No identical entry twice in one day',
    why: 'The same dealer, the same amount and the same kind of entry, twice on one day, is what typing a payment in twice looks like. Sometimes it is two genuine payments.',
    ok: (c) => (c === 0 ? 'Nothing recorded yet' : `No two of the ${s(c, 'entry', 'entries')} are identical on the same day`),
    bad: (p) => `${s(p, 'set', 'sets')} of identical entries on the same day`,
  },
  open_variances: {
    severity: 'warn',
    title: 'No closed gap is left unsettled with Vibe',
    why: 'A month can be closed with a difference from Vibe’s statement if a reason is given. Until Vibe answers, that difference is money in dispute.',
    ok: (c) => (c === 0 ? 'No month has been closed with a gap' : `All ${s(c, 'gap', 'gaps')} have been settled`),
    bad: (p) => `${s(p, 'gap', 'gaps')} still not settled with Vibe`,
  },
  paper_trail: {
    severity: 'info',
    title: 'Receipts on file',
    why: 'A figure someone may have to defend months later is only as good as the invoice or slip behind it.',
    ok: (c) => (c === 0 ? 'Nothing to attach a receipt to yet' : `All ${s(c, 'entry has', 'entries have')} a receipt attached`),
    bad: (p, c) => `${n(c - p)} of ${n(c)} have a receipt attached — ${n(p)} do not`,
  },
} satisfies Record<string, Definition>

export type CheckKey = keyof typeof CHECKS
export const CHECK_KEYS = Object.keys(CHECKS) as CheckKey[]

export type CheckResult = {
  key: string
  title: string
  why: string
  severity: CheckSeverity
  status: CheckStatus
  checked: number
  problems: number
  line: string
  samples: CheckSample[]
  /** The database never returned this check. Always a failure. */
  didNotRun?: boolean
}

export type CheckRun = {
  results: CheckResult[]
  failCount: number
  warnCount: number
}

/** Turns what the database counted into what a person is told. */
export function interpret(rows: RawCheckRow[]): CheckRun {
  const byKey = new Map(rows.map((r) => [r.check_key, r]))
  const results: CheckResult[] = []

  for (const key of CHECK_KEYS) {
    const def: Definition = CHECKS[key]
    const row = byKey.get(key)
    if (!row) {
      // Not "ok because nothing was found". A check that did not run has not checked anything.
      results.push({
        key,
        title: def.title,
        why: def.why,
        severity: 'fail',
        status: 'fail',
        checked: 0,
        problems: 1,
        line: 'This check did not run, so nothing was checked',
        samples: [],
        didNotRun: true,
      })
      continue
    }
    const problems = Number(row.problems)
    const checked = Number(row.checked)
    results.push({
      key,
      title: def.title,
      why: def.why,
      severity: def.severity,
      status: problems === 0 ? 'ok' : def.severity,
      checked,
      problems,
      line: problems === 0 ? def.ok(checked) : def.bad(problems, checked),
      samples: row.samples ?? [],
    })
  }

  // A check the database returns that this file has never heard of is a check nobody wrote
  // wording for — still shown, and treated as a failure so it cannot be ignored by accident.
  for (const row of rows) {
    if (row.check_key in CHECKS) continue
    const problems = Number(row.problems)
    results.push({
      key: row.check_key,
      title: row.check_key,
      why: 'This check is in the database but has no description yet.',
      severity: 'fail',
      status: problems === 0 ? 'ok' : 'fail',
      checked: Number(row.checked),
      problems,
      line: problems === 0 ? 'Nothing wrong found' : `${n(problems)} found`,
      samples: row.samples ?? [],
    })
  }

  return {
    results,
    failCount: results.filter((r) => r.status === 'fail').length,
    warnCount: results.filter((r) => r.status === 'warn').length,
  }
}

export type Verdict = 'clear' | 'look' | 'problem'

/** The one-word answer the page opens with. */
export function verdictOf(run: Pick<CheckRun, 'failCount' | 'warnCount'>): Verdict {
  if (run.failCount > 0) return 'problem'
  if (run.warnCount > 0) return 'look'
  return 'clear'
}

/** One line per failing check, for the alert email. Examples are left out: they name dealers. */
export function problemLines(run: Pick<CheckRun, 'results'>): string[] {
  return run.results.filter((r) => r.status === 'fail').map((r) => `${r.title} — ${r.line}`)
}
