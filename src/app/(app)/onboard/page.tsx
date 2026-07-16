import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/dal'
import { PACKAGES } from '@/lib/packages'
import { createDealer } from './actions'
import { IconBuilding, IconPhone, IconMapPin } from '../icons'
import { Listbox } from '../listbox'

export const metadata: Metadata = {
  title: 'Onboard Dealer — DealerHub',
}

const REGIONS = [
  'Ipoh',
  'Penang',
  'KL',
  'Johor',
  'Klang',
  'Melaka',
  'Seremban',
  'Kuantan',
  'Taiping',
  'Teluk Intan',
  'Sitiawan',
  'Kampar',
]

type PageProps = {
  searchParams: Promise<{ error?: string }>
}

export default async function OnboardPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { error } = await searchParams

  if (user.role !== 'cs' && user.role !== 'master') {
    return <div className="app-card text-sm text-paper-dim">Your role ({user.role}) does not have permission to onboard dealers.</div>
  }

  return (
    <div className="grid gap-5 md:grid-cols-[1.3fr_1fr]">
      <div className="app-card">
        <h1 className="mb-4 text-[26px] font-extrabold tracking-tight text-paper">Onboard Dealer</h1>

        {error && <div className="alert alert-bad">{error}</div>}

        <form action={createDealer} className="flex flex-col gap-3.5">
          <div className="form-section-head">
            <span className="tile">
              <IconBuilding />
            </span>
            <span>Company Details</span>
            <span className="rule" />
          </div>
          <div className="form-grid">
            <Field label="Company Name" name="company_name" required placeholder="e.g. Ipoh Trading" />
            <Field label="Company No. (SSM)" name="company_no" placeholder="2023xxxxxx-X" />
          </div>

          <div className="form-section-head">
            <span className="tile">
              <IconPhone />
            </span>
            <span>Contact Info</span>
            <span className="rule" />
          </div>
          <div className="form-grid">
            <Field label="Contact Person" name="contact_person" placeholder="Person in charge" />
            <Field label="Phone Number" name="phone" placeholder="01x-xxxxxxx" />
            <div className="sm:col-span-2">
              <Field label="Email" name="email" type="email" placeholder="dealer@mail.com" />
            </div>
          </div>

          <div className="form-section-head">
            <span className="tile">
              <IconMapPin />
            </span>
            <span>Region &amp; Package</span>
            <span className="rule" />
          </div>
          <div className="form-grid">
            <div>
              <label className="field-label">Region</label>
              <input list="regions" name="region" placeholder="Select or type a region" className="field-input" />
              <datalist id="regions">
                {REGIONS.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
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
          </div>
          <button type="submit" className="btn-primary mt-2">
            Onboard Dealer
          </button>
        </form>
      </div>

      <div className="app-card">
        <h3 className="mb-2 text-sm font-bold text-paper">Why onboarding happens here</h3>
        <p className="note-strip mt-0">
          New dealers are added directly by CS or Master so the ledger has a single source of truth for company
          details, region, and starting package — no separate spreadsheet to keep in sync. Once onboarded, the
          dealer immediately appears in the Dealers list and can be selected in New Transaction.
        </p>
      </div>
    </div>
  )
}

function Field({
  label,
  name,
  type = 'text',
  required,
  placeholder,
}: {
  label: string
  name: string
  type?: string
  required?: boolean
  placeholder?: string
}) {
  return (
    <div>
      <label className="field-label">
        {label}
        {required && <span className="req"> *</span>}
      </label>
      <input name={name} type={type} required={required} placeholder={placeholder} className="field-input" />
    </div>
  )
}
