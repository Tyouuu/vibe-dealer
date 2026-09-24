// Reading a bank transfer slip, and saying what disagrees with the request it
// was attached to.
//
// Same shape as dealer-extract.ts: a schema the model must fill, a system
// prompt that says what the picture is, and a type for what comes back. The
// comparison lives here too rather than in the page, because the page and any
// future caller have to reach the same verdict from the same numbers.

export const SLIP_EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    amount_rm: {
      type: ['number', 'null'],
      description: 'The amount transferred, in ringgit, as a number. 1,250.00 becomes 1250. Null if not clearly visible.',
    },
    paid_on: {
      type: ['string', 'null'],
      description: 'The date of the transfer in YYYY-MM-DD. Null if not clearly visible.',
    },
    bank: {
      type: ['string', 'null'],
      description: 'The bank the money was sent FROM, e.g. Maybank, CIMB, Public Bank, Touch n Go. Null if not shown.',
    },
    reference: {
      type: ['string', 'null'],
      description:
        'The transaction reference or receipt number printed on the slip, e.g. 20260814123456789. Not the account number, not the phone number. Null if not shown.',
    },
    recipient: {
      type: ['string', 'null'],
      description: 'The name or account the money was sent TO, as printed. Null if not shown.',
    },
  },
  required: ['amount_rm', 'paid_on', 'bank', 'reference', 'recipient'],
  additionalProperties: false,
} as const

export const SLIP_EXTRACTION_SYSTEM = [
  'You read Malaysian bank transfer slips and e-wallet receipts: Maybank2u, CIMB Clicks, Public Bank, RHB, Bank Islam, Touch n Go, DuitNow, GrabPay.',
  'Read only what is printed. Never infer, never complete a partial number, never convert a currency.',
  'A field you cannot see clearly is null. A guessed amount on a payment slip is worse than no amount, because somebody will approve money against it.',
].join(' ')

export const SLIP_EXTRACTION_PROMPT =
  'Extract the transfer amount, the date it was made, the sending bank, the transaction reference and the recipient from this payment slip.'

export type ExtractedSlip = {
  amount_rm: number | null
  paid_on: string | null
  bank: string | null
  reference: string | null
  recipient: string | null
}

/** What the dealer typed on the request form. */
export type SlipClaim = {
  /** The amount the request is for — money_rm for a top-up, the package price otherwise. */
  amountRm: number
  /** The dealer's own free-text "which bank, and any reference" line. */
  paidFrom: string | null
  /** The transfer date the dealer stated, YYYY-MM-DD. */
  transferDate: string | null
  /** When the request was submitted, for judging how old the slip is. */
  submittedAt: string
}

export type SlipFinding = {
  kind: 'amount' | 'date' | 'reference' | 'unread'
  /** 'bad' is money-wrong. 'warn' is worth a look before approving. */
  tone: 'bad' | 'warn'
  text: string
}

const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')
const money = (n: number) => `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** How old a slip may be before it stops looking like payment for this request. */
export const SLIP_STALE_DAYS = 45

/**
 * Everything the slip disagrees with. Empty means the slip backs the request.
 *
 * Deliberately not a score or a single verdict: a reviewer decides, and the
 * three problems have different answers. A wrong amount is refuse. An old
 * date is ask. A reference that does not match what they typed is usually a
 * typo and only matters next to the duplicate check.
 */
export function compareSlip(claim: SlipClaim, slip: ExtractedSlip): SlipFinding[] {
  const out: SlipFinding[] = []

  if (slip.amount_rm != null && Math.abs(slip.amount_rm - claim.amountRm) > 0.005) {
    out.push({
      kind: 'amount',
      tone: 'bad',
      // Grouped, like every other figure in the app. toFixed(2) alone printed
      // "RM 1234.50" beside a card whose own heading said "RM 1,234.50",
      // which is two spellings of one number on one screen.
      text: `Slip says ${money(slip.amount_rm)} — the request is for ${money(claim.amountRm)}`,
    })
  }

  if (slip.paid_on) {
    const paid = new Date(`${slip.paid_on}T00:00:00Z`).getTime()
    const submitted = new Date(claim.submittedAt).getTime()
    if (Number.isFinite(paid) && Number.isFinite(submitted)) {
      const days = Math.round((submitted - paid) / 86400000)
      if (days > SLIP_STALE_DAYS) {
        out.push({ kind: 'date', tone: 'bad', text: `Slip is dated ${slip.paid_on} — ${days} days before this request` })
      } else if (days < -1) {
        // Tomorrow's slip is not a slip. One day of slack for timezones.
        out.push({ kind: 'date', tone: 'warn', text: `Slip is dated ${slip.paid_on}, after the request was sent` })
      } else if (claim.transferDate && claim.transferDate !== slip.paid_on) {
        out.push({ kind: 'date', tone: 'warn', text: `Slip is dated ${slip.paid_on} — the dealer said ${claim.transferDate}` })
      }
    }
  }

  // Only when the dealer typed something with digits in it. A blank
  // "which bank" line is not a discrepancy, it is an optional field left
  // empty — and the slip's own reference is the one the duplicate check
  // should be using anyway.
  const typed = digits(claim.paidFrom)
  const onSlip = digits(slip.reference)
  if (typed.length >= 4 && onSlip.length >= 4 && !onSlip.includes(typed) && !typed.includes(onSlip)) {
    out.push({ kind: 'reference', tone: 'warn', text: `Slip reference ${slip.reference} — the dealer typed "${claim.paidFrom}"` })
  }

  return out
}

// ---------------------------------------------------------------------------------------------
// The same slip, read for a person typing an entry rather than a dealer sending a request.
//
// compareSlip above answers "does this slip back what the DEALER claimed?". Staff entering a payment
// are in a different position: nobody has claimed anything, the slip is the source, and the question
// is whether what was typed — or filled in from it — agrees with it. The wording differs for that
// reason ("this entry is RM 940", not "the dealer said"), and so does one rule: an entry is allowed to
// be dated a day or two after the transfer, because someone records it once they have caught up.

/** A slip whose reference is already on an entry — the same payment about to be counted twice. */
export type DuplicateHit = {
  kind: 'entry' | 'purchase' | 'intake'
  /** Who it was recorded against: a dealer's name, or "Credit purchase". */
  label: string
  date: string
  moneyRm: number
  status: string | null
}

/** What /api/receipts/read answers with. */
export type ReadResponse = { slip: ExtractedSlip; duplicate: DuplicateHit | null }

/**
 * What a dealer's own link is told about the slip they attached. Four fields and a yes-or-no: never the
 * recipient's account, never anything about another dealer.
 */
export type DealerSlipReading = {
  slip: Pick<ExtractedSlip, 'amount_rm' | 'paid_on' | 'bank' | 'reference'>
  /** This slip's reference is already on one of THIS dealer's requests or entries. */
  alreadySent: boolean
}

/** What was typed on the form. Null when there is nothing to compare yet. */
export type EntryClaim = {
  /** The RM figure on the form: the amount collected, or a package's price times how many. */
  amountRm: number | null
  /** The date on the form, YYYY-MM-DD. */
  date: string | null
}

/** Below this many characters a "reference" is a shorthand, not something two entries can share. */
export const MIN_REFERENCE_KEY_LENGTH = 8

/**
 * A reference as it is compared: letters and digits only, lower-cased. "FT26091412345678" and
 * "ft 2609-1412345678" are one payment. The database keeps the same thing in reference_key (0057),
 * and slip-extract.test.ts fails if the two ever stop agreeing.
 */
export function referenceKey(ref: string | null | undefined): string {
  return (ref ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** True when a reference is long enough to tell one payment from another. */
export function isComparableReference(ref: string | null | undefined): boolean {
  return referenceKey(ref).length >= MIN_REFERENCE_KEY_LENGTH
}

const daysBetween = (fromIso: string, toIso: string) =>
  Math.round((new Date(`${toIso}T00:00:00Z`).getTime() - new Date(`${fromIso}T00:00:00Z`).getTime()) / 86_400_000)

/**
 * Whether the date on a slip is safe to put on an entry without being asked: a real day, not in the
 * future, and recent enough to be this payment. A date that fails this is still SHOWN — it is only not
 * used to overwrite the date on the form.
 */
export function slipDateUsable(paidOn: string | null, today: string): paidOn is string {
  if (!paidOn || !/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return false
  const age = daysBetween(paidOn, today)
  return Number.isFinite(age) && age >= 0 && age <= SLIP_STALE_DAYS
}

/**
 * Everything the slip disagrees with about an entry. Empty means the slip backs the form.
 *
 * Only what the slip actually said is compared: a field it did not show (null) is not a finding,
 * because "the AI could not read a date" is not "the date is wrong".
 */
export function compareSlipToEntry(entry: EntryClaim, slip: ExtractedSlip, today: string): SlipFinding[] {
  const out: SlipFinding[] = []

  if (slip.amount_rm != null && entry.amountRm != null && Math.abs(slip.amount_rm - entry.amountRm) > 0.005) {
    out.push({
      kind: 'amount',
      tone: 'bad',
      text: `The slip says ${money(slip.amount_rm)} — this entry is ${money(entry.amountRm)}`,
    })
  }

  if (slip.paid_on) {
    const fromSlipToToday = daysBetween(slip.paid_on, today)
    if (fromSlipToToday < 0) {
      // A transfer that has not happened yet is not a payment. A day of slack for the phone's clock.
      if (fromSlipToToday < -1) out.push({ kind: 'date', tone: 'bad', text: `The slip is dated ${slip.paid_on}, which is in the future` })
    } else if (fromSlipToToday > SLIP_STALE_DAYS) {
      out.push({ kind: 'date', tone: 'warn', text: `The slip is dated ${slip.paid_on} — ${fromSlipToToday} days ago. Is it the right one?` })
    } else if (entry.date && entry.date !== slip.paid_on) {
      const gap = Math.abs(daysBetween(slip.paid_on, entry.date))
      out.push({
        kind: 'date',
        tone: 'warn',
        text: `The slip is dated ${slip.paid_on}; this entry is dated ${entry.date} (${gap} ${gap === 1 ? 'day' : 'days'} apart)`,
      })
    }
  }

  return out
}

/**
 * The same comparison, worded for the dealer holding the phone. Two things only, because those are the
 * two a dealer can fix on the spot: the amount they typed against the slip, and a slip that does not
 * look like this payment. Everything else (a bank they did not mention, a reference) is for staff.
 */
export function compareSlipForDealer(entry: EntryClaim, slip: Pick<ExtractedSlip, 'amount_rm' | 'paid_on'>, today: string): string[] {
  const out: string[] = []
  if (slip.amount_rm != null && entry.amountRm != null && Math.abs(slip.amount_rm - entry.amountRm) > 0.005) {
    out.push(`Your slip says ${money(slip.amount_rm)}, but you entered ${money(entry.amountRm)}. Please check before sending.`)
  }
  if (slip.paid_on) {
    const age = daysBetween(slip.paid_on, today)
    if (age < -1) out.push(`Your slip is dated ${slip.paid_on}, which has not happened yet. Is it the right picture?`)
    else if (age > SLIP_STALE_DAYS) out.push(`Your slip is from ${age} days ago. Is it the right picture?`)
  }
  return out
}

/** "the amount", "the amount and the date", "the amount, the date and the bank" — a list as a person says it. */
export function joinWords(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}
