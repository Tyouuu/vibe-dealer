'use client'

import { useState } from 'react'
import { PACKAGES } from '@/lib/packages'
import { REGIONS } from '@/lib/regions'
import { ACCEPT_ATTR } from '@/lib/vision-extract'
import type { ExtractedDealer } from '@/lib/dealer-extract'
import { createDealer, checkDuplicateDealer } from './actions'
import { Listbox } from '../listbox'
import { TextAutocomplete } from '../text-autocomplete'
import { PageHeader } from '../page-header'
import { IconUpload } from '../icons'

const MAX_IMAGES = 4

const BLANK = {
  company_name: '',
  company_no: '',
  contact_person: '',
  phone: '',
  whatsapp: '',
  email: '',
  address: '',
  region: '',
  notes: '',
}

type FieldName = keyof typeof BLANK

export function OnboardForm({ initialError }: { initialError?: string }) {
  const [duplicate, setDuplicate] = useState<{ id: string; company_name: string } | null>(null)
  const [checking, setChecking] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // The fields became controlled when the screenshot reader arrived — it has
  // to be able to put values into them. Everything else about the form is
  // unchanged.
  const [values, setValues] = useState(BLANK)
  // Which fields the reader filled, so each one can say so until a person
  // touches it. The point is not decoration: these are the values nobody has
  // checked yet, and the marker disappearing is what "I checked it" looks
  // like.
  const [fromScreenshot, setFromScreenshot] = useState<Set<FieldName>>(new Set())
  const [reading, setReading] = useState(false)
  const [readError, setReadError] = useState<string | null>(null)
  const [readSummary, setReadSummary] = useState<string | null>(null)

  function set(name: FieldName, v: string) {
    setValues((prev) => ({ ...prev, [name]: v }))
    setFromScreenshot((prev) => {
      if (!prev.has(name)) return prev
      const next = new Set(prev)
      next.delete(name)
      return next
    })
    if (name === 'company_name') setDuplicate(null)
  }

  async function handleFiles(files: FileList) {
    setReadError(null)
    setReadSummary(null)
    setReading(true)
    try {
      const body = new FormData()
      for (const file of Array.from(files).slice(0, MAX_IMAGES)) body.append('file', file)
      const res = await fetch('/api/onboard/extract', { method: 'POST', body })
      const data = await res.json()
      if (!res.ok) {
        setReadError(data.error ?? "Couldn't read those images — fill the form in by hand.")
        return
      }

      const extracted = data as ExtractedDealer
      // Merged against the current values rather than inside a setValues
      // updater. The updater does not run until React re-renders, so anything
      // counted inside it is still zero on the next line — which is exactly
      // what happened: the fields filled in correctly and the summary below
      // announced "nothing changed" every time.
      const next = { ...values }
      const filled = new Set<FieldName>()
      for (const [key, value] of Object.entries(extracted)) {
        // Only over an empty field. Somebody who has already typed the
        // company name should not watch a screenshot overwrite it.
        if (key in next && typeof value === 'string' && value && !next[key as FieldName]) {
          next[key as FieldName] = value
          filled.add(key as FieldName)
        }
      }
      setValues(next)
      setFromScreenshot(filled)
      setDuplicate(null)
      setReadSummary(
        filled.size === 0
          ? 'Everything in those screenshots was already filled in below — nothing changed.'
          : `Filled ${filled.size} field${filled.size === 1 ? '' : 's'} from the screenshot. Check them, then onboard.`
      )
    } catch {
      setReadError("Couldn't read those images — fill the form in by hand.")
    } finally {
      setReading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)

    // Only re-check if we haven't already confirmed this exact submission —
    // once the user's said "yes, different dealer", don't ask again on the
    // same click.
    if (!duplicate) {
      setChecking(true)
      const existing = await checkDuplicateDealer(String(formData.get('company_name') ?? ''))
      setChecking(false)
      if (existing) {
        setDuplicate(existing)
        return
      }
    } else {
      formData.set('confirm_duplicate', 'true')
    }

    setSubmitting(true)
    try {
      await createDealer(formData)
    } finally {
      // Reached only on a server-side validation failure (createDealer
      // redirects back to this same route) — success redirects to /dealers,
      // unmounting this component, so this is a harmless no-op there.
      setSubmitting(false)
    }
  }

  const marker = (name: FieldName) => (fromScreenshot.has(name) ? 'from screenshot' : undefined)

  return (
    // One card, four sections divided by hairlines, fields on the app's
    // twelve-column grid at the span their content actually wants.
    //
    // This was the annotated two-column pattern (explanation left, fields
    // right). Two things were wrong with it here. The explanation column is
    // 2fr of the page and this form has only three sections, so it stood
    // mostly empty down its whole height — measurable as two tall gaps on
    // the live page. And the fields column then split its ~1300px in two,
    // which put a phone number in a 650px box.
    //
    // Polaris does prescribe the annotated pattern, but for *settings* —
    // "separating the understanding from the configuring" so someone can
    // scan headings to find one setting among many. This is not settings.
    // It is one task, done once per dealer, top to bottom, and the whole
    // thing fits on one screen. A create-record form is the archetype
    // Attio, Linear and Salesforce all build as a single panel.
    <div className="w-full">
      <PageHeader
        title="Onboard Dealer"
        subtitle="Company name is the only thing required. Everything else can be filled in later from the dealer's own page."
      />

      {initialError && <div className="alert alert-bad">{initialError}</div>}
      {duplicate && (
        <div className="alert alert-bad">
          A dealer named &quot;{duplicate.company_name}&quot; already exists. Submit again to confirm this is a genuinely different dealer.
        </div>
      )}

      <form onSubmit={handleSubmit} className="app-card mt-6 flex flex-col gap-6">
        {/* First, because it is what you do first when the details arrived
            over WhatsApp — which is how they arrive. It fills the form and
            stops there: nothing is saved until a person reads it and presses
            the button at the bottom. */}
        <div className="form-block">
          <h2 className="form-block-title">From a screenshot</h2>
          <p className="form-block-desc">
            Send up to {MAX_IMAGES} screenshots of the WhatsApp conversation and the fields below fill themselves in. Nothing is saved until you
            check them and press Onboard dealer.
          </p>
          <label className="upload-box">
            <IconUpload />
            <span className="min-w-0 text-left">
              {reading ? 'Reading the conversation…' : 'Drop the screenshots here, or click to choose them'}
            </span>
            <input
              type="file"
              accept={ACCEPT_ATTR}
              multiple
              className="hidden"
              disabled={reading}
              onChange={(e) => {
                const files = e.target.files
                if (files?.length) handleFiles(files)
                // Cleared so choosing the same file twice still fires a change
                // — a re-read after a failure is the obvious next thing to try.
                e.target.value = ''
              }}
            />
          </label>
          {readError && <p className="mt-2 text-xs text-clay-bright">{readError}</p>}
          {readSummary && <p className="mt-2 text-xs text-paper-dim">{readSummary}</p>}
        </div>

        <div className="form-block">
          <h2 className="form-block-title">Company</h2>
          <p className="form-block-desc">
            The registered business, as it should appear on statements. Only the name is required — the SSM number can follow later.
          </p>
          <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-6 lg:grid-cols-12">
            <Field
              className="sm:col-span-4 lg:col-span-5"
              label="Company Name"
              name="company_name"
              required
              placeholder="e.g. Ipoh Trading"
              value={values.company_name}
              onChange={set}
              hint={marker('company_name')}
            />
            <Field
              className="sm:col-span-2 lg:col-span-3"
              label="Company No. (SSM)"
              name="company_no"
              placeholder="2023xxxxxx-X"
              value={values.company_no}
              onChange={set}
              hint={marker('company_no')}
            />
          </div>
        </div>

        <div className="form-block">
          <h2 className="form-block-title">Contact</h2>
          <p className="form-block-desc">
            Who to reach when a top-up needs confirming. WhatsApp is usually the fastest route — leave it blank if it&apos;s the same number.
          </p>
          <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-6 lg:grid-cols-12">
            <Field
              className="sm:col-span-3 lg:col-span-3"
              label="Contact Person"
              name="contact_person"
              placeholder="Person in charge"
              value={values.contact_person}
              onChange={set}
              hint={marker('contact_person')}
            />
            <Field
              className="sm:col-span-3 lg:col-span-3"
              label="Phone Number"
              name="phone"
              placeholder="01x-xxxxxxx"
              value={values.phone}
              onChange={set}
              hint={marker('phone')}
            />
            <Field
              className="sm:col-span-3 lg:col-span-3"
              label="WhatsApp Number"
              name="whatsapp"
              placeholder="Same as phone"
              value={values.whatsapp}
              onChange={set}
              hint={marker('whatsapp')}
            />
            <Field
              className="sm:col-span-3 lg:col-span-3"
              label="Email"
              name="email"
              type="email"
              placeholder="dealer@mail.com"
              value={values.email}
              onChange={set}
              hint={marker('email')}
            />
          </div>
        </div>

        <div className="form-block">
          <h2 className="form-block-title">Region &amp; package</h2>
          <p className="form-block-desc">
            Region drives the dashboard&apos;s regional breakdown. The package sets their commission rate — you can assign or change it any time
            after onboarding.
          </p>
          <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-6 lg:grid-cols-12">
            <div className="sm:col-span-3 lg:col-span-4">
              <FieldLabel label="Region" hint={marker('region')} />
              <TextAutocomplete
                name="region"
                value={values.region}
                onChange={(v) => set('region', v)}
                suggestions={REGIONS}
                placeholder="Select or type a region"
              />
            </div>
            <div className="sm:col-span-3 lg:col-span-4">
              {/* No hint here, ever. The reader is not given the package field
                  — the rate a dealer gets is a commercial decision, not
                  something to be lifted out of a chat log. */}
              <label className="field-label">Initial package</label>
              <Listbox
                name="package"
                defaultValue=""
                options={[
                  { value: '', label: 'Not set yet' },
                  ...(Object.keys(PACKAGES) as (keyof typeof PACKAGES)[]).map((code) => ({
                    value: code,
                    label: `${PACKAGES[code].name} · RM${PACKAGES[code].price} · ${PACKAGES[code].reload} pts · ${PACKAGES[code].rate}%`,
                  })),
                ]}
              />
            </div>
            <div className="sm:col-span-6 lg:col-span-6">
              <FieldLabel label="Address" hint={marker('address')} />
              <input
                name="address"
                value={values.address}
                onChange={(e) => set('address', e.target.value)}
                placeholder="Unit, street, postcode, city — used for SIM delivery"
                className="field-input"
              />
            </div>
            <div className="sm:col-span-6 lg:col-span-6">
              <label className="field-label">Notes (optional)</label>
              <textarea
                name="notes"
                rows={2}
                value={values.notes}
                onChange={(e) => set('notes', e.target.value)}
                placeholder="Anything worth remembering about this dealer"
                className="field-input resize-none"
              />
            </div>
          </div>
        </div>

        {/* Inside the card, on the same rule that closes the last section —
            the submit used to sit on the bare canvas below everything with
            nothing under it, so the page ended on 200px of nothing. */}
        <div className="flex flex-wrap items-center gap-4 border-t border-ink-800 pt-6">
          <button type="submit" disabled={checking || submitting || reading} className="btn-primary">
            {checking ? 'Checking for duplicates…' : duplicate ? 'Yes, onboard this dealer' : 'Onboard dealer'}
          </button>
          <span className="text-[12px] text-paper-dim">Only the company name is required.</span>
        </div>
      </form>
    </div>
  )
}

function FieldLabel({ label, required, hint }: { label: string; required?: boolean; hint?: string }) {
  return (
    <label className="field-label flex items-center gap-2">
      <span>
        {label}
        {required && <span className="req"> *</span>}
      </span>
      {/* Deliberately quieter than the label it sits beside: it is a note
          about where the value came from, not a second label. */}
      {hint && <span className="text-[12px] font-medium text-brass">{hint}</span>}
    </label>
  )
}

function Field({
  label,
  name,
  type = 'text',
  required,
  placeholder,
  value,
  onChange,
  hint,
  className,
}: {
  label: string
  name: FieldName
  type?: string
  required?: boolean
  placeholder?: string
  value: string
  onChange: (name: FieldName, v: string) => void
  /** Shown beside the label while this value is one nobody has checked yet. */
  hint?: string
  /** Grid span. A field is as wide as what goes in it. */
  className?: string
}) {
  return (
    <div className={className}>
      <FieldLabel label={label} required={required} hint={hint} />
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
        className="field-input"
      />
    </div>
  )
}
