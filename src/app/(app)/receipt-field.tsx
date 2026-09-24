'use client'

import { useState } from 'react'
import { IconUpload } from './icons'
import { RECEIPT_ACCEPT } from '@/lib/receipt-upload'

// The upload box the three money-in forms share.
//
// Client only so the chosen filename can be shown back — an upload control
// that gives no sign it took the file is one people click twice. Everything
// else about it, including the size and type limits, is enforced in the Server
// Action: see lib/receipt-upload.
export function ReceiptField({
  label = 'Invoice or receipt',
  hint,
  name = 'receipt',
  onSelect,
  selectedName,
  onPick,
}: {
  label?: string
  /** Says which document this is, in the words of whoever will be attaching it. */
  hint: string
  /** The field name in the posted form. */
  name?: string
  /**
   * Set when the caller uploads the file itself rather than posting it — the
   * SIM order form writes to its own bucket through an RPC. It then owns the
   * filename too, via `selectedName`. Everything visible stays identical
   * either way, which is the point: two upload boxes on one page that looked
   * and read differently were half of what made that page feel unfinished.
   */
  onSelect?: (file: File | null) => void
  selectedName?: string | null
  /**
   * Told which file was picked, WITHOUT taking the upload over — the file still posts with the form and
   * the box still shows its own filename. For a form that wants to read the picture as it arrives.
   */
  onPick?: (file: File | null) => void
}) {
  const [ownName, setOwnName] = useState<string | null>(null)
  const shownName = onSelect ? (selectedName ?? null) : ownName

  return (
    <div>
      <span className="field-label">
        {label} <span className="font-normal text-paper-dim">(optional)</span>
      </span>
      <label className="upload-box">
        <IconUpload />
        <span className={shownName ? 'truncate' : 'min-w-0 text-left'}>{shownName ?? 'Attach a file or photo'}</span>
        <input
          type="file"
          name={onSelect ? undefined : name}
          accept={RECEIPT_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null
            if (onSelect) onSelect(file)
            else setOwnName(file?.name ?? null)
            onPick?.(file)
          }}
        />
      </label>
      <p className="mt-2 text-[12px] text-paper-dim">{hint}</p>
    </div>
  )
}
