'use client'

import { useState, useTransition } from 'react'
import { saveStatement } from './actions'
import { IconUpload } from '../icons'
import { Field } from '../field'

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
  const [pending, startTransition] = useTransition()

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
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const formData = new FormData(e.currentTarget)
        startTransition(() => {
          saveStatement(formData)
        })
      }}
      // Full page width and two across, the same shape as every other form —
      // the owner asked for these forced into line rather than each explained.
      // The 576px column this briefly had made its Note 576 where every other
      // form's is 536.
      className="flex flex-col gap-3.5"
    >
      <input type="hidden" name="month" value={month} />
      <label className="upload-box">
        <IconUpload />
        {/* A chosen filename truncates — it is a name, and the middle of it
            is rarely the part you need. The instruction wraps: on a phone it
            was arriving as "Drag Vibe's statement here, or click to uploa…",
            which cuts off the half that says what happens next. */}
        <span className={fileName || extracting ? 'truncate' : 'min-w-0 text-left'}>
          {extracting ? 'Reading statement…' : (fileName ?? "Drag Vibe's statement here, or click to upload — we'll fill in the numbers below")}
        </span>
        {/* Named, so the same choice both feeds the reader and gets kept.
            The statement was read for its numbers and then thrown away: a
            month could be signed off against a document nobody could produce
            again. 0044 gave company_statements somewhere to put it. */}
        <input
          type="file"
          name="receipt"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
          }}
        />
      </label>
      {extractError && <p className="text-xs text-clay-bright">{extractError}</p>}

      {/* Two across. A points total in a 1100px box is the field-width
          mismatch Baymard warns about, and half of 1088 is 536 — the width
          every other form gives a field. */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
      <Field label="Vibe total top-up (pts)" required>
        {(id) => (
        <input
          id={id}
          name="company_total_points"
          type="number"
          step="0.01"
          min="0"
          value={points}
          onChange={(e) => setPoints(e.target.value)}
          required
          className="field-input"
        />
        )}
      </Field>
      <Field label="Vibe&apos;s profit figure (RM)">
        {(id) => (
        <input
          id={id}
          name="company_profit_rm"
          type="number"
          step="0.01"
          min="0"
          value={profit}
          onChange={(e) => setProfit(e.target.value)}
          className="field-input"
        />
        )}
      </Field>
      </div>
      {/* Left column, 536px, like the note on every other form. It was a
          full-width row of its own. */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <Field label="Note">
          {(id) => <input id={id} name="note" type="text" defaultValue={initialNote} className="field-input" />}
        </Field>
      </div>
      {/* Content-width, like every other primary action in the app. */}
      <div>
        <button type="submit" disabled={pending} className="btn-primary disabled:opacity-60">
          {pending ? 'Saving…' : 'Save and compare'}
        </button>
      </div>
    </form>
  )
}
