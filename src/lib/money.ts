// Money and points formatting, in one place.
//
// Every RM figure in the app was `RM ${n.toLocaleString()}`, which varies its
// decimal places with the value: RM 1,234.5 for 1234.5, RM 1,234 for 1234,
// RM 0.5 for half a ringgit. A commission of RM 1,234.50 rendering as
// "RM 1,234.5" is the kind of thing that makes a finance tool look untrustworthy
// even when the arithmetic underneath is right — and this app's own audit doc
// found the same class of drift in icon sizes and page titles, both fixed by
// giving the thing one definition instead of fifty.
//
// Sen are never dropped. This is a ledger.

const MYR = new Intl.NumberFormat('en-MY', {
  style: 'currency',
  currency: 'MYR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** "RM 1,234.50" — always two decimal places. */
export function formatMYR(value: number | string | null | undefined): string {
  const n = Number(value ?? 0)
  return MYR.format(Number.isFinite(n) ? n : 0)
}

// Points are a whole-unit currency of their own (1 point = RM1 of top-up
// value), so they get separators but no forced decimals — a fractional point
// only ever appears from an adjustment, and hiding it would be worse than the
// ragged width.
const POINTS = new Intl.NumberFormat('en-MY', { maximumFractionDigits: 2 })

/** "1,234" or "1,234.5" — separators, no trailing .00 padding. */
export function formatPoints(value: number | string | null | undefined): string {
  const n = Number(value ?? 0)
  return POINTS.format(Number.isFinite(n) ? n : 0)
}
