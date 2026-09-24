// A delivery-queue row is either a package sale that carries a physical SIM
// ('sale') or a direct SIM card order ('order', 0052). Same queue, same Mark as
// sent — but they say different things in the "what is being sent" columns.
type QueueRow = { source?: string | null; package: string | null; quantity?: number | null; sim_type: string | null }

/** "Package C", or "10 SIM cards" for an order. */
export function deliveryWhat(row: Pick<QueueRow, 'source' | 'package' | 'quantity'>): string {
  if (row.source === 'order') {
    const n = row.quantity ?? 0
    return `${n.toLocaleString()} SIM card${n === 1 ? '' : 's'}`
  }
  return row.package ? `Package ${row.package}` : '—'
}

/**
 * Kept short on purpose: this sits in a pill, and the full "Physical SIM (No Number)"
 * wrapped inside its column and made every order row taller than the rows around it.
 * Only the rarer no-number card is called out; a plain physical SIM is the default.
 */
export function deliverySimLabel(row: Pick<QueueRow, 'source' | 'sim_type'>): string {
  if (row.sim_type === 'esim') return 'eSIM'
  if (row.source === 'order' && row.sim_type === 'physical_no_number') return 'No-number SIM'
  return 'Physical SIM'
}
