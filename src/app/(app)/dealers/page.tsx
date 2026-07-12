import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getDealerActivityMap } from '@/lib/dealer-activity'

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
  A: 'pill-neutral',
  B: 'pill-jade',
  C: 'pill-brass',
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

  const [{ data: dealers, count }, { data: regionRows }, activityMap] = await Promise.all([
    query,
    supabase.from('dealers').select('region').not('region', 'is', null),
    getDealerActivityMap(supabase),
  ])

  const regions = Array.from(new Set((regionRows ?? []).map((r) => r.region))).sort() as string[]

  return (
    <div className="app-card">
      {onboarded && <div className="alert alert-ok">Dealer onboarded successfully.</div>}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-base font-bold text-paper">Dealers</h1>
        <span className="pill pill-neutral">{count ?? 0} dealers</span>
      </div>

      <form className="mb-4 flex flex-wrap gap-3" action="/dealers" method="GET">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Search company / region / contact"
          className="field-input w-72 max-w-full"
        />
        <select name="region" defaultValue={region} className="field-input w-auto">
          <option value="all">All Regions</option>
          {regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button type="submit" className="btn-primary">
          Filter
        </button>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="th">Company</th>
              <th className="th">Region</th>
              <th className="th">Phone</th>
              <th className="th">Contact</th>
              <th className="th">Package</th>
              <th className="th">Rate</th>
              <th className="th">Status</th>
            </tr>
          </thead>
          <tbody>
            {(dealers as Dealer[] | null)?.map((d) => {
              const activity = activityMap.get(d.id)
              return (
                <tr key={d.id} className="tr-row">
                  <td className="td">
                    <div className="flex items-center gap-2">
                      <Link href={`/dealers/${d.id}`} className="font-semibold text-paper hover:text-jade-bright">
                        {d.company_name}
                      </Link>
                      {activity?.isInactive && (
                        <span className="pill pill-clay">{activity.daysSinceLastActivity}d</span>
                      )}
                    </div>
                    {d.company_no && <div className="text-[11px] text-paper-dim">{d.company_no}</div>}
                  </td>
                  <td className="td text-paper-dim">{d.region ?? '—'}</td>
                  <td className="td figure text-paper-dim">{d.phone ?? '—'}</td>
                  <td className="td text-paper-dim">{d.contact_person ?? '—'}</td>
                  <td className="td">
                    {d.package ? (
                      <span className={`pill ${PACKAGE_STYLE[d.package]}`}>{d.package}</span>
                    ) : (
                      <span className="text-paper-dim/50">—</span>
                    )}
                  </td>
                  <td className="td figure text-paper-dim">{d.rate != null ? `${d.rate}%` : '—'}</td>
                  <td className="td">
                    <span className={d.status === 'active' ? 'pill pill-jade' : 'pill pill-neutral'}>
                      {d.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              )
            })}
            {!dealers?.length && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-paper-dim">
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
