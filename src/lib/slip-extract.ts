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
