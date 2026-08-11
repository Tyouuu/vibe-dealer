// SIM card wholesale pricing — Vibe Mobile sells to the master dealer at a
// flat per-unit cost; the master dealer resells to its own dealers at a flat
// markup. A box of SIM cards from Vibe Mobile is 250 units — that's just a
// convenient intake-entry unit, not enforced anywhere (intake quantity is a
// raw unit count). These mirror the constants baked into migration 0024's
// create_sim_order() — kept here only for rendering the same numbers in the
// UI, not as the source of truth (the DB function stamps the real values).
import type { PackageCode } from './packages'

export const SIM_UNIT_COST_RM = 2
export const SIM_SELL_PRICE_RM = 3.5
export const SIM_MARGIN_RM = SIM_SELL_PRICE_RM - SIM_UNIT_COST_RM
export const SIM_MIN_ORDER_QTY = 10
export const SIM_BOX_SIZE = 250

// How many SIM cards a package entitles the dealer to.
//
// This is the link between the two halves of the business that the system has
// been keeping apart. A package is bought for its reload points, and the
// points side is already modelled — but the cards that come with it are where
// the master dealer's own money is. On the Northern launch event of
// 2026-07-27/28 the dealers paid Vibe for packages, none of which reached the
// master dealer; the 10,480 cards those packages entitled them to, at RM1.50 a
// card, is the RM15,720 that did.
//
// Earlier notes here and in commit 44a102e say 11,480 cards / RM17,220. That
// counted a RM12,700 line labelled "NORTHERN POINT" as 10 × Package C, and
// that row has no company name at all — its "10" sits in the PIC Name column.
// It cannot be attributed to a dealer, so its 1,000 cards are not counted.
//
// So every package sale carries a second figure that nothing in the app was
// showing: how many cards go out of the box, and what is earned on them.
export const PACKAGE_SIM_CARDS: Record<PackageCode, number> = {
  A: 20,
  B: 40,
  C: 100,
}

export type PackageCardEconomics = {
  cards: number
  /** What the dealer pays for the cards, at the standing RM3.50. */
  revenueRm: number
  /** What those cards cost from Vibe, at the standing RM2.00. */
  costRm: number
  /** revenue − cost. The only part of a package sale the master dealer keeps. */
  marginRm: number
}

/**
 * The card side of a package sale. `quantity` is how many of that package
 * were bought on one order — a single dealer bought 40 of Package C at the
 * launch event, so one is not a safe assumption.
 *
 * Rounded to the cent at every step. These are whole cards at fixed prices,
 * so nothing here can produce a fraction today, but a price that later stops
 * being a clean multiple of 0.5 should not leak floating-point dust into a
 * figure someone reconciles against a bank statement.
 */
export function packageCardEconomics(pkg: PackageCode, quantity = 1): PackageCardEconomics {
  const cards = PACKAGE_SIM_CARDS[pkg] * quantity
  const revenueRm = Math.round(cards * SIM_SELL_PRICE_RM * 100) / 100
  const costRm = Math.round(cards * SIM_UNIT_COST_RM * 100) / 100
  return { cards, revenueRm, costRm, marginRm: Math.round((revenueRm - costRm) * 100) / 100 }
}

/**
 * What a number of cards is worth to the master dealer — RM1.50 each, the
 * margin between what Vibe charges and what a dealer pays.
 *
 * This is the one figure in the business the owner earns directly. Packages
 * are paid to Vibe and the points side belongs to them; the cards are his.
 * It had no home in the app outside a single panel on a dealer's own page,
 * which is why the question "where is the card money" had no answer on any
 * list.
 */
export function cardEarningsRm(cards: number): number {
  return Math.round(cards * SIM_MARGIN_RM * 100) / 100
}

/**
 * Cards a dealer has been sold against cards they have actually been given.
 *
 * The launch event turned this from bookkeeping into a real question. One
 * dealer bought a Package C — 100 cards — and the event sheet carries a note
 * beside their row reading "Took 10 pcs numbered SIM". Nine hundred ringgit of
 * stock is owed to them and nothing in the app knew, because packages live in
 * `transactions` and cards live in `sim_orders` and the two had never been
 * asked to agree.
 *
 * Delivered can legitimately exceed entitled: a dealer may buy loose cards on
 * top of a package. Those dealers are simply not owed anything, and their
 * surplus is not netted off somebody else's shortfall — an owed figure that
 * quietly shrinks because another dealer over-ordered would be worse than no
 * figure at all.
 */
export function cardsOwedByDealer(
  packageSales: { dealer_id: string; package: string | null; quantity?: number }[],
  simOrders: { dealer_id: string; quantity: number }[]
): { byDealer: Map<string, { entitled: number; delivered: number; owed: number }>; totalEntitled: number; totalDelivered: number; totalOwed: number } {
  const byDealer = new Map<string, { entitled: number; delivered: number; owed: number }>()
  const row = (id: string) => {
    let r = byDealer.get(id)
    if (!r) byDealer.set(id, (r = { entitled: 0, delivered: 0, owed: 0 }))
    return r
  }

  for (const sale of packageSales) {
    const pkg = sale.package
    // A transaction that is not a package sale, or names a package this app
    // does not sell, entitles nobody to anything.
    if (!pkg || !(pkg in PACKAGE_SIM_CARDS)) continue
    row(sale.dealer_id).entitled += PACKAGE_SIM_CARDS[pkg as PackageCode] * (sale.quantity ?? 1)
  }
  for (const order of simOrders) row(order.dealer_id).delivered += order.quantity

  let totalEntitled = 0
  let totalDelivered = 0
  let totalOwed = 0
  for (const r of byDealer.values()) {
    r.owed = Math.max(0, r.entitled - r.delivered)
    totalEntitled += r.entitled
    totalDelivered += r.delivered
    totalOwed += r.owed
  }
  return { byDealer, totalEntitled, totalDelivered, totalOwed }
}

// Two physical variants (with/without a bound phone number) plus eSIM —
// three fully separate stock pools, same pricing/min-order rule for all
// three (see migration 0027).
export type SimStockType = 'physical' | 'physical_no_number' | 'esim'

export const SIM_STOCK_TYPES: SimStockType[] = ['physical', 'physical_no_number', 'esim']

export function isSimStockType(value: string): value is SimStockType {
  return (SIM_STOCK_TYPES as string[]).includes(value)
}

export const SIM_TYPE_LABEL: Record<SimStockType, string> = {
  physical: 'Physical SIM (With Number)',
  physical_no_number: 'Physical SIM (No Number)',
  esim: 'eSIM',
}

// The same three pools, named for a segmented control rather than a table.
//
// The full labels wrap to two lines inside a 448px three-way switch, which
// made that control taller than every field beside it and left the row ragged
// along the bottom. The group is already labelled "SIM Type", so repeating
// "Physical SIM" three times inside it says nothing the label has not.
export const SIM_TYPE_SHORT: Record<SimStockType, string> = {
  physical: 'With number',
  physical_no_number: 'No number',
  esim: 'eSIM',
}

// All neutral. These were slate / info / jade — three status hues for what is
// a category, so eSIM rendered in the green that means "verified" and a SIM
// type read as a verdict. The status palette is reserved for things that can
// change state; a SIM type never changes. See the note beside .pill-neutral.
export const SIM_TYPE_PILL_CLASS: Record<SimStockType, string> = {
  physical: 'pill-neutral',
  physical_no_number: 'pill-neutral',
  esim: 'pill-neutral',
}

// Both physical variants have a real shipment (shipping fee/invoice, mark-
// as-sent) — only eSIM has nothing to ship and takes a code instead.
export function isPhysicalSimType(simType: SimStockType): boolean {
  return simType === 'physical' || simType === 'physical_no_number'
}
