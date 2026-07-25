'use client'

import { useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PACKAGES, COMMISSION_RATE, COUPON_DENOMINATION_RM, type PackageCode } from '@/lib/packages'
import { createTransaction } from './actions'
import { IconDocument, IconCoin, IconPaperclip, IconUpload } from '../icons'
import { Combobox } from '../combobox'
import { Listbox } from '../listbox'

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

    setSubmitting(true)

    const formData = new FormData(e.currentTarget)

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

  return (
    <div className="grid gap-5 md:grid-cols-[1.3fr_1fr]">
      <div className="app-card">
        <h1 className="mb-4 text-[26px] font-extrabold tracking-tight text-paper">New Transaction</h1>

        {error && <div className="alert alert-bad">{error}</div>}

        <form ref={formRef} id="entry-form" onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <input type="hidden" name="idempotency_key" value={idempotencyKey} />
          <div className="form-section-head">
            <span className="tile">
              <IconDocument />
            </span>
            <span>Transaction</span>
            <span className="rule" />
          </div>

          {recentDealers.length > 0 && !dealerId && (
            <div className="-mb-1 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-paper-dim">Recent:</span>
              {recentDealers.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => selectDealer(d.id)}
                  className="rounded-full border border-ink-800 bg-ink-900 px-2.5 py-1 text-[11.5px] font-semibold text-paper transition-colors hover:border-primary hover:text-primary"
                >
                  {d.company_name}
                </button>
              ))}
            </div>
          )}

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
                avatarPackage: d.package,
              }))}
            />
          </div>

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
              <input
                name="tx_date"
                type="date"
                value={txDate}
                max={today}
                onChange={(e) => setTxDate(e.target.value)}
                required
                className="field-input"
              />
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
                <label className="field-label">SIM Type</label>
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
                <label className="field-label">Amount Collected (RM)</label>
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
                <label className="field-label">Top-up Value (points)</label>
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
                <label className="field-label">Coupon Amount (RM, optional)</label>
                <input
                  name="coupon_rm"
                  type="number"
                  step={COUPON_DENOMINATION_RM}
                  min="0"
                  value={couponRm}
                  onChange={(e) => setCouponRm(e.target.value)}
                  placeholder="0"
                  className="field-input"
                />
                <span className="hint">
                  Portion of the amount above issued as RM{COUPON_DENOMINATION_RM} coupons instead of straight to the
                  dealer&apos;s phone — leave blank if this whole top-up is direct.
                  {Number(couponRm) > 0
                    ? ` (${Number(couponRm) / COUPON_DENOMINATION_RM} coupon${Number(couponRm) / COUPON_DENOMINATION_RM === 1 ? '' : 's'})`
                    : ''}
                </span>
              </div>
            </div>
          )}

          <div className="form-section-head">
            <span className="tile">
              <IconPaperclip />
            </span>
            <span>Attachments &amp; Notes</span>
            <span className="rule" />
          </div>
          <div className="form-grid">
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
            <div>
              <label className="field-label">Note (optional)</label>
              <textarea name="note" rows={2} className="field-input resize-none" />
            </div>
          </div>
        </form>
      </div>

      <div className="app-card">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-paper">Auto-calculated for you</h3>
          <span className="live-badge">
            <span className="live-dot" />
            Live
          </span>
        </div>
        {preview ? (
          <div className="flex flex-col text-sm">
            <Row label="Amount Collected" value={`RM ${preview.money.toLocaleString()}`} unit="money" />
            <Row label="Rate" value={`${preview.rate}%`} />
            <Row label={type === 'package' ? 'Package Value' : 'Top-up Value'} value={`${preview.points.toLocaleString()} pts`} unit="points" />
            <Row label="Your 2%" value={`RM ${preview.commission.toLocaleString()}`} unit="money" bold highlight />
            <Row label="Credit Balance" value={`${availableBalance.toLocaleString()} pts`} unit="points" warn={insufficientBalance} />
          </div>
        ) : (
          <p className="text-sm text-paper-dim">
            {dealer ? 'This dealer has no package/rate yet — buy them a package first.' : 'Select a dealer first.'}
          </p>
        )}
        {insufficientBalance && (
          <div className="alert alert-bad mt-3">
            Not enough credit balance — {availableBalance.toLocaleString()} pts available, this needs{' '}
            {preview!.points.toLocaleString()} pts. Log a Credit Purchase first.
          </div>
        )}
        <button
          type="submit"
          form="entry-form"
          disabled={uploading || submitting || insufficientBalance}
          className="btn-primary mt-4 w-full"
        >
          {uploading ? 'Uploading receipt…' : 'Submit (pending verification)'}
        </button>
        <p className="note-strip">Buying a package automatically updates the dealer&apos;s rate for future transactions.</p>
      </div>
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
