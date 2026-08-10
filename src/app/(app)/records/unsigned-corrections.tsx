import { VerifyButton } from './verify-button'
import { Avatar } from '../avatar'
import { formatMYR } from '@/lib/money'
import { PENDING_REVIEW_STALE_DAYS } from '@/lib/dealer-activity'

export type UnsignedCorrection = {
  id: string
  dealerName: string
  points: number
  moneyRm: number
  note: string | null
  postedByName: string
  daysWaiting: number
  /** True when the viewer posted it — they can still sign it, with a prompt. */
  postedByYou: boolean
}

// Corrections nobody has signed off yet.
//
// This band existed because the maker-checker rule made these unsignable by
// the one person likely to be looking at them, so they piled up. 0043 dropped
// that rule and the band still earns its place, for the reason underneath it:
// a pending correction counts toward nothing, so reports and reconciliation
// keep showing the *old, wrong* figure while the fix waits, looking for all
// the world like it was dealt with. That is the same shape as a variance going
// quiet on /reconcile, and it gets the same answer — put it where someone will
// walk past it.
//
// Not scoped to the month/status/dealer filters above. An unsigned correction
// is outstanding work regardless of what you happened to be filtering for, and
// filtering it out of view is exactly how it goes unnoticed.
export function UnsignedCorrections({ items }: { items: UnsignedCorrection[] }) {
  if (!items.length) return null

  const oldest = Math.max(...items.map((i) => i.daysWaiting))

  return (
    <div className="page-band">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-paper">
          {items.length} correction{items.length === 1 ? '' : 's'} not signed off yet
        </h2>
        {oldest >= PENDING_REVIEW_STALE_DAYS && (
          <span className="text-[12px] text-paper-dim">
            oldest waiting {oldest} day{oldest === 1 ? '' : 's'}
          </span>
        )}
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-paper-dim">
        Until a correction is signed off, reports and reconciliation still show the figure it was meant to correct.
      </p>

      <ul className="mt-4 flex flex-col">
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-ink-800 py-3">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <Avatar name={item.dealerName} size={24} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="truncate text-[13px] font-semibold text-paper">{item.dealerName}</span>
                  {/* Signed, always: a correction's whole content is which
                      way and by how much, and an unsigned "300 pts" reads as
                      an addition when it may well be a deduction. */}
                  <span className="figure-points text-[13px] font-semibold text-paper">
                    {item.points > 0 ? '+' : ''}
                    {item.points.toLocaleString()} pts
                  </span>
                  <span className="figure-money text-[12px] text-paper-dim">
                    {item.moneyRm > 0 ? '+' : ''}
                    {formatMYR(item.moneyRm)}
                  </span>
                </div>
                {/* · between the reason and who wrote it, not an em dash.
                    Reasons are prose and routinely contain an em dash of
                    their own ("overcharged RM47 — refunded by transfer"),
                    which made the attribution read as a third clause of the
                    sentence rather than a separate fact about it. */}
                {/* One string, used for both the line and its title. They
                    were built separately and the title carried only the
                    reason, so on a phone the attribution was cut off and
                    hovering could not bring it back — 63% of this line lost
                    at 390px, measured against a correction whose reason runs
                    to a real sentence rather than a test fixture's two words. */}
                {(() => {
                  const line = `${item.note ?? 'No reason recorded'} · ${item.postedByName}, ${
                    item.daysWaiting === 0 ? 'today' : `${item.daysWaiting} day${item.daysWaiting === 1 ? '' : 's'} ago`
                  }`
                  return (
                    <p className="truncate text-[12px] text-paper-dim" title={line}>
                      {line}
                    </p>
                  )
                })()}
              </div>
            </div>

            {/* The same component the table row uses, so there is one verify
                path rather than two that can drift. */}
            <VerifyButton transactionId={item.id} isSelfRecorded={item.postedByYou} isAdjustment />
          </li>
        ))}
      </ul>
    </div>
  )
}
