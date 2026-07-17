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
