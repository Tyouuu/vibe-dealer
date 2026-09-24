// Which page buttons to draw: always the first and last page and the current one
// with its neighbours, and an ellipsis wherever pages are skipped —
// 1 … 5 [6] 7 … 20. A gap of exactly one page is filled in rather than elided,
// because "…" standing in for a single number is longer to read than the number.
export type PageSlot = number | 'gap'

// Up to this many pages every page gets its own button: hiding pages 3 and 4 of
// a five-page list behind an ellipsis saves no room and costs two clicks.
export const ALL_PAGES_UP_TO = 7

export function pageWindow(page: number, total: number): PageSlot[] {
  if (total <= ALL_PAGES_UP_TO) return Array.from({ length: total }, (_, i) => i + 1)
  const wanted = new Set([1, total, page - 1, page, page + 1].filter((p) => p >= 1 && p <= total))
  const pages = [...wanted].sort((a, b) => a - b)
  const slots: PageSlot[] = []
  for (let i = 0; i < pages.length; i++) {
    const gap = i === 0 ? 0 : pages[i] - pages[i - 1] - 1
    if (gap === 1) slots.push(pages[i] - 1)
    else if (gap > 1) slots.push('gap')
    slots.push(pages[i])
  }
  return slots
}

// A page number read from the address bar: a stranger's typo, "0", "-3", "abc"
// or "9999" all land on a page that exists instead of an empty screen.
export function clampPage(raw: string | undefined, total: number): number {
  return Math.min(Math.max(1, total), Math.max(1, Math.trunc(Number(raw)) || 1))
}
