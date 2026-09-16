// Whether an amount is a lot more than a dealer's own history would predict —
// the check behind the self-submit form's "this looks a lot higher than
// usual" nudge (0042's link) and, before that, a rejected idea to run it
// through a model instead. A model has no advantage on "is X much bigger
// than the typical of this list": it is a plain comparison against a
// baseline computed from real rows, and a language model would only add
// latency and a chance of misreading its own instructions. This is the same
// call as reconcile-gap.ts's arithmetic search.
//
// Median, not mean — one exceptional purchase (a dealer's one-off Package C
// alongside a dozen ordinary top-ups) would drag a mean upward and blunt the
// check exactly when a real outlier needs comparing against the ordinary
// case, not against itself.

// Below this many past amounts, a "typical" figure would be built from too
// thin a sample to mean anything — two data points is a coincidence, not a
// pattern.
const MIN_SAMPLE_SIZE = 3

// How far above typical counts as worth a nudge. Three times a dealer's own
// median is well past a normal month-to-month swing (a dealer who tops up
// RM300-800 buying RM1,200 is still plausible) but catches the shape a stray
// digit actually produces (RM500 typed as RM5,000 is 10x).
export const UNUSUAL_AMOUNT_MULTIPLIER = 3

export function typicalAmount(pastAmounts: number[]): number | null {
  const valid = pastAmounts.filter((n) => Number.isFinite(n) && n > 0)
  if (valid.length < MIN_SAMPLE_SIZE) return null
  const sorted = [...valid].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function isUnusuallyHigh(amount: number, typical: number | null): boolean {
  if (typical == null || !Number.isFinite(amount)) return false
  return amount > typical * UNUSUAL_AMOUNT_MULTIPLIER
}
