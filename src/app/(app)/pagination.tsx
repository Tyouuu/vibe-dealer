import Link from 'next/link'
import { ALL_PAGES_UP_TO, pageWindow } from '@/lib/pagination'

// One pager for every list. It used to be six hand-copied Previous / Next pairs,
// so a list of 8 pages meant seven clicks to reach the last one. Numbered pages
// and a "Go to" box work as plain links and a plain GET form — no client code —
// and every other filter in the address stays put because the form carries it.
export function Pagination({
  page,
  totalPages,
  hrefFor,
  param = 'page',
  summary,
}: {
  page: number
  totalPages: number
  /** The address of a given page, with every other filter already in it. */
  hrefFor: (page: number) => string
  /** The query parameter that carries the page number. */
  param?: string
  /** Left-hand text. Defaults to "Page X of Y". */
  summary?: string
}) {
  if (totalPages <= 1) return null

  // A jump box only earns its room once some pages are hidden behind an ellipsis;
  // below that every page is already a button.
  const slots = pageWindow(page, totalPages)
  const canJump = totalPages > ALL_PAGES_UP_TO

  const first = new URL(hrefFor(1), 'http://local')
  const carried = [...first.searchParams.entries()].filter(([key]) => key !== param)

  return (
    <nav
      aria-label="Pagination"
      className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ink-800 pt-3"
    >
      <span className="text-[12px] text-paper-dim">{summary ?? `Page ${page} of ${totalPages}`}</span>
      <div className="flex flex-wrap items-center gap-2">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className="btn-ghost py-1.5 text-xs">
            Previous
          </Link>
        ) : (
          // A genuinely disabled control, not a dimmed span: axe exempts disabled
          // form controls from the contrast rule and does not exempt faded text.
          <button type="button" disabled className="btn-ghost py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40">
            Previous
          </button>
        )}

        <ul className="flex items-center gap-0.5">
          {slots.map((slot, i) =>
            slot === 'gap' ? (
              <li key={`gap-${i}`} aria-hidden="true" className="px-1 text-xs text-paper-dim">
                …
              </li>
            ) : (
              <li key={slot}>
                {slot === page ? (
                  <span
                    aria-current="page"
                    className="inline-flex min-h-[32px] min-w-[32px] items-center justify-center rounded-md border border-ink-800 bg-ink-850 px-2 text-xs font-semibold tabular-nums text-paper"
                  >
                    {slot}
                  </span>
                ) : (
                  <Link
                    href={hrefFor(slot)}
                    aria-label={`Page ${slot}`}
                    className="inline-flex min-h-[32px] min-w-[32px] items-center justify-center rounded-md px-2 text-xs font-semibold tabular-nums text-paper-dim transition-colors hover:bg-ink-850 hover:text-paper"
                  >
                    {slot}
                  </Link>
                )}
              </li>
            )
          )}
        </ul>

        {page < totalPages ? (
          <Link href={hrefFor(page + 1)} className="btn-ghost py-1.5 text-xs">
            Next
          </Link>
        ) : (
          <button type="button" disabled className="btn-ghost py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40">
            Next
          </button>
        )}

        {canJump && (
          <form action={first.pathname + first.hash} method="GET" className="flex items-center gap-1.5">
            {carried.map(([key, value], i) => (
              <input key={`${key}-${i}`} type="hidden" name={key} value={value} />
            ))}
            <label className="flex items-center gap-1.5 text-[12px] text-paper-dim">
              Go to
              <input
                type="number"
                inputMode="numeric"
                name={param}
                min={1}
                max={totalPages}
                required
                placeholder={String(page)}
                aria-label={`Go to page, 1 to ${totalPages}`}
                className="w-16 rounded-lg border border-ink-800 bg-ink-900 px-2 py-1.5 text-center text-xs tabular-nums text-paper outline-none transition-colors focus:border-primary"
              />
            </label>
            <button type="submit" className="btn-ghost py-1.5 text-xs">
              Go
            </button>
          </form>
        )}
      </div>
    </nav>
  )
}
