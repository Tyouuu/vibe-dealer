import { VerifyButton } from './verify-button'
import { Avatar } from '../avatar'
import { formatMYR } from '@/lib/money'
import { PENDING_REVIEW_STALE_DAYS } from '@/lib/dealer-activity'

export type AwaitingItem = {
  id: string
  dealerName: string
  points: number
  moneyRm: number
  note: string | null
  postedByName: string
  daysWaiting: number
  /** False when the viewer posted it — the whole point is that they can't. */
  canVerify: boolean
}

// Corrections that nobody has been able to sign off yet.
//
// The maker-checker rule means the accountant who posts a correction cannot
// verify it — a second person has to. With one accountant on the ledger, that
// second person is the master, and the master is not the one sitting in the
// records page all day. So the correction sits at pending, and the failure is
// silent in the worst possible way: a pending row counts toward nothing, so
// reports and reconciliation keep showing the *old, wrong* figure while the
// correction that would fix it waits, looking for all the world like it was
// dealt with. That is the same shape as a variance going quiet on /reconcile,
// and it gets the same answer — put it where someone will walk past it.
//
// Not scoped to the month/status/dealer filters above. An unsigned correction
// is outstanding work regardless of what you happened to be filtering for, and
// filtering it out of view is exactly how it goes unnoticed.
export function AwaitingSecondCheck({ items }: { items: AwaitingItem[] }) {
  if (!items.length) return null

  const mine = items.filter((i) => !i.canVerify).length
  const actionable = items.length - mine
  const oldest = Math.max(...items.map((i) => i.daysWaiting))

  return (
    <div className="page-band">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-paper">
          {items.length} correction{items.length === 1 ? '' : 's'} waiting for a second check
        </h2>
        <span className="text-[12px] text-paper-dim">
          {actionable > 0 ? `${actionable} you can sign off` : 'none you can sign off'}
          {oldest >= PENDING_REVIEW_STALE_DAYS && ` · oldest waiting ${oldest} day${oldest === 1 ? '' : 's'}`}
        </span>
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-paper-dim">
        Whoever posts a correction cannot sign it off themselves. Until a second person does, reports and
        reconciliation still show the figure it was meant to correct.
      </p>

      <ul className="mt-4 flex flex-col">
        {items.map((item) => {
          const stale = item.daysWaiting >= PENDING_REVIEW_STALE_DAYS
          return (
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
                  <p className="truncate text-[12px] text-paper-dim" title={item.note ?? undefined}>
                    {item.note ?? 'No reason recorded'} · {item.postedByName},{' '}
                    {item.daysWaiting === 0 ? 'today' : `${item.daysWaiting} day${item.daysWaiting === 1 ? '' : 's'} ago`}
                  </p>
                </div>
              </div>

              {item.canVerify ? (
                // The same component the table row uses, so there is one verify
                // path rather than two that can drift. isSelfRecorded is false
                // by construction here — canVerify is that same test.
                <VerifyButton transactionId={item.id} isSelfRecorded={false} isAdjustment />
              ) : (
                <span className={`text-[12px] font-semibold ${stale ? 'text-clay-bright' : 'text-paper-dim'}`}>
                  Waiting on someone else
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
