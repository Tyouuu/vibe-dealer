// Finding a lead on a reconciliation gap by arithmetic, not by asking a
// language model.
//
// Vibe's statement is only ever two numbers — a total point figure and a
// profit figure — never a line-by-line breakdown, so there is nothing to
// diff our transaction list against item by item. What we do have is our own
// list of this month's verified transactions and one number: how far off it
// is from Vibe's total. A model has no advantage there — matching numbers to
// a target sum is exact arithmetic over a small, known list, which a plain
// search does perfectly and a language model does by guessing. This is the
// same call made about the entry-amount idea that got marked "doesn't need
// AI": the honest answer here is also a deterministic search, not a prompt.
//
// Only meaningful when the system recorded MORE than Vibe's statement
// (gap > 0): the excess has to be sitting among our own rows somewhere, so a
// subset of them can account for it. When Vibe's statement is the larger
// side (gap < 0), the difference is something Vibe counted that isn't in our
// list at all — by definition not findable by searching our own rows, so
// that case gets a different, non-searching explanation instead.

export type GapTx = {
  id: string
  dealerId: string
  dealerName: string
  points: number
  txDate: string
}

export type GapFinding =
  | { kind: 'exact-single'; tx: GapTx }
  | { kind: 'exact-pair'; a: GapTx; b: GapTx }
  | { kind: 'boundary'; txs: GapTx[] }
  | { kind: 'gap-negative' }
  | { kind: 'no-lead' }

// More than this many pairs summing to the same target, in one month's rows,
// is coincidence rather than a lead — showing twenty unrelated-looking pairs
// would read as noise, not help.
const MAX_USEFUL_PAIR_MATCHES = 5

// How many of the last days of the month count as "boundary" — a sale
// recorded on the 30th or 31st is the classic case of landing on one side of
// a cutoff and not the other.
const BOUNDARY_DAYS = 2

export function findReconciliationGapLeads(rows: GapTx[], gapPoints: number, monthEnd: string): GapFinding[] {
  if (gapPoints === 0) return []
  if (gapPoints < 0) return [{ kind: 'gap-negative' }]

  const singleMatch = rows.find((r) => r.points === gapPoints)
  if (singleMatch) return [{ kind: 'exact-single', tx: singleMatch }]

  // O(n^2) over one month's verified transactions — a few hundred at the
  // very most for this business — so a plain double loop is simpler and just
  // as fast as anything cleverer here.
  const pairMatches: { a: GapTx; b: GapTx }[] = []
  outer: for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      if (rows[i].points + rows[j].points === gapPoints) {
        pairMatches.push({ a: rows[i], b: rows[j] })
        if (pairMatches.length > MAX_USEFUL_PAIR_MATCHES) break outer
      }
    }
  }
  if (pairMatches.length >= 1 && pairMatches.length <= MAX_USEFUL_PAIR_MATCHES) {
    return pairMatches.map((p) => ({ kind: 'exact-pair' as const, a: p.a, b: p.b }))
  }

  const boundaryStart = new Date(`${monthEnd}T00:00:00Z`)
  boundaryStart.setUTCDate(boundaryStart.getUTCDate() - (BOUNDARY_DAYS - 1))
  const boundaryFloor = boundaryStart.toISOString().slice(0, 10)
  const boundaryTxs = rows.filter((r) => r.txDate >= boundaryFloor && r.txDate <= monthEnd)
  if (boundaryTxs.length > 0) return [{ kind: 'boundary', txs: boundaryTxs }]

  return [{ kind: 'no-lead' }]
}
