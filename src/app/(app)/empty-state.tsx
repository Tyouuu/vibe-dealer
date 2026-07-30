import Link from 'next/link'

// One empty state, three situations — the distinction is the point.
//
// Vercel Geist's rule: "no-results for filtered lists, blank slate for
// uncreated resources, cleared for completed work." Collapsing those is how
// you end up offering "Onboard your first dealer" to someone who has 249 and
// simply mistyped a search, or offering nothing to someone who genuinely has
// an empty table and needs a way forward.
//
//   variant="empty"    nothing has ever been created → offer the action
//   variant="filtered" the filter matched nothing     → offer Clear filters, never the create action
//   variant="cleared"  the work is done               → no action at all; a CTA here reads as a chore
//
// Two-part copy (title, then one short line explaining what would appear
// here) rather than a single sentence, and rendered OUTSIDE the table rather
// than in a colSpan cell — Geist is explicit that an empty list should not be
// an empty <tbody>, because a table with headers and no rows reads as broken
// rather than as empty.
export function EmptyState({
  variant,
  title,
  description,
  action,
  icon,
}: {
  variant: 'empty' | 'filtered' | 'cleared'
  title: string
  description?: string
  /** Ignored for `filtered` and `cleared` — see above. */
  action?: { href: string; label: string }
  icon?: React.ReactNode
}) {
  return (
    // aria-live so the result of an async filter is announced rather than
    // silently swapping the table out from under a screen reader.
    <div
      aria-live="polite"
      className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-ink-800 px-6 py-14 text-center"
    >
      {icon && <span className="mb-1 grid h-11 w-11 place-items-center rounded-full bg-ink-850 text-paper-dim">{icon}</span>}
      <p className="text-[15px] font-semibold text-paper">{title}</p>
      {description && <p className="max-w-sm text-[13px] leading-relaxed text-paper-dim">{description}</p>}
      {variant === 'empty' && action && (
        <Link href={action.href} className="btn-primary mt-3">
          {action.label}
        </Link>
      )}
      {variant === 'filtered' && action && (
        <Link href={action.href} className="btn-ghost mt-3 text-xs">
          {action.label}
        </Link>
      )}
    </div>
  )
}
