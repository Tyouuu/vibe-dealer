// Which columns a table is currently showing, and how that survives a reload.
//
// The two big tables kept getting wider — /records is at eleven columns and
// /dealers just gained a ninth — and the answer to "what happens when we add
// another one" cannot be "it gets wider again". So the table stops being the
// place every column has to fit and becomes the place the columns you asked
// for fit. Adding a column later makes this list longer, not the table.
//
// State lives in a cookie rather than localStorage on purpose. These pages are
// server-rendered; a cookie is readable during that render, so the very first
// HTML already has the right columns hidden. localStorage is only readable
// after hydration, which means a frame of the full-width table and then a jump.

export type ColumnSpec = {
  /** Matches the `data-c` attribute on the th and every td in that column. */
  key: string
  label: string
  /** Shown under the label in the menu — why this one is off by default. */
  hint?: string
  /** Off unless the reader turns it on. */
  hiddenByDefault?: boolean
}

export type TableId = 'records' | 'dealers'

// Columns absent from these lists are the ones that cannot be turned off:
// the dealer/company name, the status, and the action. A row you cannot
// identify, whose state you cannot see, or which you cannot act on is not a
// row worth rendering.
export const TABLE_COLUMNS: Record<TableId, ColumnSpec[]> = {
  records: [
    { key: 'date', label: 'Date' },
    { key: 'type', label: 'Type' },
    { key: 'in', label: 'In (RM)' },
    { key: 'out', label: 'Out (pts)' },
    // Flat 6% on every package since migration 0010, so this column has held
    // the same three characters on every row of every page since then.
    { key: 'rate', label: 'Rate', hint: 'the same 6% on every row', hiddenByDefault: true },
    { key: 'commission', label: 'Your 2%' },
    // Hidden by default so the frozen Action column stops sitting on top of
    // Status. Measured at 1440px: the table is 1187px inside a 1136px
    // viewport, so the sticky Action column parks at the right edge and
    // covers the last 51px of Status — every row read "Pendi" and "Verifi".
    // No column had any slack to give (each was already narrower than its
    // own content needs), so one had to go, and this is the one whose own
    // note below says the page is not where you act on it. Hiding it takes
    // the overflow to 0 and Status from 57px of 120 to 113px, both measured.
    { key: 'delivery', label: 'Delivery', hint: 'empty on top-ups and corrections — /delivery is where you act on it', hiddenByDefault: true },
  ],
  dealers: [
    { key: 'rank', label: 'Rank' },
    { key: 'region', label: 'Region' },
    // Both off by default, and the reason is measured rather than felt. At
    // 1440 the dealers table is 1407px inside a 1136px window, so Bought,
    // Top-up and Card earnings all sit off the right edge -- Card earnings
    // was already 142px out before Bought existed. Hiding any ONE column is
    // not enough (Contact alone leaves 62px over); two are needed, and these
    // are the two the page can spare. The row already carries a WhatsApp
    // button, so reaching a dealer is a tap rather than a column, and both
    // facts are on the dealer's own page and in the ⌘K palette. One click in
    // the Columns menu brings either back.
    { key: 'phone', label: 'Phone', hint: 'the row already has a WhatsApp button', hiddenByDefault: true },
    { key: 'contact', label: 'Contact', hint: 'on the dealer’s own page', hiddenByDefault: true },
    { key: 'package', label: 'Package' },
    // The tier a dealer holds and what they have actually bought are two
    // different facts, and the list used to show only the first. 305 of the
    // 344 dealers were given a package in bulk without buying one, so a
    // single letter could not stand for both -- and with the count invisible
    // the card-earnings column looked wrong: "A" beside RM 90.00 is three
    // Package As, and nothing on the row said so.
    { key: 'bought', label: 'Bought' },
    { key: 'rate', label: 'Rate', hint: 'the same 6% for every dealer with a package', hiddenByDefault: true },
    { key: 'topup', label: 'Top-up' },
    { key: 'cards', label: 'Card earnings' },
  ],
}

export const COLUMN_COOKIE_PREFIX = 'cols_'

/**
 * Bumped when a table's *defaults* change, and only then.
 *
 * parseHiddenColumns deliberately ignores hiddenByDefault the moment a cookie
 * exists — otherwise a column someone chose to reveal would hide itself again
 * on the next load. The cost is that a new default reaches nobody who has ever
 * opened the page, which is everybody. Marking Delivery hidden by default
 * would therefore have changed nothing for the three people who use this.
 *
 * So the name carries a version. Bumping it retires the old preference for
 * that one table and lets the new default apply; every other table keeps its
 * cookie. Costs a reader whatever they had toggled on /records, once.
 */
const COOKIE_VERSION: Record<TableId, number> = {
  records: 2, // v2: Delivery hidden by default — see the note on that column
  // v2: the Bought column. parseHiddenColumns ignores hiddenByDefault once a
  // cookie exists, and Bought is shown by default -- but a saved cookie from
  // v1 lists what was hidden then, so the new column would have appeared
  // anyway. The bump is here because the DEFAULT SET changed and the rule
  // above says that is when it bumps; it costs whoever had toggled a dealers
  // column whatever they had toggled, once.
  dealers: 2,
}

export function columnCookieName(table: TableId): string {
  const v = COOKIE_VERSION[table]
  return v > 1 ? `${COLUMN_COOKIE_PREFIX}${table}_v${v}` : `${COLUMN_COOKIE_PREFIX}${table}`
}

/**
 * The cookie stores what is HIDDEN, not what is shown, so a column added to
 * the app later appears for everyone rather than staying invisible to whoever
 * happened to save a preference before it existed.
 */
export function parseHiddenColumns(table: TableId, cookieValue: string | undefined): Set<string> {
  const known = new Set(TABLE_COLUMNS[table].map((c) => c.key))
  if (cookieValue == null) {
    return new Set(TABLE_COLUMNS[table].filter((c) => c.hiddenByDefault).map((c) => c.key))
  }
  // An empty cookie is a real answer — "I turned everything on" — and must not
  // fall back to the defaults, or a column the reader deliberately revealed
  // would hide itself again on the next page load.
  return new Set(
    cookieValue
      .split('.')
      .map((k) => k.trim())
      .filter((k) => known.has(k))
  )
}

export function serializeHiddenColumns(hidden: Iterable<string>): string {
  return [...hidden].join('.')
}

/**
 * The CSS that does the hiding. One rule per hidden column, scoped to the one
 * table, applied to the th and every cell carrying that key.
 *
 * Hiding in CSS rather than by not rendering the cells keeps the server markup
 * identical whatever the preference is, which means toggling a column is
 * instant and needs no round trip — and a `display: none` column in a
 * `table-fixed` layout gives its width back to the others, which is the whole
 * point.
 */
export function hiddenColumnCss(table: TableId, hidden: Iterable<string>): string {
  const keys = [...hidden]
  if (!keys.length) return ''
  return keys.map((k) => `#grid-${table} [data-c="${k}"]{display:none}`).join('')
}
