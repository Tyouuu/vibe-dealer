// The correcting-entry math for adjustTransaction (records/actions.ts): the
// accountant enters what a transaction's points/money_rm should have been,
// and this computes the delta actually posted as the new linked adjustment
// row. Split out as its own pure function — no Supabase involved — so it's
// unit tested directly. See adjustment.test.ts.
//
// Rounds to 2dp to match money precision and avoid floating-point noise
// (e.g. 450 - 500.1 landing on -50.099999999999994 instead of -50.1).
export type AdjustmentDelta = { deltaPoints: number; deltaMoneyRm: number }

export function computeAdjustmentDelta(
  original: { points: number; money_rm: number },
  corrected: { points: number; money_rm: number }
): AdjustmentDelta {
  return {
    deltaPoints: Math.round((corrected.points - original.points) * 100) / 100,
    deltaMoneyRm: Math.round((corrected.money_rm - original.money_rm) * 100) / 100,
  }
}
