'use client'

import { useState } from 'react'
import { PACKAGES } from '@/lib/packages'
import { REGIONS } from '@/lib/regions'
import { createDealer, checkDuplicateDealer } from './actions'
import { IconBuilding, IconPhone, IconMapPin } from '../icons'
import { Listbox } from '../listbox'
import { TextAutocomplete } from '../text-autocomplete'
import { AnnotatedSection } from '../annotated-section'

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
    // Full content width, with each section split into an explanation column
    // and a fields column (see AnnotatedSection). Capping the whole form at
    // max-w-2xl left a third of a wide screen unclaimed; stretching the fields
    // instead would put a 500px box around a phone number.
    <div className="w-full">
      <h1 className="mb-4 page-title">Onboard Dealer</h1>

      {initialError && <div className="alert alert-bad">{initialError}</div>}
      {duplicate && (
        <div className="alert alert-bad">
          A dealer named &quot;{duplicate.company_name}&quot; already exists. Submit again to confirm this is a genuinely different dealer.
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-1">
        <AnnotatedSection
          icon={<IconBuilding />}
          title="Company Details"
          description="The registered business, as it should appear on statements. Only the name is required — the SSM number can follow later."
        >
          <div className="form-grid max-w-xl">
            <Field label="Company Name" name="company_name" required placeholder="e.g. Ipoh Trading" onChange={() => setDuplicate(null)} />
            <Field label="Company No. (SSM)" name="company_no" placeholder="2023xxxxxx-X" />
          </div>
        </AnnotatedSection>

        <AnnotatedSection
          icon={<IconPhone />}
          title="Contact Info"
          description="Who to reach when a top-up needs confirming. WhatsApp is usually the fastest route — leave it blank if it's the same number."
        >
          <div className="form-grid max-w-xl">
            <Field label="Contact Person" name="contact_person" placeholder="Person in charge" />
            <Field label="Phone Number" name="phone" placeholder="01x-xxxxxxx" />
            <Field label="WhatsApp Number" name="whatsapp" placeholder="Leave blank if same as phone" />
            <div>
              <Field label="Email" name="email" type="email" placeholder="dealer@mail.com" />
            </div>
          </div>
        </AnnotatedSection>

        <AnnotatedSection
          icon={<IconMapPin />}
          title="Region &amp; Package"
          description="Region drives the dashboard's regional breakdown. The package sets their commission rate — you can assign or change it any time after onboarding."
        >
          <div className="form-grid max-w-xl">
            <div>
              <label className="field-label">Region</label>
              <TextAutocomplete name="region" suggestions={REGIONS} placeholder="Select or type a region" />
            </div>
            <div>
              <label className="field-label">Initial Package (optional, can change later)</label>
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
            <div className="sm:col-span-2">
              <label className="field-label">Address</label>
              <input name="address" placeholder="Unit, street, postcode, city — used for SIM delivery" className="field-input" />
            </div>
            <div className="sm:col-span-2">
              <label className="field-label">Notes (optional)</label>
              <textarea name="notes" rows={2} placeholder="Anything worth remembering about this dealer" className="field-input resize-none" />
            </div>
          </div>
        </AnnotatedSection>

        <div className="mt-6 border-t border-ink-800 pt-6">
          <button type="submit" disabled={checking || submitting} className="btn-primary">
            {checking ? 'Checking for duplicates…' : duplicate ? 'Yes, Onboard This Dealer' : 'Onboard Dealer'}
          </button>
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
}: {
  label: string
  name: string
  type?: string
  required?: boolean
  placeholder?: string
  onChange?: () => void
}) {
  return (
    <div>
      <label className="field-label">
        {label}
        {required && <span className="req"> *</span>}
      </label>
      <input name={name} type={type} required={required} placeholder={placeholder} onChange={onChange} className="field-input" />
    </div>
  )
}
