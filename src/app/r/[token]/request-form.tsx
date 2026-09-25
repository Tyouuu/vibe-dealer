'use client'

import { useRef, useState } from 'react'
import { PACKAGES, type PackageCode } from '@/lib/packages'
import { PACKAGE_SIM_CARDS } from '@/lib/sim-stock'
import { ACCEPT_ATTR } from '@/lib/vision-extract'
import { submitRequest } from './actions'
import { IconUpload } from '../../(app)/icons'
import { isUnusuallyHigh } from '@/lib/amount-plausibility'
import { compareSlipForDealer, joinWords, slipDateUsable, type DealerSlipReading } from '@/lib/slip-extract'

// Written for a phone, held one-handed, by someone who has used this once
// before. Every control is full-width and thumb-sized, and there is one
// decision per row.
//
// Three things have changed it since it was first written:
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
//
//   * The slip comes first, and it fills the rest. Every figure on this form
//     used to be typed, so a wrong one was a typo nobody could see until staff
//     compared it with a bank statement a day later. The transfer slip already
//     says the amount, the date and the bank — so attaching it now reads those
//     off and puts them in, and if what the dealer then types disagrees with
//     the slip, they are told on the spot, while they can still fix it. A
//     dealer with no slip fills it in by hand exactly as before; nothing here
//     is ever required.
export function RequestForm({
  token,
  rate,
  today,
  typicalAmountRm,
  usualAmountsRm,
}: {
  token: string
  /** The dealer's own rate, or the flat rate every dealer gets when no package is on file. */
  rate: number
  /** Today in Malaysia, from the server. Not the phone's clock, which can be
      anything, and this field decides which month a sale lands in. */
  today: string
  /** This dealer's own median verified top-up, or null under a 3-transaction
      minimum sample. Powers the "a lot more than usual" nudge below — see
      lib/amount-plausibility.ts. */
  typicalAmountRm: number | null
  /** The few amounts this dealer has actually had verified before, most
      often sent first — one tap each, so the commonest top-ups are never typed. */
  usualAmountsRm: number[]
}) {
  const [type, setType] = useState<'topup' | 'package'>('topup')
  const [money, setMoney] = useState('')
  const [pkg, setPkg] = useState<PackageCode>('A')
  const [simType, setSimType] = useState<'physical' | 'esim'>('physical')
  const [transferDate, setTransferDate] = useState(today)
  const [paidFrom, setPaidFrom] = useState('')
  const [slipName, setSlipName] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Made once when the form opens and sent with every attempt: the same key is the same request, however many
  // times a shaky connection makes the dealer press Send (0059).
  const [clientKey] = useState(() => crypto.randomUUID())

  // A slip may only fill what the dealer has not chosen themselves — once they type, it stops arguing and only
  // compares.
  const [moneyTouched, setMoneyTouched] = useState(false)
  const [dateTouched, setDateTouched] = useState(false)
  const [paidFromTouched, setPaidFromTouched] = useState(false)
  const [reading, setReading] = useState<
    | { status: 'idle' }
    | { status: 'reading' }
    | { status: 'done'; reading: DealerSlipReading; filled: string[] }
    | { status: 'failed'; message: string }
  >({ status: 'idle' })
  const latestRead = useRef(0)

  const amount = Number(money)
  const points = rate != null && Number.isFinite(amount) && amount > 0 ? Math.round(amount / (1 - rate / 100)) : null
  // A nudge, not a block — a dealer having a genuinely big month is still
  // allowed to send it in one press. Named after the number they typed
  // rather than "your usual", so it reads as a fact they can check against
  // their own memory of what they just transferred.
  const looksHigh = type === 'topup' && isUnusuallyHigh(amount, typicalAmountRm)

  // What the slip says against what the dealer has entered right now, recomputed as they type — so fixing the
  // amount clears the warning and a wrong one raises it.
  const claimedAmount = type === 'package' ? PACKAGES[pkg].price : amount > 0 ? amount : null
  const warnings =
    reading.status === 'done' ? compareSlipForDealer({ amountRm: claimedAmount, date: transferDate }, reading.reading.slip, today) : []

  async function onSlipChosen(file: File | null) {
    setSlipName(file?.name ?? null)
    const mine = ++latestRead.current
    if (!file) {
      setReading({ status: 'idle' })
      return
    }
    setReading({ status: 'reading' })
    try {
      const body = new FormData()
      body.set('file', file)
      const res = await fetch(`/r/${encodeURIComponent(token)}/read`, { method: 'POST', body })
      const json = (await res.json().catch(() => ({}))) as Partial<DealerSlipReading> & { error?: string }
      if (mine !== latestRead.current) return
      if (!res.ok || !json.slip) {
        // Not a dead end: the form works without the reading, and says so.
        setReading({ status: 'failed', message: json.error ?? "We couldn't read that picture — please type the amount." })
        return
      }
      const { slip } = json as DealerSlipReading
      const filled: string[] = []
      // A package's price is fixed, so for a package the amount is compared, never filled.
      if (type === 'topup' && slip.amount_rm != null && slip.amount_rm > 0 && !moneyTouched) {
        setMoney(String(slip.amount_rm))
        filled.push('the amount')
      }
      if (!dateTouched && slipDateUsable(slip.paid_on, today) && slip.paid_on !== transferDate) {
        setTransferDate(slip.paid_on)
        filled.push('the date')
      }
      if (!paidFromTouched && !paidFrom.trim() && (slip.bank || slip.reference)) {
        setPaidFrom([slip.bank, slip.reference ? `ref ${slip.reference}` : null].filter(Boolean).join(', ').slice(0, 120))
        filled.push('the bank')
      }
      setReading({ status: 'done', reading: { slip, alreadySent: Boolean(json.alreadySent) }, filled })
    } catch {
      if (mine === latestRead.current) setReading({ status: 'failed', message: "We couldn't read that picture — please type the amount." })
    }
  }

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
      <input type="hidden" name="client_key" value={clientKey} />

      <div>
        <h2 className="text-[14px] font-semibold text-paper">What would you like?</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Choice active={type === 'topup'} onClick={() => setType('topup')} label="Top up credit" />
          <Choice active={type === 'package'} onClick={() => setType('package')} label="Buy a package" />
        </div>
      </div>

      {/* First, because everything below can be filled from it. Optional: a
          dealer without a slip skips straight past. */}
      <div>
        <span className="field-label">
          Your transfer slip <span className="font-normal text-paper-dim">(recommended)</span>
        </span>
        <label className="upload-box">
          <IconUpload />
          <span className={slipName ? 'truncate' : 'min-w-0 text-left'}>{slipName ?? 'Attach a photo of the transfer'}</span>
          <input
            type="file"
            name="slip"
            accept={ACCEPT_ATTR}
            className="hidden"
            onChange={(e) => void onSlipChosen(e.target.files?.[0] ?? null)}
          />
        </label>

        <div aria-live="polite">
          {reading.status === 'idle' && (
            <p className="mt-2 text-[12px] text-paper-dim">
              We read the amount and date off it for you, so there&apos;s less to type. We check the bank either way.
            </p>
          )}
          {reading.status === 'reading' && <p className="mt-2 text-[12px] text-paper-dim">Reading your slip…</p>}
          {reading.status === 'failed' && <p className="mt-2 text-[12px] text-paper-dim">{reading.message}</p>}
          {reading.status === 'done' && (
            <div className="mt-2 rounded-xl border border-ink-800 bg-ink-850 px-3.5 py-3 text-[13px]">
              <p className="font-semibold text-paper">
                {reading.reading.slip.amount_rm != null || reading.reading.slip.paid_on || reading.reading.slip.bank
                  ? [
                      reading.reading.slip.amount_rm != null ? `RM ${reading.reading.slip.amount_rm.toLocaleString('en-MY', { minimumFractionDigits: 2 })}` : null,
                      reading.reading.slip.paid_on
                        ? new Date(`${reading.reading.slip.paid_on}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' })
                        : null,
                      reading.reading.slip.bank,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : "We couldn't make out the details"}
              </p>
              <p className="mt-1 text-[12px] text-paper-dim">
                {reading.filled.length > 0
                  ? `Filled in ${joinWords(reading.filled)} below — please check ${reading.filled.length === 1 ? 'it is' : 'they are'} right.`
                  : "We couldn't read the amount, so please type it below."}
              </p>
              {warnings.map((w) => (
                <p key={w} className="mt-2 text-[12px] font-semibold text-clay-bright">
                  {w}
                </p>
              ))}
              {reading.reading.alreadySent && (
                <p className="mt-2 text-[12px] font-semibold text-brass-bright">
                  This looks like a slip you&apos;ve already sent. Check &ldquo;Your recent requests&rdquo; below before sending it again.
                </p>
              )}
            </div>
          )}
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
              onChange={(e) => {
                setMoney(e.target.value)
                setMoneyTouched(true)
              }}
              placeholder="500.00"
              className="field-input pl-11 text-[16px]"
            />
          </div>
          {/* The commonest top-ups this dealer has actually made, one tap each. A generic list of round numbers
              would suggest amounts they have never sent; these are theirs. */}
          {usualAmountsRm.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className="text-[12px] text-paper-dim">Your usual:</span>
              {usualAmountsRm.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => {
                    setMoney(String(a))
                    setMoneyTouched(true)
                  }}
                  aria-pressed={amount === a}
                  className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold tabular-nums transition-colors ${
                    amount === a ? 'border-paper bg-ink-850 text-paper' : 'border-ink-800 text-paper hover:border-paper'
                  }`}
                >
                  RM {a.toLocaleString('en-MY')}
                </button>
              ))}
            </div>
          )}
          {/* Every dealer is on the same flat 6% whether or not a package is on file, so the estimate is always
              shown. A dealer used to be told "we'll confirm your rate" — true of nothing, and a reason to
              wonder whether they would be credited at all. The request is still only a claim; staff check the
              bank before anything is recorded. */}
          <p className="mt-2 text-[12px] text-paper-dim">
            {points
              ? `That works out to about ${points.toLocaleString()} points at your rate.`
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
          onChange={(e) => {
            setTransferDate(e.target.value)
            setDateTouched(true)
          }}
          className="field-input text-[16px]"
        />
      </div>

      {/* One free-text line rather than a bank dropdown and a reference field.
          A dealer copies whatever their banking app showed them, and two boxes
          with strict shapes is two boxes left empty. Filled from the slip when
          there is one. */}
      <div>
        <label className="field-label" htmlFor="paid_from">
          Which bank, and any reference? <span className="font-normal text-paper-dim">(optional)</span>
        </label>
        <input
          id="paid_from"
          name="paid_from"
          type="text"
          maxLength={120}
          value={paidFrom}
          onChange={(e) => {
            setPaidFrom(e.target.value)
            setPaidFromTouched(true)
          }}
          placeholder="e.g. Maybank 3:15pm, ref 5512"
          className="field-input text-[16px]"
        />
        <p className="mt-2 text-[12px] text-paper-dim">This is what lets us find your payment in the statement quickly.</p>
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
