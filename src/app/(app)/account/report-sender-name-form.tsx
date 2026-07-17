'use client'

import { useState } from 'react'
import { updateReportSenderName } from './actions'

export function ReportSenderNameForm({ initialValue }: { initialValue: string }) {
  const [value, setValue] = useState(initialValue)
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setSaved(false)
    await updateReportSenderName(value)
    setPending(false)
    setSaved(true)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:gap-3">
      <div className="flex-1">
        <label className="field-label">Daily report sender name</label>
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setSaved(false)
          }}
          placeholder="DealerHub Daily Report"
          maxLength={80}
          className="field-input"
        />
        <span className="hint">Shown as the sender name on the daily report email.</span>
      </div>
      <button type="submit" disabled={pending} className="btn-primary shrink-0">
        {pending ? 'Saving…' : saved ? 'Saved' : 'Save'}
      </button>
    </form>
  )
}
