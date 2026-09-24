// Column sorting for the Dealers list. The list has one deliberate default order —
// pinned dealers first, then whoever has topped up the most — and clicking a
// header replaces it with what the reader asked for. A pin is a promise about the
// default view; an explicit "sort by name" that still floated pinned dealers to the
// top would not be sorted by name.
export const DEALER_SORT_KEYS = ['name', 'region', 'package', 'topup', 'cards'] as const
export type DealerSortKey = (typeof DEALER_SORT_KEYS)[number]
export type SortDir = 'asc' | 'desc'

// Money and volume read best biggest-first; names and labels read A to Z.
const FIRST_DIR: Record<DealerSortKey, SortDir> = { name: 'asc', region: 'asc', package: 'asc', topup: 'desc', cards: 'desc' }

export function parseDealerSort(rawSort: string | undefined, rawDir: string | undefined): { key: DealerSortKey; dir: SortDir } | null {
  const key = DEALER_SORT_KEYS.find((k) => k === rawSort)
  if (!key) return null
  return { key, dir: rawDir === 'asc' || rawDir === 'desc' ? rawDir : FIRST_DIR[key] }
}

// What clicking a column's header does next: sort by it, then reverse it, then
// give the default order back.
export function nextDealerSort(
  current: { key: DealerSortKey; dir: SortDir } | null,
  key: DealerSortKey,
): { key: DealerSortKey; dir: SortDir } | null {
  if (!current || current.key !== key) return { key, dir: FIRST_DIR[key] }
  if (current.dir === FIRST_DIR[key]) return { key, dir: FIRST_DIR[key] === 'asc' ? 'desc' : 'asc' }
  return null
}

type SortableDealer = { company_name: string; region: string | null; package: string | null; totalPoints: number; cardEarningsRm: number }

// A missing region or package always sorts last, in either direction — an empty
// value is not "smaller than A", it is the absence of an answer.
function textCompare(a: string | null, b: string | null, dir: SortDir): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return dir === 'asc' ? a.localeCompare(b) : b.localeCompare(a)
}

export function compareDealers(a: SortableDealer, b: SortableDealer, sort: { key: DealerSortKey; dir: SortDir }): number {
  const sign = sort.dir === 'asc' ? 1 : -1
  const primary =
    sort.key === 'name'
      ? sign * a.company_name.localeCompare(b.company_name)
      : sort.key === 'region'
        ? textCompare(a.region, b.region, sort.dir)
        : sort.key === 'package'
          ? textCompare(a.package, b.package, sort.dir)
          : sort.key === 'topup'
            ? sign * (a.totalPoints - b.totalPoints)
            : sign * (a.cardEarningsRm - b.cardEarningsRm)
  return primary || a.company_name.localeCompare(b.company_name)
}
