import Link from 'next/link'

export type FilterChip = {
  /** What kind of filter this is — "Search", "Region", "Status". */
  label: string
  /** The value being filtered on. */
  value: string
  /** Where to go to remove just this one. */
  removeHref: string
}

// Shows what is currently narrowing a list, and lets each one be removed
// individually.
//
// The filters were already in the URL — which is the hard part, and is what
// makes a filtered view shareable — but nothing on screen said a filter was
// active. A list showing 3 of 249 rows looked identical to a list that only
// had 3 rows, and the only way back was to edit the URL or reload the page.
// Linear renders active filters as chips with per-chip removal plus a
// clear-all; this is that, minus the operator editing they need for nested
// boolean groups and this app does not.
export function FilterChips({ chips, clearAllHref }: { chips: FilterChip[]; clearAllHref: string }) {
  if (!chips.length) return null

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-medium uppercase tracking-wide text-paper-dim">Filtered by</span>
      {chips.map((chip) => (
        <Link
          key={`${chip.label}-${chip.value}`}
          href={chip.removeHref}
          // The whole chip is the remove target, not just the ×. A 10px glyph
          // is under every documented minimum touch size, and there's nothing
          // else a click on an active filter chip could sensibly mean.
          className="group inline-flex items-center gap-1.5 rounded-md border border-ink-800 bg-ink-850 py-1 pl-2.5 pr-2 text-[12px] font-medium text-paper transition-colors hover:border-ink-700 hover:bg-ink-800"
          title={`Remove ${chip.label.toLowerCase()} filter`}
        >
          <span className="text-paper-dim">{chip.label}:</span>
          <span className="max-w-[180px] truncate">{chip.value}</span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            className="h-3 w-3 text-paper-dim transition-colors group-hover:text-paper"
            aria-hidden="true"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </Link>
      ))}
      {chips.length > 1 && (
        <Link href={clearAllHref} className="ml-0.5 text-[12px] font-medium text-paper-dim underline-offset-2 hover:text-paper hover:underline">
          Clear all
        </Link>
      )}
    </div>
  )
}
