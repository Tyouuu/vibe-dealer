'use client'

import { useState } from 'react'
import { PACKAGES, type PackageCode } from '@/lib/packages'
import { PACKAGE_SIM_CARDS } from '@/lib/sim-stock'
import { ACCEPT_ATTR } from '@/lib/vision-extract'
import { submitRequest } from './actions'
import { IconUpload } from '../../(app)/icons'
import { isUnusuallyHigh } from '@/lib/amount-plausibility'

// Written for a phone, held one-handed, by someone who has used this once
// before. Every control is full-width and thumb-sized, and there is one
// decision per row.
//
// Two things changed after the owner used it:
//
//   * Topping up is what dealers do. Buying a package happens once, when they
//     join. So a top-up is the first choice and the default, and a dealer with
//     no package on file is no longer shown a packages-only form — see the
//     comment on `rate` below.
//
//   * It collects enough to be recorded. The first version asked for an amount
//     and nothing else, so accepting one still meant working out which date it
//     belonged to and messaging the dealer to ask which bank it came from. The
//     date, the bank line and the SIM type are all things the dealer already
//     knows and staff had to chase.
export function RequestForm({
  token,
  rate,
  today,
  typicalAmountRm,
}: {
  token: string
  /** null when no package is on file — see below. */
  rate: number | null
  /** Today in Malaysia, from the server. Not the phone's clock, which can be
      anything, and this field decides which month a sale lands in. */
  today: string
  /** This dealer's own median verified top-up, or null under a 3-transaction
      minimum sample. Powers the "a lot more than usual" nudge below — see
      lib/amount-plausibility.ts. */
  typicalAmountRm: number | null
}) {
  const [type, setType] = useState<'topup' | 'package'>('topup')
  const [money, setMoney] = useState('')
  const [pkg, setPkg] = useState<PackageCode>('A')
  const [simType, setSimType] = useState<'physical' | 'esim'>('physical')
  const [transferDate, setTransferDate] = useState(today)
  const [slipName, setSlipName] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const amount = Number(money)
  const points = rate != null && Number.isFinite(amount) && amount > 0 ? Math.round(amount / (1 - rate / 100)) : null
  // A nudge, not a block — a dealer having a genuinely big month is still
  // allowed to send it in one press. Named after the number they typed
  // rather than "your usual", so it reads as a fact they can check against
  // their own memory of what they just transferred.
  const looksHigh = type === 'topup' && isUnusuallyHigh(amount, typicalAmountRm)

  return (
    <form
      action={async (formData) => {
        setSubmitting(true)
        try {
          await submitRequest(formData)
        } finally {
          setSubmitting(false)
        }
      }}
      className="app-card mt-4 flex flex-col gap-5 p-6"
    >
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="type" value={type} />

      <div>
        <h2 className="text-[14px] font-semibold text-paper">What would you like?</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Choice active={type === 'topup'} onClick={() => setType('topup')} label="Top up credit" />
          <Choice active={type === 'package'} onClick={() => setType('package')} label="Buy a package" />
        </div>
      </div>

      {type === 'topup' ? (
        <div>
          <label className="field-label" htmlFor="money_rm">
            How much did you transfer?
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[14px] font-semibold text-paper-dim">
              RM
            </span>
            <input
              id="money_rm"
              name="money_rm"
              type="number"
              inputMode="decimal"
              min="1"
              step="0.01"
              required
              value={money}
              onChange={(e) => setMoney(e.target.value)}
              placeholder="500.00"
              className="field-input pl-11 text-[16px]"
            />
          </div>
          {/* Three states, and the third is the one that matters. A dealer with
              no package on file used to be refused outright here: no rate, no
              way to price the points, so the top-up option was hidden and the
              form said to buy a package instead. But 233 dealers are in that
              state because nobody has recorded what they bought, not because
              they have bought nothing — the gap is in our records, and turning
              a paying dealer away over it is the wrong side to fail on. The
              request is only a claim; whoever accepts it sets the rate then. */}
          <p className="mt-2 text-[12px] text-paper-dim">
            {points
              ? `That works out to about ${points.toLocaleString()} points at your rate.`
              : rate == null
                ? "We'll confirm your rate and work out the points before we credit you."
                : "We'll work out the points from your rate once you enter the amount."}
          </p>
          {looksHigh && (
            <p className="mt-2 text-[12px] font-medium text-brass-bright">
              That&apos;s a lot more than your usual top-up — worth a quick check before sending.
            </p>
          )}
        </div>
      ) : (
        <>
          <div>
            <span className="field-label">Which package?</span>
            <div className="flex flex-col gap-2">
              {(Object.keys(PACKAGES) as PackageCode[]).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setPkg(code)}
                  aria-pressed={pkg === code}
                  className={`flex flex-wrap items-baseline justify-between gap-x-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                    pkg === code ? 'border-paper bg-ink-850' : 'border-ink-800 hover:border-paper'
                  }`}
                >
                  <span className="text-[14px] font-semibold text-paper">{PACKAGES[code].name}</span>
                  <span className="text-[13px] tabular-nums text-paper-dim">
                    RM{PACKAGES[code].price} · {PACKAGES[code].reload} pts
                  </span>
                  {/* What actually turns up in the shop. The points are the
                      part a dealer can already see on their own account; the
                      cards are the part they have to ask about. */}
                  <span className="w-full text-[12px] text-paper-dim">
                    includes {PACKAGE_SIM_CARDS[code]} SIM cards
                  </span>
                </button>
              ))}
            </div>
            <input type="hidden" name="package" value={pkg} />
          </div>

          {/* Asked here because the dealer is the only person who knows, and
              because it decides whether anything gets posted to them at all.
              It went on the transaction as a staff guess before. */}
          <div>
            <span className="field-label">Physical cards or eSIM?</span>
            <div className="grid grid-cols-2 gap-2">
              <Choice active={simType === 'physical'} onClick={() => setSimType('physical')} label="Physical cards" />
              <Choice active={simType === 'esim'} onClick={() => setSimType('esim')} label="eSIM" />
            </div>
            <input type="hidden" name="sim_type" value={simType} />
          </div>
        </>
      )}

      {/* The date the money moved, not the date this form was filled in. A
          sale belongs to the month it happened in — that is what reports and
          the monthly reconciliation against Vibe are built on — and someone
          settling Friday's transfer on Monday would otherwise put it in the
          wrong week without ever being asked. */}
      <div>
        <label className="field-label" htmlFor="transfer_date">
          When did you transfer?
        </label>
        <input
          id="transfer_date"
          name="transfer_date"
          type="date"
          required
          max={today}
          value={transferDate}
          onChange={(e) => setTransferDate(e.target.value)}
          className="field-input text-[16px]"
        />
      </div>

      {/* One free-text line rather than a bank dropdown and a reference field.
          A dealer copies whatever their banking app showed them, and two boxes
          with strict shapes is two boxes left empty. */}
      <div>
        <label className="field-label" htmlFor="paid_from">
          Which bank, and any reference? <span className="font-normal text-paper-dim">(optional)</span>
        </label>
        <input
          id="paid_from"
          name="paid_from"
          type="text"
          maxLength={120}
          placeholder="e.g. Maybank 3:15pm, ref 5512"
          className="field-input text-[16px]"
        />
        <p className="mt-2 text-[12px] text-paper-dim">This is what lets us find your payment in the statement quickly.</p>
      </div>

      <div>
        <span className="field-label">
          Payment slip <span className="font-normal text-paper-dim">(optional)</span>
        </span>
        <label className="upload-box">
          <IconUpload />
          <span className={slipName ? 'truncate' : 'min-w-0 text-left'}>{slipName ?? 'Attach a photo of the transfer'}</span>
          <input
            type="file"
            name="slip"
            accept={ACCEPT_ATTR}
            className="hidden"
            onChange={(e) => setSlipName(e.target.files?.[0]?.name ?? null)}
          />
        </label>
        {/* Said plainly, because a dealer who thinks the slip is what gets
            them credited will wait for the wrong thing. */}
        <p className="mt-2 text-[12px] text-paper-dim">We check the bank either way — this just helps us find it faster.</p>
      </div>

      {/* Last, and still optional. Everything worth having a box of its own now
          has one, so this is for the case none of them cover. */}
      <div>
        <label className="field-label" htmlFor="note">
          Anything else we should know? <span className="font-normal text-paper-dim">(optional)</span>
        </label>
        <textarea
          id="note"
          name="note"
          rows={2}
          maxLength={500}
          placeholder="e.g. this one is for my second shop"
          className="field-input resize-none"
        />
      </div>

      <button type="submit" disabled={submitting} className="btn-primary w-full py-3 text-[14px]">
        {submitting ? 'Sending…' : 'Send request'}
      </button>
    </form>
  )
}

function Choice({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-xl border px-3 py-3 text-[14px] font-semibold transition-colors ${
        active ? 'border-paper bg-ink-850 text-paper' : 'border-ink-800 text-paper-dim hover:border-paper hover:text-paper'
      }`}
    >
      {label}
    </button>
  )
}
