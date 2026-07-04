import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: 'Dealers — DealerHub',
}

type Dealer = {
  id: string
  company_name: string
  company_no: string | null
  contact_person: string | null
  phone: string | null
  region: string | null
  package: 'A' | 'B' | 'C' | null
  rate: number | null
  status: 'active' | 'inactive'
}

const PACKAGE_STYLE: Record<string, string> = {
  A: 'bg-zinc-500/15 text-zinc-300',
  B: 'bg-emerald-500/15 text-emerald-400',
  C: 'bg-amber-400/15 text-amber-300',
}

type PageProps = {
  searchParams: Promise<{ q?: string; region?: string; onboarded?: string }>
}

export default async function DealersPage({ searchParams }: PageProps) {
  const { q = '', region = 'all', onboarded } = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('dealers')
    .select(
      'id, company_name, company_no, contact_person, phone, region, package, rate, status',
      { count: 'exact' }
    )
    .order('company_name', { ascending: true })

  if (q) {
    query = query.or(`company_name.ilike.%${q}%,region.ilike.%${q}%,contact_person.ilike.%${q}%`)
  }
  if (region !== 'all') {
    query = query.eq('region', region)
  }

  const [{ data: dealers, count }, { data: regionRows }] = await Promise.all([
    query,
    supabase.from('dealers').select('region').not('region', 'is', null),
  ])

  const regions = Array.from(new Set((regionRows ?? []).map((r) => r.region))).sort() as string[]

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      {onboarded && (
        <div className="mb-4 rounded-lg border border-emerald-800 bg-emerald-950/50 px-3.5 py-2.5 text-sm text-emerald-300">
          Dealer onboarded successfully.
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-base font-bold text-zinc-50">Dealers</h1>
        <span className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-400">
          {count ?? 0} dealers
        </span>
      </div>

      <form className="mb-4 flex flex-wrap gap-3" action="/dealers" method="GET">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="🔍 Search company / region / contact"
          className="w-72 max-w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2 text-sm text-zinc-100 outline-none focus:border-violet-500"
        />
        <select
          name="region"
          defaultValue={region}
          className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-500"
        >
          <option value="all">All Regions</option>
          {regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500"
        >
          Filter
        </button>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-[11px] font-bold uppercase tracking-wide text-zinc-500">
              <th className="px-3 py-2.5">Company</th>
              <th className="px-3 py-2.5">Region</th>
              <th className="px-3 py-2.5">Phone</th>
              <th className="px-3 py-2.5">Contact</th>
              <th className="px-3 py-2.5">Package</th>
              <th className="px-3 py-2.5">Rate</th>
              <th className="px-3 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {(dealers as Dealer[] | null)?.map((d) => (
              <tr key={d.id} className="border-b border-zinc-800 last:border-none hover:bg-zinc-800/50">
                <td className="px-3 py-2.5">
                  <div className="font-semibold text-zinc-100">{d.company_name}</div>
                  {d.company_no && <div className="text-[11px] text-zinc-500">{d.company_no}</div>}
                </td>
                <td className="px-3 py-2.5 text-zinc-400">{d.region ?? '—'}</td>
                <td className="px-3 py-2.5 text-zinc-400">{d.phone ?? '—'}</td>
                <td className="px-3 py-2.5 text-zinc-400">{d.contact_person ?? '—'}</td>
                <td className="px-3 py-2.5">
                  {d.package ? (
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${PACKAGE_STYLE[d.package]}`}
                    >
                      {d.package}
                    </span>
                  ) : (
                    <span className="text-zinc-600">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-zinc-300">{d.rate != null ? `${d.rate}%` : '—'}</td>
                <td className="px-3 py-2.5">
                  <span
                    className={
                      d.status === 'active'
                        ? 'rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-400'
                        : 'rounded-full bg-zinc-500/15 px-2.5 py-0.5 text-xs font-bold text-zinc-400'
                    }
                  >
                    {d.status === 'active' ? 'Active' : 'Inactive'}
                  </span>
                </td>
              </tr>
            ))}
            {!dealers?.length && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-zinc-500">
                  No matching dealers.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
