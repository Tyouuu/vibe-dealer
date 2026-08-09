// Postgres error text is for whoever wrote the constraint, not for whoever
// tripped it. Nine Server Actions were passing `error.message` straight into a
// redirect query string, so a lost race on the credit-balance trigger (0016)
// put this on screen:
//
//   insufficient_credit_balance: 21501 pts available, 30000 pts requested
//
// Two places already did this properly and separately: entry/records translate
// the period-lock error (0031) via period-lock.ts, and createSimOrder rewrites
// its own insufficient_sim_stock prefix inline. This is the same idea for
// everything else, in one place, so a new action gets it for free.
//
// Anything unrecognised becomes a generic line rather than the raw text: an
// unknown database error is by definition one nobody has written a human
// sentence for yet, and leaking constraint and column names to guess from is
// worse than saying less.

type Rule = { match: RegExp; message: (m: RegExpMatchArray) => string }

const RULES: Rule[] = [
  {
    // Raised by enforce_credit_balance (0016) when a concurrent sale wins the
    // advisory lock — the app-layer check passed, then the balance moved.
    match: /insufficient_credit_balance:\s*([\d.]+) pts available,\s*([\d.]+) pts requested/,
    message: (m) =>
      `Not enough credit balance: ${Number(m[1]).toLocaleString()} pts available, this needs ${Number(m[2]).toLocaleString()} pts. Log a Credit Purchase first.`,
  },
  {
    // create_sim_order (0024).
    match: /insufficient_sim_stock:\s*(.+)$/,
    message: (m) => `Not enough stock — ${m[1]}`,
  },
  {
    // 23505. The one the operator can act on is a duplicate dealer name; the
    // rest are internal and get the generic line below.
    match: /duplicate key value.*dealers_company_name/i,
    message: () => 'A dealer with that name already exists.',
  },
  {
    // 0016's unique index: one pending correction per transaction, so a second
    // one cannot be stacked on top while the first is unresolved. Reaching the
    // generic line was worse than saying nothing — it ended in "please try
    // again", which fails identically every time, and it hid the only fact
    // that gets the person unstuck: there is already a correction waiting,
    // and it is theirs to verify or flag.
    match: /duplicate key value.*idx_one_pending_adjustment_per_original/i,
    message: () =>
      'This transaction already has a correction waiting to be verified. Verify or flag that one first — a second correction cannot be posted on top of it.',
  },
  {
    match: /violates row-level security policy/i,
    message: () => 'You do not have permission to do that.',
  },
  {
    match: /violates foreign key constraint/i,
    message: () => 'That record refers to something that no longer exists — reload the page and try again.',
  },
  {
    match: /invalid input syntax for type (date|timestamp)/i,
    message: () => 'That date could not be read. Please pick it again.',
  },
  {
    match: /invalid input syntax for type numeric/i,
    message: () => 'One of the amounts could not be read as a number.',
  },
]

export function friendlyDbError(raw: string | null | undefined): string {
  const text = String(raw ?? '')
  for (const rule of RULES) {
    const m = text.match(rule.match)
    if (m) return rule.message(m)
  }
  return 'Something went wrong saving that. Nothing was changed — please try again.'
}
