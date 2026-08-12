// StockBar and Pool used to live here — a segmented bar drawn once for the
// whole shelf and once per pool, with each pool's figure at 22px above it.
//
// Both are gone. The three pool figures summed to the 38px headline directly
// above them, so the card stated one fact twice at two sizes, and the bars
// were carrying a sent/pending split that the pool table now shows as two
// plain columns. Three columns of figures could also only ever hold three
// pools; rows take a fourth without the layout moving.
//
// The bars are not missed. At 100 sent and 45 pending out of 950 they drew
// two slivers of 10.5% and 4.7% — honest proportions, and honestly almost
// nothing to see. The numbers were always doing the work.

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
