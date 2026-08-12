// One column rhythm for the logs that share a page.
//
// SIM Card Stock stacks two of these — stock in from Vibe, stock out to a
// dealer — and they were built as separate CSS grids with separately chosen
// widths: Date 84px against 72px, Qty 60px against 44px, three different money
// widths, and SIM Type on `max-content` so it sized itself to whichever
// table's longest label happened to be. Nothing lined up, and it showed.
//
// They hold different data, so their columns cannot all match; the order
// differs and always will. What can match is every column they share and every
// column of the same kind, which is what these are.
//
// A TypeScript constant rather than CSS custom properties: both tables are
// components, so the values belong where the templates are built. The first
// attempt put them in a class in globals.css and the templates read them with
// var() — the properties resolved to nothing, `grid-template-columns` became
// invalid, and both grids silently collapsed to a single auto column. Measured
// rather than assumed: the intake grid computed to one 1136px column.
// Cell padding is written on the elements as `px-3 py-3.5`, not as a class in
// globals.css. Two attempts to put shared values in a hand-written rule inside
// @layer components — first these widths as custom properties, then a
// `.log-cell` padding class — were both silently dropped from the emitted
// stylesheet, and both times the page looked subtly wrong rather than broken.
// The 12px matters: `.th` has it and the data cells did not, so every column
// heading sat 12px right of the values under it.
export const LOG_COL = {
  /* 108, not 84. The cells gained the same 12px padding the headers always
     had (see .log-cell), and "7 Aug 2026" does not fit 84px minus 24. */
  date: '108px',
  /** A fixed width, not max-content, or the two tables disagree by a label. */
  sim: '168px',
  qty: '64px',
  /** Every money column in both tables, so the figures share a right edge. */
  money: '108px',
  status: '104px',
  person: '148px',
  /** Free text. Wide enough to be worth reading, not wide enough to own the row. */
  note: '220px',
  /* 32, not 20. Cells on these grids carry px-3 — 24px of padding before any
     glyph — so a 20px track was always 4-6px too narrow for its own cell. The
     trailing 1fr spacer used to swallow that; with the spacer gone the grid
     overflowed its band by 6px and one of the page's three tables scrolled
     sideways while the others did not. The name column is the 1fr now, so
     these 12px come out of it and nothing else moves. */
  chevron: '32px',
} as const

/**
 * Retired. Slack used to be parked in an empty trailing column so it could
 * never distort a data column — defensible in isolation, but it drew an empty
 * plank down the right of every log: 140px on Stock in, 44px on Stock out,
 * measured at 1440px. Beside a full-width table on the same page the client
 * read it, correctly, as the tables not being finished.
 *
 * Slack now goes to the one column on each table that genuinely wants it —
 * free text on Stock in, the dealer name on Stock out, both of which truncate
 * today. Widening a fixed data column would still be wrong; widening the
 * column that holds a sentence is just giving it room.
 */
export const LOG_COL_SPACER = 'minmax(0,1fr)'

/** Note, taking whatever is left rather than a spacer beside it. */
export const LOG_COL_NOTE_FLEX = 'minmax(220px,1fr)'

/**
 * The dealer-name column on Stock out, same idea — but with a 0 floor, not a
 * 140px one. At minmax(140px,1fr) the row could not shrink below the sum of
 * its fixed columns plus that floor, so the grid overflowed its band by 6px
 * and design-audit reported one of the page's three tables scrolling sideways
 * while the others did not. The name cell truncates and carries a title, so
 * letting it give way is the correct behaviour rather than a compromise.
 */
export const LOG_COL_NAME_FLEX = 'minmax(0,1fr)'
