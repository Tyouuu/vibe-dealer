import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { getDealerActivityMap } from '@/lib/dealer-activity'
import { IconSearch } from '../icons'
import { DealersTable, type DealerRow } from './dealers-table'
import { ImportDealersButton } from './import-dealers-button'
import { Listbox } from '../listbox'

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

type View = 'all' | 'region' | 'inactive'

type PageProps = {
  searchParams: Promise<{
    q?: string
    region?: string
    onboarded?: string
    view?: string
    imported?: string
    skipped_dup?: string
    skipped_invalid?: string
    import_error?: string
  }>
}

export default async function DealersPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const {
    q = '',
    region = 'all',
    onboarded,
    view: rawView = 'all',
    imported,
    skipped_dup: skippedDup,
    skipped_invalid: skippedInvalid,
    import_error: importError,
  } = await searchParams
  const view: View = rawView === 'region' || rawView === 'inactive' ? rawView : 'all'
  const canManage = user.role === 'cs' || user.role === 'master'
  // rate is a commission figure (PROJECT_SPEC.md section 4: "CS 看不到财务") —
  // strip it from the data sent to the client, not just hide it in the UI.
  const showRate = user.role !== 'cs'

  const supabase = await createClient()

  let query = supabase
    .from('dealers')
    .select('id, company_name, company_no, contact_person, phone, region, package, rate, status', { count: 'exact' })
    .order('company_name', { ascending: true })

  if (q) {
    // Strip characters with special meaning in PostgREST's .or() filter syntax
    // so a search term can't break out of the intended filter structure.
    const safeQ = q.replace(/[,()%]/g, '')
    if (safeQ) {
      query = query.or(`company_name.ilike.%${safeQ}%,region.ilike.%${safeQ}%,contact_person.ilike.%${safeQ}%`)
    }
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

  let rows: DealerRow[] = ((dealers as Dealer[] | null) ?? []).map((d) => {
    const activity = activityMap.get(d.id)
    return {
      ...d,
      rate: showRate ? d.rate : null,
      isInactive: activity?.isInactive ?? false,
      isSeverelyInactive: activity?.isSeverelyInactive ?? false,
      daysSinceLastActivity: activity?.daysSinceLastActivity ?? null,
    }
  })

  if (view === 'inactive') {
    rows = rows.filter((r) => r.isInactive)
  }

  function viewHref(v: View) {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (region !== 'all') params.set('region', region)
    if (v !== 'all') params.set('view', v)
    const qs = params.toString()
    return `/dealers${qs ? `?${qs}` : ''}`
  }

  const hasFilter = Boolean(q) || region !== 'all'

  const exportParams = new URLSearchParams()
  if (q) exportParams.set('q', q)
  if (region !== 'all') exportParams.set('region', region)
  if (view !== 'all') exportParams.set('view', view)
  const exportHref = `/api/dealers/export${exportParams.toString() ? `?${exportParams.toString()}` : ''}`

  return (
    <div className="app-card">
      {onboarded && <div className="alert alert-ok">Dealer onboarded successfully.</div>}
      {imported && (
        <div className="alert alert-ok">
          Imported {imported} dealer{imported === '1' ? '' : 's'}.
          {skippedDup && Number(skippedDup) > 0 ? ` Skipped ${skippedDup} duplicate${skippedDup === '1' ? '' : 's'}.` : ''}
          {skippedInvalid && Number(skippedInvalid) > 0
            ? ` Skipped ${skippedInvalid} row${skippedInvalid === '1' ? '' : 's'} with no company name.`
            : ''}
        </div>
      )}
      {importError && <div className="alert alert-bad">{importError}</div>}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[26px] font-extrabold tracking-tight text-paper">Dealers</h1>
        <span className="pill pill-neutral">{count ?? 0} dealers</span>
      </div>

      <div className="mb-4 segmented" role="group" aria-label="Saved views">
        <Link href={viewHref('all')} className={`segmented-btn ${view === 'all' ? 'active' : ''}`}>
          All
        </Link>
        <Link href={viewHref('region')} className={`segmented-btn ${view === 'region' ? 'active' : ''}`}>
          By Region
        </Link>
        <Link href={viewHref('inactive')} className={`segmented-btn ${view === 'inactive' ? 'active' : ''}`}>
          Inactive
        </Link>
      </div>

      <form className="mb-4 flex flex-wrap gap-3" action="/dealers" method="GET">
        {view !== 'all' && <input type="hidden" name="view" value={view} />}
        <label className="mini-search w-72 max-w-full transition-colors focus-within:border-primary">
          <IconSearch className="h-4 w-4 shrink-0" />
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search company, region, contact…"
            className="w-full bg-transparent text-sm text-paper outline-none placeholder:text-paper-dim/70"
          />
        </label>
        <div className="w-44">
          <Listbox name="region" defaultValue={region} options={[{ value: 'all', label: 'All Regions' }, ...regions.map((r) => ({ value: r, label: r }))]} />
        </div>
        <button type="submit" className="btn-primary">
          Filter
        </button>
        <div className="ml-auto flex items-center gap-2">
          <a href={exportHref} className="btn-ghost">
            ⤓ Export
          </a>
          {canManage && <ImportDealersButton />}
        </div>
      </form>

      {rows.length ? (
        <DealersTable dealers={rows} groupByRegion={view === 'region'} canManage={canManage} showRate={showRate} />
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-ink-800 py-12 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-ink-850 text-paper-dim">
            <IconSearch className="h-5 w-5" />
          </span>
          <p className="text-sm text-paper-dim">
            {hasFilter
              ? `No dealers match${q ? ` "${q}"` : ''}${region !== 'all' ? ` in ${region}` : ''}.`
              : view === 'inactive'
                ? 'No inactive dealers right now.'
                : 'No dealers yet.'}
          </p>
          {hasFilter && (
            <Link href={viewHref(view)} className="btn-ghost text-xs">
              Clear filters
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
