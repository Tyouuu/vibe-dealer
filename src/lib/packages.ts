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

// Shared with the Dealers list and the Audit Log's package-change rows so a
// given package code always reads as the same color everywhere it appears.
export const PACKAGE_PILL_CLASS: Record<PackageCode, string> = {
  A: 'pill-neutral',
  B: 'pill-jade',
  C: 'pill-brass',
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
