// A dealer's own usual top-ups, offered as one-tap choices on their link.
//
// Most dealers send the same few amounts over and over. Typing RM 940 is one place to slip a digit;
// tapping "RM 940" is none. So the form offers the amounts this dealer has actually had verified before —
// never a list of generic round numbers, which would suggest amounts they have never sent.
//
// Most frequent first, and among equally frequent ones the most recent. Only VERIFIED history is passed in
// by the caller: a request that was never checked could itself be the typo this exists to prevent.

/**
 * @param pastAmounts newest first, RM.
 * @param limit how many to offer. Three fits one row on a phone.
 */
export function usualAmounts(pastAmounts: number[], limit = 3): number[] {
  const seen = new Map<number, { count: number; firstIndex: number }>()
  pastAmounts.forEach((raw, index) => {
    const amount = Math.round(raw * 100) / 100
    if (!Number.isFinite(amount) || amount <= 0) return
    const entry = seen.get(amount)
    if (entry) entry.count++
    else seen.set(amount, { count: 1, firstIndex: index })
  })

  return [...seen.entries()]
    .sort(([, a], [, b]) => b.count - a.count || a.firstIndex - b.firstIndex)
    .slice(0, limit)
    .map(([amount]) => amount)
}
