// What the master dealer made, and which dealer made it for them.
//
// Two lines, and they are different kinds of money:
//
//   commission   2% of every point a dealer tops up. Paid by Vibe.
//   card margin  RM1.50 on every SIM card a package puts out of the box.
//                RM3.50 from the dealer against RM2.00 to Vibe.
//
// WHEN THE CARD MONEY IS EARNED
//
// Confirmed with the owner on 2026-08-26: at the moment the dealer buys the
// package, not at the moment the cards are handed over. The cards are theirs
// from the sale; an undelivered card is stock owed, not money unearned. Two
// screens had been disagreeing about this -- /dealers counted the
// entitlement, the dashboard counted `sim_orders` -- and on the demo's data
// that was RM 17,879 against RM 14,047 with a different dealer on top of each
// list. This module is the one answer both now use.
//
// `sim_orders` stays a separate line of business: loose cards a dealer buys
// on top of a package. It is not double-counted here, and cardsOwedByDealer
// in sim-stock.ts is still what says how much of the entitlement has actually
// been shipped.
import { PACKAGE_SIM_CARDS, SIM_MARGIN_RM } from './sim-stock'
import type { PackageCode } from './packages'

export type EarningsTx = {
  dealer_id: string
  tx_date: string
  type: string
  package: string | null
  quantity: number | null
  status: string
  commission_rm: number | string
}

export type DealerEarnings = {
  dealerId: string
  /** 2% on verified top-ups and package sales alike. */
  commissionRm: number
  /** RM1.50 a card on the packages they bought. */
  cardRm: number
  /** The two added up — what this dealer was worth in the period. */
  totalRm: number
  /** Packages bought in the period, by code. */
  packages: Record<PackageCode, number>
  /** "3 × A" / "2 × A + 1 × C", or null if they bought none this period. */
  packagesLabel: string | null
  cards: number
}

export type EarningsTotals = {
  commissionRm: number
  cardRm: number
  totalRm: number
  cards: number
  /** Not counted above: the same two figures on rows still awaiting a check. */
  pendingRm: number
  pendingCount: number
  byDealer: DealerEarnings[]
}

const num = (v: number | string | null | undefined) => (v == null ? 0 : Number(v))
const cardsOn = (t: EarningsTx) =>
  t.type === 'package' && t.package && t.package in PACKAGE_SIM_CARDS
    ? PACKAGE_SIM_CARDS[t.package as PackageCode] * Math.max(1, t.quantity ?? 1)
    : 0

/**
 * Roll a window of transactions up into one total and a ranked list.
 *
 * Only verified rows count toward the headline. A pending row is a claim
 * somebody still has to check, and a figure that moves on an unchecked claim
 * is the figure that gets argued about later — so pending is returned beside
 * the total rather than inside it, the way a payment processor separates an
 * available balance from one still settling.
 */
export function earningsFrom(rows: EarningsTx[]): EarningsTotals {
  const per = new Map<string, DealerEarnings>()
  const row = (id: string) => {
    let r = per.get(id)
    if (!r) {
      per.set(id, (r = { dealerId: id, commissionRm: 0, cardRm: 0, totalRm: 0, packages: { A: 0, B: 0, C: 0 }, packagesLabel: null, cards: 0 }))
    }
    return r
  }

  let pendingRm = 0
  let pendingCount = 0

  for (const t of rows) {
    if (t.status === 'flagged') continue
    const cards = cardsOn(t)
    if (t.status !== 'verified') {
      pendingRm += num(t.commission_rm) + cards * SIM_MARGIN_RM
      pendingCount++
      continue
    }
    const r = row(t.dealer_id)
    r.commissionRm += num(t.commission_rm)
    if (cards) {
      r.cards += cards
      r.cardRm += cards * SIM_MARGIN_RM
      if (t.package && t.package in PACKAGE_SIM_CARDS) r.packages[t.package as PackageCode] += Math.max(1, t.quantity ?? 1)
    }
  }

  let commissionRm = 0
  let cardRm = 0
  let cards = 0
  for (const r of per.values()) {
    r.commissionRm = round2(r.commissionRm)
    r.cardRm = round2(r.cardRm)
    r.totalRm = round2(r.commissionRm + r.cardRm)
    r.packagesLabel =
      (['A', 'B', 'C'] as PackageCode[])
        .filter((p) => r.packages[p] > 0)
        .map((p) => `${r.packages[p]} × ${p}`)
        .join(' + ') || null
    commissionRm += r.commissionRm
    cardRm += r.cardRm
    cards += r.cards
  }

  // Sorted by what they were worth, then by name-stable dealer id so two
  // dealers on the same figure do not swap places on every refresh — a list
  // that reorders itself under a thumb is unreadable, and this one refreshes
  // itself whenever a sale lands.
  const byDealer = [...per.values()]
    .filter((r) => r.totalRm > 0)
    .sort((a, b) => b.totalRm - a.totalRm || a.dealerId.localeCompare(b.dealerId))

  return {
    commissionRm: round2(commissionRm),
    cardRm: round2(cardRm),
    totalRm: round2(commissionRm + cardRm),
    cards,
    pendingRm: round2(pendingRm),
    pendingCount,
    byDealer,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export type EarningsPeriod = 'today' | 'month' | 'all'

export const PERIOD_LABEL: Record<EarningsPeriod, string> = {
  today: 'Today',
  month: 'This month',
  all: 'All time',
}

export function isEarningsPeriod(v: string | undefined): v is EarningsPeriod {
  return v === 'today' || v === 'month' || v === 'all'
}

/**
 * The date window a period covers, in Malaysia time, as the app stores dates.
 * `all` has no lower bound — returning null rather than a sentinel date keeps
 * the caller from having to guess how far back "all" reaches.
 */
export function periodRange(period: EarningsPeriod, today: string): { from: string | null; to: string } {
  if (period === 'today') return { from: today, to: today }
  if (period === 'month') return { from: `${today.slice(0, 7)}-01`, to: today }
  return { from: null, to: today }
}
