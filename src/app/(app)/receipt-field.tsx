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
}: {
  label?: string
  /** Says which document this is, in the words of whoever will be attaching it. */
  hint: string
}) {
  const [name, setName] = useState<string | null>(null)

  return (
    <div>
      <span className="field-label">
        {label} <span className="font-normal text-paper-dim">(optional)</span>
      </span>
      <label className="upload-box">
        <IconUpload />
        <span className={name ? 'truncate' : 'min-w-0 text-left'}>{name ?? 'Attach a file or photo'}</span>
        <input
          type="file"
          name="receipt"
          accept={RECEIPT_ACCEPT}
          className="hidden"
          onChange={(e) => setName(e.target.files?.[0]?.name ?? null)}
        />
      </label>
      <p className="mt-2 text-[12px] text-paper-dim">{hint}</p>
    </div>
  )
}
