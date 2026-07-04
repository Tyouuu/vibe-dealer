import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/dal'
import { PACKAGES } from '@/lib/packages'
import { createDealer } from './actions'

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
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-400">
        Your role ({user.role}) does not have permission to onboard dealers.
      </div>
    )
  }

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <h1 className="mb-4 text-base font-bold text-zinc-50">🧾 Onboard Dealer</h1>

        {error && (
          <div className="mb-4 rounded-lg border border-red-800 bg-red-950/50 px-3.5 py-2.5 text-sm text-red-300">
            {error}
          </div>
        )}

        <form action={createDealer} className="flex flex-col gap-3.5">
          <Field label="Company Name" name="company_name" required placeholder="e.g. Ipoh Trading" />
          <Field label="Company No. (SSM)" name="company_no" placeholder="2023xxxxxx-X" />
          <Field label="Contact Person" name="contact_person" placeholder="Person in charge" />
          <Field label="Phone Number" name="phone" placeholder="01x-xxxxxxx" />
          <Field label="Email" name="email" type="email" placeholder="dealer@mail.com" />
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-zinc-400">Region</label>
            <input
              list="regions"
              name="region"
              placeholder="Select or type a region"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2.5 text-sm text-zinc-100 outline-none focus:border-violet-500"
            />
            <datalist id="regions">
              {REGIONS.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-zinc-400">Initial Package (optional, can change later)</label>
            <select
              name="package"
              defaultValue=""
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2.5 text-sm text-zinc-100 outline-none focus:border-violet-500"
            >
              <option value="">Not set yet</option>
              {(Object.keys(PACKAGES) as (keyof typeof PACKAGES)[]).map((code) => (
                <option key={code} value={code}>
                  {PACKAGES[code].name} · RM{PACKAGES[code].price} · {PACKAGES[code].rate}%
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="mt-2 w-full rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-500"
          >
            Onboard Dealer
          </button>
        </form>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <h3 className="mb-2 text-sm font-bold text-zinc-50">Why onboarding happens here</h3>
        <p className="rounded-lg border-l-2 border-violet-500 bg-zinc-800/60 px-3.5 py-2.5 text-xs leading-relaxed text-zinc-400">
          Every dealer is onboarded by your team directly. Making &quot;onboarding = added to the system&quot; guarantees no
          dealer is ever missed. The details you fill in here carry over to every transaction automatically, no
          re-typing needed.
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
      <label className="mb-1.5 block text-xs font-semibold text-zinc-400">{label}</label>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2.5 text-sm text-zinc-100 outline-none focus:border-violet-500"
      />
    </div>
  )
}
