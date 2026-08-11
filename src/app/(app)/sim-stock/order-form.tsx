'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createSimOrder } from './actions'
import { SIM_MIN_ORDER_QTY, SIM_SELL_PRICE_RM, SIM_STOCK_TYPES, SIM_TYPE_LABEL,
  SIM_TYPE_SHORT, isPhysicalSimType, type SimStockType } from '@/lib/sim-stock'
import { Combobox } from '../combobox'
import { DatePicker } from '../date-picker'
import { Modal } from '../modal'
import { formatMYR } from '@/lib/money'
import { ReceiptField } from '../receipt-field'

// Mirrors the sim-shipping-invoices bucket limits (migration 0024).
const INVOICE_MAX_BYTES = 10 * 1024 * 1024
const INVOICE_ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'])

type DealerOption = { id: string; company_name: string; address: string | null }

export function OrderForm({
  dealers,
  availableByType,
  today,
}: {
  dealers: DealerOption[]
  availableByType: Record<SimStockType, number>
  today: string
}) {
  const [dealerId, setDealerId] = useState('')
  const [simType, setSimType] = useState<SimStockType>('physical')
  const selectedDealer = dealers.find((d) => d.id === dealerId)
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingFormData, setPendingFormData] = useState<FormData | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (!dealerId) {
      setError('Please select a dealer.')
      return
    }

    setPendingFormData(new FormData(e.currentTarget))
    setConfirmOpen(true)
  }

  async function doSubmit() {
    if (!pendingFormData) return
    setConfirmOpen(false)
    setSubmitting(true)
    const formData = pendingFormData

    // eSIM (either variant) has no physical shipment — only upload/attach an
    // invoice for a physical order, regardless of whether the field was
    // somehow filled in.
    if (isPhysicalSimType(simType) && invoiceFile) {
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
    // The same 12-column grid as the intake form, and for the same reason —
    // six stacked full-width fields made a very tall, very narrow card. See
    // intake-form.tsx for why the spans are written natively rather than
    // behind an @apply alias.
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <div className="alert alert-bad">{error}</div>}
        {/* Two across, and the switch takes its own row.
            It was four fields side by side, which spent the page's width — the
            scarce axis — and left the room underneath it empty. Six-and-six
            grows the form downward into that room instead, and every field
            lands at ~560px rather than ~250px, which is a width that matches
            what goes in it. */}
      <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-6 lg:grid-cols-12">
        {/* The full row, matching Stock in. A three-way switch does not fit
            half a row without wrapping, and the same control cannot be two
            widths on two tabs of one page. */}
        <div className="sm:col-span-6 lg:col-span-12">
          <label className="field-label">SIM Type</label>
          <input type="hidden" name="sim_type" value={simType} />
          <div className="segmented w-full">
            {SIM_STOCK_TYPES.map((t) => (
              <button key={t} type="button" onClick={() => setSimType(t)} className={`segmented-btn flex-1 ${simType === t ? 'active' : ''}`}>
                {SIM_TYPE_SHORT[t]}
              </button>
            ))}
          </div>
        </div>
        <div className="sm:col-span-6 lg:col-span-6">
          <label className="field-label">Dealer</label>
          <Combobox
            name="dealer_id"
            value={dealerId}
            onChange={setDealerId}
            placeholder="Select a dealer…"
            searchPlaceholder="Search dealer…"
            options={dealers.map((d) => ({ value: d.id, label: d.company_name, sublabel: d.address ?? undefined }))}
          />
          {isPhysicalSimType(simType) && (
            <p className="mt-1 text-[12px] text-paper-dim">
              Ship to: {selectedDealer ? (selectedDealer.address ?? 'No address on file') : '—'}
            </p>
          )}
        </div>
        <div className="sm:col-span-6 lg:col-span-6">
          <label className="field-label">Order Date</label>
          <DatePicker name="order_date" max={today} todayIso={today} required />
        </div>
        <div className="sm:col-span-6 lg:col-span-6">
          <label htmlFor="so-qty" className="field-label">
            Quantity (min {SIM_MIN_ORDER_QTY})
          </label>
          <input id="so-qty" name="quantity" type="number" min={SIM_MIN_ORDER_QTY} step="1" required className="field-input" />
          <p className="mt-1 text-[12px] text-paper-dim">
            {formatMYR(SIM_SELL_PRICE_RM)} per card · {availableByType[simType].toLocaleString()} {SIM_TYPE_LABEL[simType]} in stock right now
          </p>
        </div>
        {isPhysicalSimType(simType) ? (
          <>
            <div className="sm:col-span-6 lg:col-span-6">
              <label className="field-label">Shipping Fee (RM, optional)</label>
              <input name="shipping_fee_rm" type="number" step="0.01" min="0" placeholder="Leave blank if no shipping cost" className="field-input" />
            </div>
            {/* An empty left half, on purpose. There is no note on a SIM
                order, and the invoice still belongs in the right column so it
                sits where it does on Stock in, Log Purchase and New
                Transaction. A field that moves side to side between two tabs
                of the same page is the worst case of all. */}
            <div className="hidden lg:col-span-6 lg:block" aria-hidden="true" />
            <div className="sm:col-span-6 lg:col-span-6">
              {/* The same component, the same width and the same words as the
                  intake form above. This was a bespoke box reading "Click to
                  upload invoice/receipt" at a different size — see
                  receipt-field.tsx for why it is controlled rather than
                  posted: this file uploads to its own bucket before calling
                  the order RPC. */}
              <ReceiptField
                label="Shipping invoice"
                hint="The courier's invoice for this shipment. Image or PDF."
                onSelect={(file) => {
                  if (file && !INVOICE_ALLOWED_TYPES.has(file.type)) {
                    setError('Please upload a JPEG, PNG, WEBP, GIF, or PDF file.')
                    return
                  }
                  if (file && file.size > INVOICE_MAX_BYTES) {
                    setError('That file is too large (max 10MB).')
                    return
                  }
                  setInvoiceFile(file)
                }}
                selectedName={invoiceFile?.name ?? null}
              />
            </div>
          </>
        ) : (
          <div className="sm:col-span-6 lg:col-span-12">
            <label className="field-label">eSIM Codes (optional)</label>
            <textarea
              name="esim_codes"
              rows={3}
              placeholder="Paste the activation code(s) given to the dealer, one per line"
              className="field-input resize-none"
            />
          </div>
        )}
      </div>
      {/* Same footer shape as the intake form above and as Onboard Dealer. */}
      <div className="flex flex-wrap items-center gap-4 border-t border-ink-800 pt-6">
        <button type="submit" disabled={submitting} className="btn-primary">
          {uploading ? 'Uploading invoice…' : submitting ? 'Saving…' : 'Save order'}
        </button>
        <span className="text-[12px] text-paper-dim">Draws from the pool you picked and adds the dealer to SIM Delivery.</span>
      </div>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <p className="text-sm font-semibold text-paper">Confirm this order</p>
        <div className="mt-3 flex flex-col text-sm">
          <div className="docket-row">
            <span className="text-paper-dim">Dealer</span>
            <b className="text-paper">{selectedDealer?.company_name ?? '—'}</b>
          </div>
          <div className="docket-row">
            <span className="text-paper-dim">SIM Type</span>
            <b className="text-paper">{SIM_TYPE_LABEL[simType]}</b>
          </div>
          <div className="docket-row">
            <span className="text-paper-dim">Quantity</span>
            <b className="figure text-paper">{(Number(pendingFormData?.get('quantity')) || 0).toLocaleString()} cards</b>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button type="button" onClick={() => setConfirmOpen(false)} className="btn-ghost flex-1">
            Back
          </button>
          <button type="button" onClick={doSubmit} disabled={submitting} className="btn-primary flex-1">
            {uploading ? 'Uploading invoice…' : submitting ? 'Saving…' : 'Confirm & Save'}
          </button>
        </div>
      </Modal>
    </form>
  )
}
