// The two-column "annotated" settings section: a short title + explanation on
// the left, the actual controls on the right.
//
// This exists to solve a specific layout problem. These pages are single-column
// and have to stay narrow — an email input stretched across 1000px reads as
// broken, and Baymard's field-width research is explicit that a field whose
// width doesn't match its expected content makes people doubt they understood
// the label. But a narrow column on a wide screen looks wrong either way:
// centred it reads as a floating box, left-aligned it leaves a third of the
// page visibly unclaimed.
//
// The fix isn't a width — it's giving the left side real content and letting
// the section divider span the full width. Shopify Polaris ships exactly this
// as its documented app-settings pattern (InlineGrid, columns 2fr/5fr), on the
// rationale that it "separates the 'understanding' from the 'configuring'" and
// lets someone scan headings to find the setting they want. Refactoring UI
// gives the same prescription: when something works best narrow but looks
// unbalanced wide, split it into columns rather than stretching it.
//
// Collapses to one column below lg. Polaris collapses at 768px of *container*
// width; with this app's 248px rail, the content region reaches 768px at
// roughly a 1016px viewport, so lg (1024px) is the closest honest breakpoint.
//
// The controls column is deliberately NOT width-capped here. Callers cap
// individual field grids where a narrow field is correct (a phone number in a
// 500px box looks wrong), but capping the whole column left a dead gutter down
// the right of every form — which is exactly what the client noticed on
// Onboard Dealer.
export function AnnotatedSection({
  icon,
  title,
  description,
  children,
}: {
  icon?: React.ReactNode
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="grid grid-cols-1 gap-x-10 gap-y-4 border-t border-ink-800 pt-7 first:border-t-0 first:pt-0 lg:grid-cols-[2fr_5fr]">
      <div className="lg:max-w-xs">
        <h2 className="flex items-center gap-2.5 text-[13px] font-semibold text-paper">
          {icon && <span className="section-icon">{icon}</span>}
          {title}
        </h2>
        {/* Kept to 1-3 sentences and never a restatement of the title, per
            Polaris's own guidance for this pattern. */}
        <p className="mt-2 text-[12px] leading-[1.6] text-paper-dim">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}
