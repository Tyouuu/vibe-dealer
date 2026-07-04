export type PackageCode = 'A' | 'B' | 'C'

export const PACKAGES: Record<PackageCode, { name: string; price: number; reload: number; rate: number }> = {
  A: { name: 'Package A', price: 349, reload: 300, rate: 7 },
  B: { name: 'Package B', price: 695, reload: 600, rate: 7.5 },
  C: { name: 'Package C', price: 1270, reload: 1000, rate: 8 },
}

export const COMMISSION_RATE = 0.02
