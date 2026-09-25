export type PackageCode = 'A' | 'B' | 'C'

// Vibe Mobile unified the dealer reload rate to a flat 6% across all three
// packages (was A=7% / B=7.5% / C=8%) — see migration 0010. Package price/
// reload/gifts are unchanged; only the resale rate is now the same for all three.
export const PACKAGES: Record<PackageCode, { name: string; price: number; reload: number; rate: number }> = {
  A: { name: 'Package A', price: 349, reload: 300, rate: 6 },
  B: { name: 'Package B', price: 695, reload: 600, rate: 6 },
  C: { name: 'Package C', price: 1270, reload: 1000, rate: 6 },
}

export const COMMISSION_RATE = 0.02

// The rate a dealer gets when their package is not recorded. Every dealer on the roster has bought one — that is
// how Vibe came to record them — but Vibe has not yet told us WHICH for most of them, so dealers.package is
// empty. It is the same 6% as every package (the three above are flat), so the gap changes nothing about what a
// top-up is worth. A dealer must never be turned away, or a top-up left unpriced, over a gap in OUR records: the
// points are the same either way, and a package recorded later does not reprice an entry already made (each
// entry stores the rate it was made at). What the package does decide is how many SIM cards they are owed.
export const FLAT_DEALER_RATE = PACKAGES.A.rate

/** The dealer's own rate when one is on file, otherwise the flat rate every dealer gets. */
export function rateOrFlat(rate: number | string | null | undefined): number {
  if (rate == null || rate === '') return FLAT_DEALER_RATE
  const n = Number(rate)
  return Number.isFinite(n) && n > 0 ? n : FLAT_DEALER_RATE
}

// The most packages that can go on one row. Mirrors the check constraint in
// migration 0048, which is the real backstop — this copy is here so the form
// can say so before the database has to.
//
// The largest single order the business has seen is 40 of Package C at the
// Northern launch. 200 leaves five times that headroom and still catches a
// mistyped 3000, which at Package C would move three million reload points
// out of the credit balance in one keystroke.
export const MAX_PACKAGE_QUANTITY = 200

// A package code is a category, not a state. It used to be rendered with the
// status palette — B in jade, C in brass — which are the colours that mean
// "verified" and "pending" everywhere else in the app, so a dealer on Package
// B read at a glance as a dealer in a good state. All three are neutral now;
// the code itself is the identifier, and A/B/C don't rank against each other.
export const PACKAGE_PILL_CLASS: Record<PackageCode, string> = {
  A: 'pill-neutral',
  B: 'pill-neutral',
  C: 'pill-neutral',
}

// What master effectively pays Vibe per point: the same 8% total margin
// baked into every dealer sale (6% dealer rate + 2% master commission,
// PROJECT_SPEC.md section 3.2's "8% dealer buys 1000 points -> pays RM920")
// applies one level up too — money_rm = points x (1 - 8%). Confirmed with
// the client 2026-07-28: there's only ever been this one rate, not a
// separately-negotiated wholesale price.
export const CREDIT_PURCHASE_RATE = PACKAGES.A.rate / 100 + COMMISSION_RATE

// A top-up's money can be issued partly or fully as fixed-denomination
// coupons instead of straight to the dealer's phone — same points/rate/2%
// math either way (coupon_rm is purely a fulfillment-method annotation on
// top of the existing calculation, not a different pricing model like SIM
// Card Stock). Coupons only come in this one denomination.
export const COUPON_DENOMINATION_RM = 10
