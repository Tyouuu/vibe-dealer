// Which dealers were sold to most recently, and what they bought.
//
// This feeds the "Recent:" shortcuts on the entry form and the prefill behind
// them. It is a small thing to have its own file, and it is here because of
// what happened without it.
//
// The page took the newest 500 transactions and kept the first row per dealer,
// including corrections. LastTxInfo declares `type: 'package' | 'topup'`, so
// that read as safe — but the rows come back from PostgREST untyped, so
// `t.type` was a plain string and `'adjustment'` went straight into a field
// whose type says it cannot be. The declaration was a claim nobody checked.
//
// What it cost: clicking a dealer whose newest row was a correction set the
// form's type to 'adjustment'. Neither Type button lights up for that, because
// the form only offers two, and the hidden input carries it to the server,
// which answers "Please select a transaction type." The dealer cannot be sold
// to through their own shortcut until someone works out that the fix is to
// press a button that already looks pressed.
//
// So the rule is not "cope with adjustments" — it is that an adjustment was
// never a sale. Nobody repeats a correction. It should not make a dealer
// recent and it has nothing to prefill.

export type Sale = {
  type: 'package' | 'topup'
  package: string | null
  points: number
  money_rm: number
}

/** A transaction row as PostgREST hands it over: no generated types, so no promises. */
export type RawTxRow = {
  dealer_id: string
  type: string
  package: string | null
  points: number | string
  money_rm: number | string
}

export type LastSales = {
  /** Dealer id -> the last thing they actually bought. */
  byDealer: Record<string, Sale>
  /** Dealer ids, most recently sold to first. */
  recentIds: string[]
}

/**
 * @param rows newest first — the caller's ordering is trusted, and is the only
 *   thing that makes "last" mean anything here.
 */
export function buildLastSales(rows: RawTxRow[]): LastSales {
  const byDealer: Record<string, Sale> = {}
  const recentIds: string[] = []

  for (const t of rows) {
    // Narrowing and the business rule are the same line, deliberately: the
    // only types worth remembering are the two the form can offer back.
    if (t.type !== 'topup' && t.type !== 'package') continue
    if (byDealer[t.dealer_id]) continue

    byDealer[t.dealer_id] = {
      type: t.type,
      package: t.package,
      points: Number(t.points),
      money_rm: Number(t.money_rm),
    }
    recentIds.push(t.dealer_id)
  }

  return { byDealer, recentIds }
}
