'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createSimOrder } from './actions'
import { SIM_MIN_ORDER_QTY, SIM_SELL_PRICE_RM, SIM_TYPE_LABEL, type SimStockType } from '@/lib/sim-stock'
import { IconUpload } from '../icons'
import { Combobox } from '../combobox'

// Mirrors the sim-shipping-invoices bucket limits (migration 0024).
const INVOICE_MAX_BYTES = 10 * 1024 * 1024
const INVOICE_ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'])

type DealerOption = { id: string; company_name: string; address: string | null }

export function OrderForm({
  dealers,
  availableByType,
}: {
  dealers: DealerOption[]
  availableByType: Record<SimStockType, number>
}) {
  const [dealerId, setDealerId] = useState('')
  const [simType, setSimType] = useState<SimStockType>('physical')
  const selectedDealer = dealers.find((d) => d.id === dealerId)
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (!dealerId) {
      setError('Please select a dealer.')
      return
    }

    setSubmitting(true)
    const formData = new FormData(e.currentTarget)

    // eSIM has no physical shipment — only upload/attach an invoice for a
    // physical order, regardless of whether the field was somehow filled in.
    if (simType === 'physical' && invoiceFile) {
      setUploading(true)
      const supabase = createClient()
      const path = `${dealerId}/${Date.now()}-${invoiceFile.name}`
      const { error: uploadError } = await supabase.storage.from('sim-shipping-invoices').upload(path, invoiceFile)
      setUploading(false)
      if (uploadError) {
        setError('Invoice upload failed: ' + uploadError.message)
        setSubmitting(false)
        return
      }
      formData.set('shipping_invoice_path', path)
    }

    try {
      await createSimOrder(formData)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
      {error && <div className="alert alert-bad">{error}</div>}
      <div>
        <label className="field-label">SIM Type</label>
        <input type="hidden" name="sim_type" value={simType} />
        <div className="segmented w-full">
          <button type="button" onClick={() => setSimType('physical')} className={`segmented-btn flex-1 ${simType === 'physical' ? 'active' : ''}`}>
            {SIM_TYPE_LABEL.physical}
          </button>
          <button type="button" onClick={() => setSimType('esim')} className={`segmented-btn flex-1 ${simType === 'esim' ? 'active' : ''}`}>
            {SIM_TYPE_LABEL.esim}
          </button>
        </div>
      </div>
      <div>
        <label className="field-label">Dealer</label>
        <Combobox
          name="dealer_id"
          value={dealerId}
          onChange={setDealerId}
          placeholder="Select a dealer…"
          searchPlaceholder="Search dealer…"
          options={dealers.map((d) => ({ value: d.id, label: d.company_name, sublabel: d.address ?? undefined }))}
        />
        {simType === 'physical' && (
          <p className="mt-1 text-[11px] text-paper-dim">
            Ship to: {selectedDealer ? (selectedDealer.address ?? 'No address on file') : '—'}
          </p>
        )}
      </div>
      <div>
        <label className="field-label">Order Date</label>
        <input name="order_date" type="date" required className="field-input" />
      </div>
      <div>
        <label className="field-label">Quantity (min {SIM_MIN_ORDER_QTY})</label>
        <input name="quantity" type="number" min={SIM_MIN_ORDER_QTY} step="1" required className="field-input" />
        <p className="mt-1 text-[11px] text-paper-dim">
          RM {SIM_SELL_PRICE_RM.toFixed(2)} per card · {availableByType[simType].toLocaleString()} {SIM_TYPE_LABEL[simType]} in stock right now
        </p>
      </div>
      {simType === 'physical' ? (
        <>
          <div>
            <label className="field-label">Shipping Fee (RM, optional)</label>
            <input name="shipping_fee_rm" type="number" step="0.01" min="0" placeholder="Leave blank if no shipping cost" className="field-input" />
          </div>
          <div>
            <label className="field-label">Shipping Invoice (optional)</label>
            <label className="upload-box">
              <IconUpload />
              <span className="truncate">{invoiceFile ? invoiceFile.name : 'Click to upload invoice/receipt'}</span>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null
                  if (file && !INVOICE_ALLOWED_TYPES.has(file.type)) {
                    setError('Please upload a JPEG, PNG, WEBP, GIF, or PDF file.')
                    e.target.value = ''
                    return
                  }
                  if (file && file.size > INVOICE_MAX_BYTES) {
                    setError('File is too large (max 10MB).')
                    e.target.value = ''
                    return
                  }
                  setInvoiceFile(file)
                }}
                className="hidden"
              />
            </label>
          </div>
        </>
      ) : (
        <div>
          <label className="field-label">eSIM Codes (optional)</label>
          <textarea
            name="esim_codes"
            rows={3}
            placeholder="Paste the activation code(s) given to the dealer, one per line"
            className="field-input resize-none"
          />
        </div>
      )}
      <button type="submit" disabled={submitting} className="btn-primary w-full">
        {uploading ? 'Uploading invoice…' : submitting ? 'Saving…' : 'Save Order'}
      </button>
    </form>
  )
}
