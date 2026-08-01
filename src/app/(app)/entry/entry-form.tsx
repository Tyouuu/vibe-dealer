'use client'

import { Field } from '../field'

import { useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PACKAGES, COMMISSION_RATE, COUPON_DENOMINATION_RM, type PackageCode } from '@/lib/packages'
import { createTransaction } from './actions'
import { IconCoin, IconUpload, IconChevronDown } from '../icons'
import { Avatar } from '../avatar'
import { Combobox } from '../combobox'
import { Listbox } from '../listbox'
import { DatePicker } from '../date-picker'
import { Modal } from '../modal'
import { formatMYR } from '@/lib/money'

// Mirrors /api/reconcile/extract's limits — this upload previously had none
// at all, client-side or bucket-level, unlike the OCR route which validates
// both. Client-side check here is a fast-fail UX nicety only; the bucket's
// own file_size_limit/allowed_mime_types (0019) is the real backstop.
const RECEIPT_MAX_BYTES = 10 * 1024 * 1024
const RECEIPT_ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

type DealerOption = {
  id: string
  company_name: string
  package: PackageCode | null
  rate: number | null
}

export type LastTxInfo = {
  type: 'package' | 'topup'
  package: string | null
  points: number
  money_rm: number
}

export function EntryForm({
  dealers,
  initialDealerId,
  recentDealers = [],
  lastTxByDealer = {},
  availableBalance,
  today,
}: {
  dealers: DealerOption[]
  initialDealerId?: string
  recentDealers?: { id: string; company_name: string }[]
  lastTxByDealer?: Record<string, LastTxInfo>
  availableBalance: number
  today: string
}) {
  const formRef = useRef<HTMLFormElement>(null)
  // Generated once per form mount, sent with every submit attempt — a
  // network retry or double-click before this component unmounts resubmits
  // the same key, which the DB's unique index (0020) turns into a harmless
  // no-op instead of a second, duplicate transaction.
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  const [dealerId, setDealerId] = useState(
    initialDealerId && dealers.some((d) => d.id === initialDealerId) ? initialDealerId : ''
  )
  // Defaults to today (server-computed, Malaysia time — not the browser's
  // own clock/timezone) but editable, for the common case of recording a
  // sale that actually happened a day or few earlier (dealer paid via
  // WhatsApp/bank transfer, receipt only gets keyed in once someone's caught
  // up on the backlog).
  const [txDate, setTxDate] = useState(today)
  const [type, setType] = useState<'topup' | 'package'>('topup')
  const [pkg, setPkg] = useState<PackageCode>('A')
  const [moneyCollected, setMoneyCollected] = useState('')
  const [pointsOverride, setPointsOverride] = useState('')
  const [couponRm, setCouponRm] = useState('')
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingFormData, setPendingFormData] = useState<FormData | null>(null)

  const dealer = dealers.find((d) => d.id === dealerId)

  // Same dealer's last transaction, suggested as an editable starting point —
  // confirming a pre-filled value beats retyping the same amount every time.
  function selectDealer(id: string) {
    setDealerId(id)
    const last = lastTxByDealer[id]
    if (!last) return
    setType(last.type)
    if (last.type === 'topup') {
      setMoneyCollected(String(last.money_rm))
    } else if (last.package) {
      setPkg(last.package as PackageCode)
    }
  }

  // Dealers hand over real money, not a points figure — RM collected is the
  // number CS actually has in hand, so it drives the calculation. Points is
  // derived from it (still editable, for the rare case the dealer and CS
  // agree on a specific points figure directly).
  const preview = useMemo(() => {
    if (type === 'package') {
      const def = PACKAGES[pkg]
      return { points: def.reload, rate: def.rate, money: def.price, commission: Math.round(def.reload * COMMISSION_RATE * 100) / 100 }
    }
    const rate = dealer?.rate ?? null
    const collected = Number(moneyCollected) || 0
    if (rate == null) return null
    const suggestedPoints = Math.round(collected / (1 - rate / 100))
    const pts = pointsOverride ? Number(pointsOverride) : suggestedPoints
    return { points: pts, rate, money: collected, commission: Math.round(pts * COMMISSION_RATE * 100) / 100 }
  }, [type, pkg, dealer, moneyCollected, pointsOverride])

  const insufficientBalance = preview != null && preview.points > availableBalance
  // Checked live (not just on submit) — typing past the amount collected
  // used to give no feedback at all until Submit, so a CS entering 2500
  // collected could type 10000 into Coupon Amount and see nothing wrong
  // until the form rejected the whole submission.
  const couponAmount = Number(couponRm) || 0
  const couponExceedsMoney = type === 'topup' && couponAmount > 0 && couponAmount > (Number(moneyCollected) || 0)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (!dealerId) {
      setError('Please select a dealer.')
      return
    }
    if (!txDate) {
      setError('Please enter a date.')
      return
    }
    if (txDate > today) {
      setError('Date cannot be in the future.')
      return
    }
    if (type === 'topup' && dealer?.rate == null) {
      setError('This dealer has no package/rate yet — buy them a package first.')
      return
    }
    if (insufficientBalance) {
      setError('Not enough credit balance for this amount — log a Credit Purchase first.')
      return
    }
    if (type === 'topup' && couponRm) {
      const couponAmount = Number(couponRm)
      if (!Number.isFinite(couponAmount) || couponAmount < 0 || couponAmount % COUPON_DENOMINATION_RM !== 0) {
        setError(`Coupon amount must be a multiple of RM${COUPON_DENOMINATION_RM}.`)
        return
      }
      if (couponAmount > (Number(moneyCollected) || 0)) {
        setError('Coupon amount cannot exceed the total amount collected.')
        return
      }
    }

    // Validation passed — confirm the summary before actually committing a
    // financial record, rather than posting straight from the form. doSubmit
    // runs the real upload + createTransaction once the modal is confirmed.
    setPendingFormData(new FormData(e.currentTarget))
    setConfirmOpen(true)
  }

  async function doSubmit() {
    if (!pendingFormData) return
    setConfirmOpen(false)
    setSubmitting(true)

    const formData = pendingFormData

    if (receiptFile) {
      setUploading(true)
      const supabase = createClient()
      const path = `${dealerId}/${Date.now()}-${receiptFile.name}`
      const { error: uploadError } = await supabase.storage.from('receipts').upload(path, receiptFile)
      setUploading(false)
      if (uploadError) {
        setError('Receipt upload failed: ' + uploadError.message)
        setSubmitting(false)
        return
      }
      formData.set('receipt_url', path)
    }

    try {
      await createTransaction(formData)
    } finally {
      // Reached only on a server-side validation failure — createTransaction
      // redirects back to this same route (/entry?error=...), so the router
      // reuses this component instance instead of unmounting it. Without this,
      // submitting stays true forever and the Submit button is stuck disabled.
      // On success it redirects to /records instead, unmounting this component,
      // so this call is a harmless no-op in that case.
      setSubmitting(false)
    }
  }

  // One column. This was a 1.3fr form beside a 1fr card that measured
  // 485x942px and, until a dealer was picked, said "Select a dealer first." —
  // a third of the page reserved for something that cannot exist yet. NN/g's
  // sixth guideline for complex applications is to "show options to the user
  // only when they are relevant"; without a dealer there is no rate, so the
  // amount fields compute nothing and the totals have nothing to total.
  return (
    <div className="flex w-full flex-col gap-5">
      <div className="app-card">

        {error && <div className="alert alert-bad">{error}</div>}

        <form ref={formRef} id="entry-form" onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <input type="hidden" name="idempotency_key" value={idempotencyKey} />
          {recentDealers.length > 0 && !dealerId && (
            <div className="-mb-1 flex flex-wrap items-center gap-1.5">
              <span className="text-[12px] font-semibold text-paper-dim">Recent:</span>
              {recentDealers.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => selectDealer(d.id)}
                  className="rounded-full border border-ink-800 bg-ink-900 px-2.5 py-1 text-[12px] font-semibold text-paper transition-colors hover:border-primary hover:text-primary"
                >
                  {d.company_name}
                </button>
              ))}
            </div>
          )}

          {dealerId && dealer ? (
            /* Collapsed to a one-line summary with a Change affordance once
               chosen — the same GOV.UK check-answers move Reconciliation uses
               for the statement. Leaving the full picker open implies the
               step is still outstanding. */
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-800 bg-ink-850/50 px-3.5 py-3">
              <span className="flex min-w-0 items-center gap-2.5">
                <Avatar name={dealer.company_name} size={28} />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-paper">{dealer.company_name}</span>
                  <span className="block text-[12px] text-paper-dim">
                    {dealer.package ? `Package ${dealer.package} · ${dealer.rate}% rate` : 'No package or rate yet'}
                  </span>
                </span>
              </span>
              <button
                type="button"
                onClick={() => selectDealer('')}
                className="shrink-0 text-[12px] font-semibold text-primary-deep hover:underline"
              >
                Change
              </button>
              <input type="hidden" name="dealer_id" value={dealerId} />
            </div>
          ) : (
          <div>
            <label className="field-label">Dealer</label>
            <Combobox
              name="dealer_id"
              value={dealerId}
              onChange={selectDealer}
              placeholder="Select a dealer…"
              searchPlaceholder="Search dealer…"
              options={dealers.map((d) => ({
                value: d.id,
                label: d.company_name,
                sublabel: d.package ? `Package ${d.package} · ${d.rate}%` : 'No package',
                avatarName: d.company_name,
              }))}
            />
          </div>
          )}

          <div className="form-grid">
            <div>
              <label className="field-label">Type</label>
              <input type="hidden" name="type" value={type} />
              <div className="segmented w-full">
                <button
                  type="button"
                  onClick={() => setType('topup')}
                  className={`segmented-btn flex-1 ${type === 'topup' ? 'active' : ''}`}
                >
                  Regular Top-up
                </button>
                <button
                  type="button"
                  onClick={() => setType('package')}
                  className={`segmented-btn flex-1 ${type === 'package' ? 'active' : ''}`}
                >
                  Buy Package
                </button>
              </div>
            </div>

            <div>
              <label className="field-label">Date</label>
              <DatePicker name="tx_date" value={txDate} onChange={setTxDate} max={today} todayIso={today} required />
              <span className="hint">When the sale actually happened, not when you&apos;re entering it.</span>
            </div>
          </div>

          <div className="form-section-head">
            <span className="tile">
              <IconCoin />
            </span>
            <span>Amount</span>
            <span className="rule" />
          </div>
          {type === 'package' ? (
            <div className="form-grid">
              <div>
                <label className="field-label">Package</label>
                <Listbox
                  name="package"
                  value={pkg}
                  onChange={(v) => setPkg(v as PackageCode)}
                  options={(Object.keys(PACKAGES) as PackageCode[]).map((code) => ({
                    value: code,
                    label: `${PACKAGES[code].name} · RM${PACKAGES[code].price} · ${PACKAGES[code].rate}%`,
                  }))}
                />
              </div>
              <div>
                <label className="field-label">SIM type</label>
                <Listbox
                  name="sim_type"
                  defaultValue="esim"
                  options={[
                    { value: 'esim', label: 'eSIM (instant)' },
                    { value: 'physical', label: 'Physical SIM (needs delivery)' },
                  ]}
                />
              </div>
            </div>
          ) : (
            <div className="form-grid">
              <div>
                <label className="field-label">Amount collected (RM)</label>
                <input
                  name="money_rm"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={moneyCollected}
                  onChange={(e) => setMoneyCollected(e.target.value)}
                  placeholder="e.g. 799"
                  required
                  className="field-input"
                />
              </div>
              <div>
                <label className="field-label">Top-up value (points)</label>
                <input
                  name="points"
                  type="number"
                  min="1"
                  value={pointsOverride}
                  onChange={(e) => setPointsOverride(e.target.value)}
                  placeholder={preview ? String(preview.points) : 'Auto-calculated from rate, editable'}
                  className="field-input"
                />
                <span className="hint">Auto-calculated from rate — editable.</span>
              </div>
              <div className="sm:col-span-2">
                <label className="field-label">Coupon amount (RM, optional)</label>
                <input
                  name="coupon_rm"
                  type="number"
                  step={COUPON_DENOMINATION_RM}
                  min="0"
                  max={moneyCollected || undefined}
                  value={couponRm}
                  onChange={(e) => setCouponRm(e.target.value)}
                  placeholder="0"
                  className={`field-input ${couponExceedsMoney ? 'border-clay-bright' : ''}`}
                />
                <span className={`hint ${couponExceedsMoney ? 'font-semibold text-clay-bright' : ''}`}>
                  {couponExceedsMoney
                    ? `Can't exceed the ${formatMYR((Number(moneyCollected) || 0))} collected above.`
                    : `Portion of the amount above issued as RM${COUPON_DENOMINATION_RM} coupons instead of straight to the dealer's phone — leave blank if this whole top-up is direct.`}
                </span>
              </div>
            </div>
          )}



          {/* The answer, at the size of an answer. It was a row in a
              six-line table in the other column, so the figure the page
              exists to produce was the same size as the amount just typed.
              Wise puts the converted figure immediately under the amount and
              at display size for exactly this reason.

              Two of those six rows also repeated what was already on screen:
              "Amount Collected" is the number in the field above it, and
              "Rate" is in the dealer row at the top. They stay in the
              breakdown, not in front of the reader twice. */}
          {preview ? (
            <div className="mt-3 rounded-xl border border-ink-800 bg-ink-850/50 p-4">
              <div className="flex items-baseline justify-between gap-3">
                <div className="text-[12px] font-medium text-paper-dim">
                  {type === 'package' ? 'Package value' : 'Top-up value'}
                </div>
                <span className="live-badge">
                  <span className="live-dot" />
                  Live
                </span>
              </div>
              <div
                className={`figure-points mt-1 text-[34px] font-semibold leading-none ${
                  insufficientBalance ? 'text-clay-bright' : 'text-paper'
                }`}
              >
                {preview.points.toLocaleString()} pts
              </div>
              <p className="mt-2 text-[13px] text-paper-dim">
                {insufficientBalance
                  ? `Only ${availableBalance.toLocaleString()} pts of credit left — this is ${(preview.points - availableBalance).toLocaleString()} pts over. Log a credit purchase first.`
                  : `${formatMYR(preview.money)} in at ${preview.rate}% — you earn ${formatMYR(preview.commission)}. ${(availableBalance - preview.points).toLocaleString()} pts of credit left after this.`}
              </p>

              <details className="group mt-3 border-t border-ink-800 pt-3">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[12px] font-semibold text-paper-dim hover:text-paper">
                  <IconChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
                  Full breakdown
                </summary>
                <div className="mt-2 flex flex-col text-sm">
                  <Row label="Amount collected" value={`${formatMYR(preview.money)}`} unit="money" />
                  <Row label="Rate" value={`${preview.rate}%`} />
                  {type === 'topup' && couponAmount > 0 && (
                    <Row
                      label="Coupons"
                      value={`${couponAmount / COUPON_DENOMINATION_RM} × RM${COUPON_DENOMINATION_RM}`}
                      warn={couponExceedsMoney}
                    />
                  )}
                  <Row label="Your 2%" value={`${formatMYR(preview.commission)}`} unit="money" bold highlight />
                  <Row label="Credit balance" value={`${availableBalance.toLocaleString()} pts`} unit="points" warn={insufficientBalance} />
                </div>
              </details>
            </div>
          ) : dealer && !dealer.rate ? (
            <p className="mt-3 text-[13px] text-brass-bright">
              This dealer has no package or rate yet — buy them a package first.
            </p>
          ) : null}
          {/* Folded. NN/g: disclose up front what people frequently need so the
              secondary display is reached only on rare occasions. Both fields
              are labelled optional by the product itself, and across the
              transactions on record a receipt appears on none and a note on
              roughly one in ten. One level only, never nested, and the label
              names what is inside rather than saying "More" so the
              progression carries information scent. */}
          <details className="group mt-2">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[12px] font-semibold text-paper-dim hover:text-paper">
              <IconChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
              Add a receipt or note
            </summary>
          <div className="form-grid mt-3">
            <div>
              <label className="field-label">Receipt (optional)</label>
              <label className="upload-box">
                <IconUpload />
                <span className="truncate">{receiptFile ? receiptFile.name : 'Click to upload receipt image'}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null
                    if (file && !RECEIPT_ALLOWED_TYPES.has(file.type)) {
                      setError('Please upload a JPEG, PNG, WEBP, or GIF image.')
                      e.target.value = ''
                      return
                    }
                    if (file && file.size > RECEIPT_MAX_BYTES) {
                      setError('Image is too large (max 10MB).')
                      e.target.value = ''
                      return
                    }
                    setReceiptFile(file)
                  }}
                  className="hidden"
                />
              </label>
            </div>
            <Field label="Note (optional)">
              {(id) => <textarea id={id} name="note" rows={2} className="field-input resize-none" />}
            </Field>
          </div>
          </details>
          {/* The submit lived in the right-hand card, above the live totals.
              Someone filling this form works top-to-bottom down the left
              column, so on reaching the last field the action was off in
              another column and above the eye line. Polaris puts a single
              primary action in the page header, but that only works when the
              header is sticky — ours scrolls away on a form this long, so the
              action goes where the reader actually arrives: the end of the
              form. The oversell block stays with it, because it is the reason
              the button can refuse. */}
          <div className="mt-5 border-t border-ink-800 pt-4">
            {insufficientBalance && (
              <div className="alert alert-bad">
                Not enough credit balance — {availableBalance.toLocaleString()} pts available, this needs{' '}
                {preview!.points.toLocaleString()} pts. Log a credit purchase first.
              </div>
            )}
            <button
              type="submit"
              disabled={uploading || submitting || insufficientBalance || couponExceedsMoney}
              className="btn-primary disabled:opacity-60"
            >
              {uploading ? 'Uploading receipt…' : 'Submit for verification'}
            </button>
          </div>
        </form>
      </div>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <p className="text-sm font-bold text-paper">Confirm this transaction</p>
        {preview && (
          <div className="mt-3 flex flex-col text-sm">
            <Row label="Dealer" value={dealer?.company_name ?? '—'} />
            <Row label="Type" value={type === 'package' ? `Buy Package ${pkg}` : 'Regular Top-up'} />
            <Row label="Amount Collected" value={`${formatMYR(preview.money)}`} unit="money" />
            <Row label={type === 'package' ? 'Package Value' : 'Top-up Value'} value={`${preview.points.toLocaleString()} pts`} unit="points" />
            <Row label="Your 2%" value={`${formatMYR(preview.commission)}`} unit="money" bold highlight />
          </div>
        )}
        <p className="mt-3 text-[12px] text-paper-dim">Goes in as pending — an accountant still needs to verify it.</p>
        <div className="mt-4 flex items-center gap-2">
          <button type="button" onClick={() => setConfirmOpen(false)} className="btn-ghost flex-1">
            Back
          </button>
          <button type="button" onClick={doSubmit} disabled={uploading || submitting} className="btn-primary flex-1">
            {uploading ? 'Uploading receipt…' : submitting ? 'Saving…' : 'Confirm & Submit'}
          </button>
        </div>
      </Modal>
    </div>
  )
}

function Row({
  label,
  value,
  unit,
  bold,
  highlight,
  warn,
}: {
  label: string
  value: string
  unit?: 'money' | 'points'
  bold?: boolean
  highlight?: boolean
  warn?: boolean
}) {
  const valueStyle = unit === 'money' ? 'figure-money' : unit === 'points' ? 'figure-points' : 'text-paper'
  return (
    <div className={`docket-row ${highlight ? '-mx-3 rounded-lg bg-primary-soft px-3' : ''} ${warn ? '-mx-3 rounded-lg bg-clay/10 px-3' : ''}`}>
      <span className={`${highlight ? 'font-semibold text-paper' : 'text-paper-dim'} ${warn ? 'font-semibold text-clay-bright' : ''}`}>
        {label}
      </span>
      <b className={`${valueStyle} ${bold ? 'text-base' : ''} ${highlight ? 'text-primary-deep' : ''} ${warn ? 'text-clay-bright' : ''}`}>
        {value}
      </b>
    </div>
  )
}
