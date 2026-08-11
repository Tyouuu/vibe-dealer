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
  chevron: '20px',
} as const

/** Whatever is left over goes here, never into a data column. */
export const LOG_COL_SPACER = 'minmax(0,1fr)'
