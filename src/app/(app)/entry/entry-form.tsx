'use client'

import { useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PACKAGES, COMMISSION_RATE, type PackageCode } from '@/lib/packages'
import { createTransaction } from './actions'
import { IconUsers, IconCoin, IconTag, IconUpload } from '../icons'

type DealerOption = {
  id: string
  company_name: string
  package: PackageCode | null
  rate: number | null
}

export function EntryForm({ dealers, initialDealerId }: { dealers: DealerOption[]; initialDealerId?: string }) {
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

    await createTransaction(formData)
  }

  return (
    <div className="grid gap-5 md:grid-cols-[1.3fr_1fr]">
      <div className="app-card">
        <h1 className="mb-4 text-base font-bold text-paper">Record a Transaction</h1>

        {error && <div className="alert alert-bad">{error}</div>}

        <form ref={formRef} id="entry-form" onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <div className="form-section-head">
            <span className="tile">
              <IconUsers />
            </span>
            <span>Dealer &amp; Type</span>
            <span className="rule" />
          </div>
          <div className="form-grid">
            <div>
              <label className="field-label">Dealer</label>
              <select
                name="dealer_id"
                value={dealerId}
                onChange={(e) => setDealerId(e.target.value)}
                required
                className="field-input"
              >
                <option value="">Select a dealer…</option>
                {dealers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.company_name}
                    {d.package ? ` (current ${d.package}·${d.rate}%)` : ' (no package set)'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="field-label">Type</label>
              <select
                name="type"
                value={type}
                onChange={(e) => setType(e.target.value as 'topup' | 'package')}
                className="field-input"
              >
                <option value="topup">Regular Top-up</option>
                <option value="package">Buy Package (updates rate)</option>
              </select>
            </div>
          </div>

          <div className="form-section-head">
            <span className="tile">
              <IconCoin />
            </span>
            <span>{type === 'package' ? 'Package Details' : 'Top-up Details'}</span>
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
              </div>
            </div>
          )}

          <div className="form-section-head">
            <span className="tile">
              <IconTag />
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
        <p className="note-strip">
          Buying a package automatically updates the dealer&apos;s rate (follows the latest package); a regular
          top-up uses their current rate to calculate your 2%.
        </p>
        <p className="note-strip">Money and points are kept separate: In tracks money, Out tracks points — never mixed.</p>
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
      <b className={`${valueStyle} ${bold ? 'text-base' : ''}`}>{value}</b>
    </div>
  )
}
