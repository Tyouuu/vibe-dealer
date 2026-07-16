'use client'

import { useState } from 'react'
import { saveStatement } from './actions'
import { IconUpload } from '../icons'

export function StatementForm({
  month,
  initialPoints,
  initialProfit,
  initialNote,
}: {
  month: string
  initialPoints: number | null
  initialProfit: number | null
  initialNote: string
}) {
  const [points, setPoints] = useState(initialPoints != null ? String(initialPoints) : '')
  const [profit, setProfit] = useState(initialProfit != null ? String(initialProfit) : '')
  const [fileName, setFileName] = useState<string | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)

  async function handleFile(file: File) {
    setFileName(file.name)
    setExtractError(null)
    setExtracting(true)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/reconcile/extract', { method: 'POST', body })
      const data = await res.json()
      if (!res.ok) {
        setExtractError(data.error ?? "Couldn't read that image — enter the numbers manually.")
        return
      }
      if (typeof data.company_total_points === 'number') setPoints(String(data.company_total_points))
      if (typeof data.company_profit_rm === 'number') setProfit(String(data.company_profit_rm))
      if (data.company_total_points == null && data.company_profit_rm == null) {
        setExtractError("Couldn't find the figures in that image — enter them manually.")
      }
    } catch {
      setExtractError("Couldn't read that image — enter the numbers manually.")
    } finally {
      setExtracting(false)
    }
  }

  return (
    <form action={saveStatement} className="flex flex-col gap-3.5">
      <input type="hidden" name="month" value={month} />
      <label className="upload-box">
        <IconUpload />
        <span className="truncate">
          {extracting ? 'Reading statement…' : (fileName ?? "Drag Vibe's statement here, or click to upload — we'll fill in the numbers below")}
        </span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
          }}
        />
      </label>
      {extractError && <p className="text-xs text-clay-bright">{extractError}</p>}

      <div>
        <label className="field-label">Vibe total top-up (pts)</label>
        <input
          name="company_total_points"
          type="number"
          step="0.01"
          min="0"
          value={points}
          onChange={(e) => setPoints(e.target.value)}
          required
          className="field-input"
        />
      </div>
      <div>
        <label className="field-label">Vibe&apos;s Profit Figure (RM)</label>
        <input
          name="company_profit_rm"
          type="number"
          step="0.01"
          min="0"
          value={profit}
          onChange={(e) => setProfit(e.target.value)}
          className="field-input"
        />
      </div>
      <div>
        <label className="field-label">Note</label>
        <input name="note" type="text" defaultValue={initialNote} className="field-input" />
      </div>
      <button type="submit" className="btn-primary w-full">
        Save &amp; Compare
      </button>
    </form>
  )
}
