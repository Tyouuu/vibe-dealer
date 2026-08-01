import { SIM_TYPE_LABEL, type SimStockType } from '@/lib/sim-stock'

// The parts this page is now built from, rather than the five generic ones
// (heading, hero figure, list, chart, table) every page was assembled from.
//
// There is exactly one bar idiom here and it appears twice: once for the
// whole shelf, once per pool. Segments are drawn at their true share, so a
// shelf that is 98% unsold looks 98% unsold. That is the honest picture of
// this business right now and the counts beside it carry the exact figures —
// padding a 1.8% segment up to a visible minimum would draw a number that
// isn't true.

type BarProps = {
  /** Sold and already shipped. */
  sent: number
  /** Sold but still sitting here waiting to go out. */
  pending: number
  /** Everything ever bought into this pool. */
  total: number
}

export function StockBar({ sent, pending, total }: BarProps) {
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0)
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-ink-700">
      <span style={{ width: `${pct(sent)}%`, background: 'var(--color-jade-bright)' }} />
      <span style={{ width: `${pct(pending)}%`, background: 'var(--color-brass-bright)' }} />
    </div>
  )
}

// One pool. Not a card — you only read it. The bar is the same one the shelf
// above uses, so a pool that is draining fills in visibly against two that
// are not, which three bare numbers could never show.
export function Pool({
  simType,
  available,
  intake,
  sold,
  sent,
  pending,
  low,
}: {
  simType: SimStockType
  available: number
  intake: number
  sold: number
  sent: number
  pending: number
  low: boolean
}) {
  return (
    <div>
      <p className="text-[12px] text-paper-dim">{SIM_TYPE_LABEL[simType]}</p>
      <p
        className="figure mt-1.5 text-[22px] font-semibold leading-none text-paper"
        style={available <= 0 ? { color: 'var(--color-clay-bright)' } : low ? { color: 'var(--color-brass-bright)' } : undefined}
      >
        {available.toLocaleString()}
      </p>
      {/* Capped. Left to fill a 490px column three near-empty tracks read as
          three horizontal rules across the page rather than as gauges. */}
      <div className="mt-3 max-w-[220px]">
        <StockBar sent={sent} pending={pending} total={intake} />
      </div>
      <p className="mt-2 text-[12px] text-paper-dim">
        {intake.toLocaleString()} in · {sold.toLocaleString()} sold
      </p>
    </div>
  )
}

// One heading for every band on this page: name on the left, the figures
// that describe the band on the right. Buying and selling get an arrow,
// because the thing that separates those two sections is direction — money
// out and stock up, against money in and stock down — and the page ran the
// identical list-plus-form layout twice in a row with nothing saying so.
//
// The arrow stays uncoloured. Jade and brass mean sent and pending
// everywhere else on this page, so a jade "Stock out" would read as a status
// rather than a heading. Direction is the whole message; it needs no hue.
export function BandHeading({
  arrow,
  title,
  sub,
  facts,
}: {
  arrow?: 'in' | 'out'
  title: string
  sub?: string
  facts?: string[]
}) {
  // Title and figures stack rather than sitting at opposite ends of the row.
  // Pushed apart by justify-between across a 1,137px band they read as two
  // unrelated things with a void between them; stacked they read as a
  // heading and its caption, which is what every other band in this app
  // already does.
  return (
    <div className="mb-5">
      <div className="flex items-baseline gap-2.5">
        {arrow && (
          <span aria-hidden="true" className="text-[13px] text-paper-dim">
            {arrow === 'in' ? '↓' : '↑'}
          </span>
        )}
        <h2 className="text-sm font-semibold text-paper">{title}</h2>
        {sub && <span className="text-[13px] text-paper-dim">{sub}</span>}
      </div>
      {facts && facts.length > 0 && <p className="mt-1 text-[12px] text-paper-dim">{facts.join(' · ')}</p>}
    </div>
  )
}
