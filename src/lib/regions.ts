// Single source of truth for suggested region names — previously defined
// only inline in the onboarding form, so the dealer-edit form (the one tool
// most likely to be used to *correct* a region) had no suggestion list at
// all, and nothing anywhere normalized casing/whitespace. "KL" vs "kl" vs
// " KL" would silently become separate buckets across the region filter
// dropdown, the "By Region" grouping, and the dashboard's region-growth
// chart/map.
export const REGIONS = [
  'Ipoh',
  'Penang',
  'KL',
  'Johor',
  'Klang',
  'Melaka',
  'Seremban',
  'Kuantan',
  'Taiping',
  'Teluk Intan',
  'Sitiawan',
  'Kampar',
]

// Snaps a free-typed region to its known canonical casing (case-insensitive
// match); otherwise just trims it. Doesn't reject unknown regions — the
// field is deliberately free text — this only stops a *known* region from
// splitting into two buckets over a casing/whitespace difference.
export function normalizeRegion(input: string | null | undefined): string | null {
  const trimmed = (input ?? '').trim()
  if (!trimmed) return null
  const canonical = REGIONS.find((r) => r.toLowerCase() === trimmed.toLowerCase())
  return canonical ?? trimmed
}
