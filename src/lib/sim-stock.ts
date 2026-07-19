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

export type SimStockType = 'physical' | 'esim' | 'esim_no_number'

export const SIM_STOCK_TYPES: SimStockType[] = ['physical', 'esim', 'esim_no_number']

export function isSimStockType(value: string): value is SimStockType {
  return (SIM_STOCK_TYPES as string[]).includes(value)
}

export const SIM_TYPE_LABEL: Record<SimStockType, string> = {
  physical: 'Physical SIM',
  esim: 'eSIM',
  esim_no_number: 'eSIM (No Number)',
}

export const SIM_TYPE_PILL_CLASS: Record<SimStockType, string> = {
  physical: 'pill-slate',
  esim: 'pill-jade',
  esim_no_number: 'pill-info',
}

// Physical is the only type with a real shipment (shipping fee/invoice,
// mark-as-sent). Both eSIM variants activate via a code instead — a data-
// only eSIM still needs a QR/activation code, it just isn't bound to a
// phone number the way regular eSIM is.
export function isPhysicalSimType(simType: SimStockType): boolean {
  return simType === 'physical'
}
