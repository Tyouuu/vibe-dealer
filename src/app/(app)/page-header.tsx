import Link from 'next/link'

// The page's identity zone: title, a one-line summary of scale, and the one
// action this page is for. It sits on the page background, OUTSIDE the card
// that holds the data.
//
// That placement is the whole point. Every page here used to open the
// .app-card and put the <h1> inside it, so the page title rendered at the
// same elevation as a table row — a white box containing "where am I", the
// toolbar and the data all at once. The border then wasn't grouping anything;
// it was just an outline drawn around the entire page. Linear, Stripe and
// Vercel all keep the header on the page surface and give a container only to
// the content, which is what produces the "you are here / here is the data"
// split this app had no way to express.
//
// The action slot also gives primary actions somewhere to live. Onboard Dealer
// and New Transaction existed only as sidebar links, so no page could offer
// its own obvious next step.
export function PageHeader({
  title,
  subtitle,
  meta,
  action,
}: {
  title: string
  /** One line on the scale of what's below — "249 dealers · 44 regions". */
  subtitle?: string
  /** Small trailing element beside the title, e.g. a read-only badge. */
  meta?: React.ReactNode
  action?: { href: string; label: string } | React.ReactNode
}) {
  const actionNode =
    action && typeof action === 'object' && 'href' in action ? (
      <Link href={action.href} className="btn-primary shrink-0">
        {action.label}
      </Link>
    ) : (
      action
    )

  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h1 className="page-title flex items-center gap-2.5">
          {title}
          {meta}
        </h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actionNode}
    </div>
  )
}
