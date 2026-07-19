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

// A top-up's money can be issued partly or fully as fixed-denomination
// coupons instead of straight to the dealer's phone — same points/rate/2%
// math either way (coupon_rm is purely a fulfillment-method annotation on
// top of the existing calculation, not a different pricing model like SIM
// Card Stock). Coupons only come in this one denomination.
export const COUPON_DENOMINATION_RM = 10
