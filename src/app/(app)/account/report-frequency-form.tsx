'use client'

import { useState, useTransition } from 'react'
import { updateReportFrequency } from './actions'
import { REPORT_FREQUENCIES, type ReportFrequency } from '@/lib/reports/report-period'

// How often the emailed report arrives, chosen per person.
//
// Radio-shaped, not a dropdown: there are four options, they are mutually
// exclusive, and each one needs a line explaining what period it covers —
// which a <select> cannot show until after you have already chosen. The
// difference between "every Monday" and "on the 1st" is what they contain,
// and that is the thing being decided.
//
// Saves on selection rather than behind a Save button. There is one value, it
// applies to the person changing it, and it is reversible in a click — a Save
// step here would only add a way to think you changed something and not have.
export function ReportFrequencyForm({ initialValue }: { initialValue: ReportFrequency }) {
  const [value, setValue] = useState<ReportFrequency>(initialValue)
  const [pending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)

  function choose(next: ReportFrequency) {
    if (next === value) return
    setValue(next)
    setSaved(false)
    startTransition(async () => {
      await updateReportFrequency(next)
      setSaved(true)
    })
  }

  return (
    // No max-w here. The Account Settings column caps at 720px now, so this
    // was a second cap inside the first — and it was the one leaving 165px of
    // blank at the end of every radio row while the four cards around it
    // ended flush. One cap, on the page.
    <div>
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">How often the report is emailed</legend>
        {REPORT_FREQUENCIES.map((f) => {
          const active = value === f.key
          return (
            <label
              key={f.key}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                active ? 'border-primary bg-primary-soft' : 'border-ink-800 bg-ink-900 hover:border-ink-700'
              }`}
            >
              <input
                type="radio"
                name="report_frequency"
                value={f.key}
                checked={active}
                onChange={() => choose(f.key)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
              />
              <span className="min-w-0">
                <span className={`block text-[13px] font-semibold ${active ? 'text-primary-deep' : 'text-paper'}`}>{f.label}</span>
                <span className="block text-[12px] leading-snug text-paper-dim">{f.description}</span>
              </span>
            </label>
          )
        })}
      </fieldset>

      {/* Says when, because the frequency alone does not. The hour is one
          setting for everyone — Vercel's schedule lives in vercel.json and is
          fixed at build time — so stating it here is honest rather than
          pretending it is per-person. */}
      <p className="hint mt-2.5">
        {pending ? 'Saving…' : saved ? 'Saved. ' : ''}
        {value === 'off' ? 'You will not receive the emailed report.' : 'Arrives around 8am, Malaysia time.'}
      </p>
    </div>
  )
}
