'use client'

import { useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PACKAGES, COMMISSION_RATE, type PackageCode } from '@/lib/packages'
import { createTransaction } from './actions'
import { IconDocument, IconCoin, IconPaperclip, IconUpload } from '../icons'

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
}: {
  dealers: DealerOption[]
  initialDealerId?: string
  recentDealers?: { id: string; company_name: string }[]
  lastTxByDealer?: Record<string, LastTxInfo>
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [dealerId, setDealerId] = useState(
    initialDealerId && dealers.some((d) => d.id === initialDealerId) ? initialDealerId : ''
  )
  const [type, setType] = useState<'topup' | 'package'>('topup')
  const [pkg, setPkg] = useState<PackageCode>('A')
  const [points, setPoints] = useState('')
  const [moneyOverride, setMoneyOverride] = useState('')
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dealer = dealers.find((d) => d.id === dealerId)

  // Same dealer's last transaction, suggested as an editable starting point —
  // confirming a pre-filled value beats retyping the same points every time.
  function selectDealer(id: string) {
    setDealerId(id)
    const last = lastTxByDealer[id]
    if (!last) return
    setType(last.type)
    if (last.type === 'topup') {
      setPoints(String(last.points))
    } else if (last.package) {
      setPkg(last.package as PackageCode)
    }
  }

  const preview = useMemo(() => {
    if (type === 'package') {
      const def = PACKAGES[pkg]
      return { points: def.reload, rate: def.rate, money: def.price, commission: Math.round(def.reload * COMMISSION_RATE * 100) / 100 }
    }
    const rate = dealer?.rate ?? null
    const pts = Number(points) || 0
    if (rate == null) return null
    const suggestedMoney = Math.round(pts * (1 - rate / 100) * 100) / 100
    const money = moneyOverride ? Number(moneyOverride) : suggestedMoney
    return { points: pts, rate, money, commission: Math.round(pts * COMMISSION_RATE * 100) / 100 }
  }, [type, pkg, dealer, points, moneyOverride])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (!dealerId) {
      setError('Please select a dealer.')
      return
    }
    if (type === 'topup' && dealer?.rate == null) {
      setError('This dealer has no package/rate yet — buy them a package first.')
      return
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

          <div className="form-grid">
            <div>
              <label className="field-label">Dealer</label>
              <select
                name="dealer_id"
                value={dealerId}
                onChange={(e) => selectDealer(e.target.value)}
                required
                className="field-input"
              >
                <option value="">Select a dealer…</option>
                {dealers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.company_name}
                    {d.package ? ` — Package ${d.package} · ${d.rate}%` : ' — No package'}
                  </option>
                ))}
              </select>
            </div>

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
                <select name="package" value={pkg} onChange={(e) => setPkg(e.target.value as PackageCode)} className="field-input">
                  {(Object.keys(PACKAGES) as PackageCode[]).map((code) => (
                    <option key={code} value={code}>
                      {PACKAGES[code].name} · RM{PACKAGES[code].price} · {PACKAGES[code].rate}%
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">SIM Type</label>
                <select name="sim_type" defaultValue="esim" className="field-input">
                  <option value="esim">eSIM (instant)</option>
                  <option value="physical">Physical SIM (needs delivery)</option>
                </select>
              </div>
            </div>
          ) : (
            <div className="form-grid">
              <div>
                <label className="field-label">Top-up Value (points)</label>
                <input
                  name="points"
                  type="number"
                  min="1"
                  value={points}
                  onChange={(e) => setPoints(e.target.value)}
                  placeholder="e.g. 850"
                  required
                  className="field-input"
                />
              </div>
              <div>
                <label className="field-label">Amount Collected (RM)</label>
                <input
                  name="money_rm"
                  type="number"
                  step="0.01"
                  min="0"
                  value={moneyOverride}
                  onChange={(e) => setMoneyOverride(e.target.value)}
                  placeholder={preview ? String(preview.money) : 'Auto-calculated from rate, editable'}
                  className="field-input"
                />
                <span className="hint">Auto-suggested from rate — editable</span>
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
                  onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
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
            <Row label={type === 'package' ? 'Package Value' : 'Top-up Value'} value={`${preview.points.toLocaleString()} pts`} unit="points" />
            <Row label="Rate" value={`${preview.rate}%`} />
            <Row label="Amount Collected" value={`RM ${preview.money.toLocaleString()}`} unit="money" />
            <Row label="Your 2%" value={`RM ${preview.commission.toLocaleString()}`} unit="money" bold highlight />
          </div>
        ) : (
          <p className="text-sm text-paper-dim">
            {dealer ? 'This dealer has no package/rate yet — buy them a package first.' : 'Select a dealer first.'}
          </p>
        )}
        <button type="submit" form="entry-form" disabled={uploading || submitting} className="btn-primary mt-4 w-full">
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
}: {
  label: string
  value: string
  unit?: 'money' | 'points'
  bold?: boolean
  highlight?: boolean
}) {
  const valueStyle = unit === 'money' ? 'figure-money' : unit === 'points' ? 'figure-points' : 'text-paper'
  return (
    <div className={`docket-row ${highlight ? '-mx-3 rounded-lg bg-primary-soft px-3' : ''}`}>
      <span className={highlight ? 'font-semibold text-paper' : 'text-paper-dim'}>{label}</span>
      <b className={`${valueStyle} ${bold ? 'text-base' : ''} ${highlight ? 'text-primary-deep' : ''}`}>{value}</b>
    </div>
  )
}
