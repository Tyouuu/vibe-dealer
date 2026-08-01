'use client'

import { useState } from 'react'
import { PACKAGES } from '@/lib/packages'
import { REGIONS } from '@/lib/regions'
import { createDealer, checkDuplicateDealer } from './actions'
import { Listbox } from '../listbox'
import { TextAutocomplete } from '../text-autocomplete'
import { PageHeader } from '../page-header'

export function OnboardForm({ initialError }: { initialError?: string }) {
  const [duplicate, setDuplicate] = useState<{ id: string; company_name: string } | null>(null)
  const [checking, setChecking] = useState(false)
  const [submitting, setSubmitting] = useState(false)

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

  return (
    // One card, three sections divided by hairlines, fields on the app's
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
        title="Onboard dealer"
        subtitle="Company name is the only thing required. Everything else can be filled in later from the dealer's own page."
      />

      {initialError && <div className="alert alert-bad">{initialError}</div>}
      {duplicate && (
        <div className="alert alert-bad">
          A dealer named &quot;{duplicate.company_name}&quot; already exists. Submit again to confirm this is a genuinely different dealer.
        </div>
      )}

      <form onSubmit={handleSubmit} className="app-card mt-6 flex flex-col gap-6">
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
              onChange={() => setDuplicate(null)}
            />
            <Field className="sm:col-span-2 lg:col-span-3" label="Company No. (SSM)" name="company_no" placeholder="2023xxxxxx-X" />
          </div>
        </div>

        <div className="form-block">
          <h2 className="form-block-title">Contact</h2>
          <p className="form-block-desc">
            Who to reach when a top-up needs confirming. WhatsApp is usually the fastest route — leave it blank if it&apos;s the same number.
          </p>
          <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-6 lg:grid-cols-12">
            <Field className="sm:col-span-3 lg:col-span-3" label="Contact Person" name="contact_person" placeholder="Person in charge" />
            <Field className="sm:col-span-3 lg:col-span-3" label="Phone Number" name="phone" placeholder="01x-xxxxxxx" />
            <Field className="sm:col-span-3 lg:col-span-3" label="WhatsApp Number" name="whatsapp" placeholder="Same as phone" />
            <Field className="sm:col-span-3 lg:col-span-3" label="Email" name="email" type="email" placeholder="dealer@mail.com" />
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
              <label className="field-label">Region</label>
              <TextAutocomplete name="region" suggestions={REGIONS} placeholder="Select or type a region" />
            </div>
            <div className="sm:col-span-3 lg:col-span-4">
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
              <label className="field-label">Address</label>
              <input name="address" placeholder="Unit, street, postcode, city — used for SIM delivery" className="field-input" />
            </div>
            <div className="sm:col-span-6 lg:col-span-6">
              <label className="field-label">Notes (optional)</label>
              <textarea name="notes" rows={2} placeholder="Anything worth remembering about this dealer" className="field-input resize-none" />
            </div>
          </div>
        </div>

        {/* Inside the card, on the same rule that closes the last section —
            the submit used to sit on the bare canvas below everything with
            nothing under it, so the page ended on 200px of nothing. */}
        <div className="flex flex-wrap items-center gap-4 border-t border-ink-800 pt-6">
          <button type="submit" disabled={checking || submitting} className="btn-primary">
            {checking ? 'Checking for duplicates…' : duplicate ? 'Yes, onboard this dealer' : 'Onboard dealer'}
          </button>
          <span className="text-[12px] text-paper-dim">Only the company name is required.</span>
        </div>
      </form>
    </div>
  )
}

function Field({
  label,
  name,
  type = 'text',
  required,
  placeholder,
  onChange,
  className,
}: {
  label: string
  name: string
  type?: string
  required?: boolean
  placeholder?: string
  onChange?: () => void
  /** Grid span. A field is as wide as what goes in it. */
  className?: string
}) {
  return (
    <div className={className}>
      <label className="field-label">
        {label}
        {required && <span className="req"> *</span>}
      </label>
      <input name={name} type={type} required={required} placeholder={placeholder} onChange={onChange} className="field-input" />
    </div>
  )
}
