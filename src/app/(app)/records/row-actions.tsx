import { VerifyButton } from './verify-button'
import { FlagButton } from './flag-button'
import { AdjustButton } from './adjust-button'

// One shape for every row's Action cell.
//
// The complaint was that this column looked messy, and it was not the buttons
// themselves — it was that no two rows had the same geometry. A pending row
// carried two buttons of different widths, a verified row carried one wider
// one, a flagged row carried a dash, and the lot was right-aligned. So the
// right edges lined up and nothing else did: scanning down the column you saw
// a ragged left edge stepping in and out on every row.
//
// Now the cell is two fixed slots — a primary action and an overflow — and
// they are always both there, empty or not. Every row is the same rectangle,
// so the column reads as a column.
//
// Carbon's rule decides what goes where: keep actions inline while there are
// fewer than three, and put the rest behind an overflow. There are exactly
// two on a pending row, and they are not equals — Verify is the routine one
// and Flag is irreversible — so Verify takes the slot and Flag takes the menu.
const SLOT = 'w-[84px] shrink-0'

export function RowActions({
  transactionId,
  status,
  type,
  isSelfRecorded,
  points,
  moneyRm,
  rate,
}: {
  transactionId: string
  status: 'pending' | 'verified' | 'flagged'
  type: 'package' | 'topup' | 'adjustment'
  isSelfRecorded: boolean
  points: number
  moneyRm: number
  rate: number | null
}) {
  const canAdjust = status === 'verified' && type !== 'adjustment'

  return (
    <div className="flex items-center justify-end gap-1.5">
      <span className={SLOT}>
        {status === 'pending' ? (
          <VerifyButton transactionId={transactionId} isSelfRecorded={isSelfRecorded} isAdjustment={type === 'adjustment'} />
        ) : canAdjust ? (
          <AdjustButton transactionId={transactionId} currentPoints={points} currentMoneyRm={moneyRm} rate={rate} />
        ) : (
          // Not a dash. A dash is a value, and there is no value here — the
          // row simply has nothing left to do. The slot holds its width so the
          // rows above and below still line up.
          <span className="sr-only">No action available</span>
        )}
      </span>
      <span className="w-7 shrink-0">{status === 'pending' && <FlagButton transactionId={transactionId} />}</span>
    </div>
  )
}
