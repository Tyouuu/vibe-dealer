// SIM card wholesale pricing — Vibe Mobile sells to the master dealer at a
// flat per-unit cost; the master dealer resells to its own dealers at a flat
// markup. A box of SIM cards from Vibe Mobile is 250 units — that's just a
// convenient intake-entry unit, not enforced anywhere (intake quantity is a
// raw unit count). These mirror the constants baked into migration 0024's
// create_sim_order() — kept here only for rendering the same numbers in the
// UI, not as the source of truth (the DB function stamps the real values).
export const SIM_UNIT_COST_RM = 2
export const SIM_SELL_PRICE_RM = 3.5
export const SIM_MARGIN_RM = SIM_SELL_PRICE_RM - SIM_UNIT_COST_RM
export const SIM_MIN_ORDER_QTY = 10
export const SIM_BOX_SIZE = 250

// Two physical variants (with/without a bound phone number) plus eSIM —
// three fully separate stock pools, same pricing/min-order rule for all
// three (see migration 0027).
export type SimStockType = 'physical' | 'physical_no_number' | 'esim'

export const SIM_STOCK_TYPES: SimStockType[] = ['physical', 'physical_no_number', 'esim']

export function isSimStockType(value: string): value is SimStockType {
  return (SIM_STOCK_TYPES as string[]).includes(value)
}

export const SIM_TYPE_LABEL: Record<SimStockType, string> = {
  physical: 'Physical SIM (With Number)',
  physical_no_number: 'Physical SIM (No Number)',
  esim: 'eSIM',
}

export const SIM_TYPE_PILL_CLASS: Record<SimStockType, string> = {
  physical: 'pill-slate',
  physical_no_number: 'pill-info',
  esim: 'pill-jade',
}

// Both physical variants have a real shipment (shipping fee/invoice, mark-
// as-sent) — only eSIM has nothing to ship and takes a code instead.
export function isPhysicalSimType(simType: SimStockType): boolean {
  return simType === 'physical' || simType === 'physical_no_number'
}
