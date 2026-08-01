import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { getDealerActivityMap } from '@/lib/dealer-activity'
import { getDealerRankingMap, type DealerRanking } from '@/lib/dealer-ranking'
import { sanitizeSearchTerm } from '@/lib/search'
import { IconSearch } from '../icons'
import { DealersTable, type DealerRow } from './dealers-table'
import { ImportDealersButton } from './import-dealers-button'
import { Listbox } from '../listbox'
import { PageHeader } from '../page-header'
import { HeroCard } from '../hero-card'
import { EmptyState } from '../empty-state'
import { FilterChips } from '../filter-chips'

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
}

type View = 'all' | 'region' | 'inactive'

const PAGE_SIZE = 50

type PageProps = {
  searchParams: Promise<{
    q?: string
    region?: string
    onboarded?: string
    deleted?: string
    view?: string
    imported?: string
    skipped_dup?: string
    skipped_invalid?: string
    import_error?: string
    page?: string
  }>
}

export default async function DealersPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const {
    q = '',
    region = 'all',
    onboarded,
    deleted,
    view: rawView = 'all',
    imported,
    skipped_dup: skippedDup,
    skipped_invalid: skippedInvalid,
    import_error: importError,
    page,
  } = await searchParams
  const view: View = rawView === 'region' || rawView === 'inactive' ? rawView : 'all'
  const canManage = user.role === 'cs' || user.role === 'master'
  // rate is a commission figure (PROJECT_SPEC.md section 4: "CS 看不到财务") —
  // strip it from the data sent to the client, not just hide it in the UI.
  const showRate = user.role !== 'cs'
  // Same boundary as rate: ranking is derived from transactions.points, and
  // cs has no SELECT on transactions at all (0001) — querying it would just
  // come back empty under RLS, silently showing everyone as unranked rather
  // than actually failing, so skip the query and the columns entirely.
  const showRanking = user.role !== 'cs'

  const supabase = await createClient()

  // cs has no SELECT on the dealers base table (0015 — rate is a commission
  // figure PROJECT_SPEC.md says cs must never see, enforced at the DB layer
  // now, not just by stripping it below) — read through dealers_directory
  // instead, which has every column except rate.
  let query = supabase
    .from(showRate ? 'dealers' : 'dealers_directory')
    .select(showRate ? 'id, company_name, company_no, contact_person, phone, region, package, rate' : 'id, company_name, company_no, contact_person, phone, region, package', { count: 'exact' })

  if (q) {
    // Strip characters with special meaning in PostgREST's .or() filter syntax
    // so a search term can't break out of the intended filter structure.
    const safeQ = sanitizeSearchTerm(q)
    if (safeQ) {
      query = query.or(`company_name.ilike.%${safeQ}%,region.ilike.%${safeQ}%,contact_person.ilike.%${safeQ}%`)
    }
  }
  if (region !== 'all') {
    query = query.eq('region', region)
  }

  const [{ data: dealers, count }, { data: regionRows }, activityMap, rankingMap] = await Promise.all([
    query,
    supabase.from('dealers_directory').select('region').not('region', 'is', null),
    getDealerActivityMap(supabase),
    showRanking ? getDealerRankingMap(supabase) : Promise.resolve(new Map<string, DealerRanking>()),
  ])

  const regions = Array.from(new Set((regionRows ?? []).map((r) => r.region))).sort() as string[]

  let rows: DealerRow[] = ((dealers as (Dealer & { rate?: number | null })[] | null) ?? []).map((d) => {
    const activity = activityMap.get(d.id)
    const ranking = rankingMap.get(d.id)
    return {
      ...d,
      rate: showRate ? (d.rate ?? null) : null,
      totalPoints: ranking?.totalPoints ?? 0,
      rank: ranking?.rank ?? null,
      isInactive: activity?.isInactive ?? false,
      isSeverelyInactive: activity?.isSeverelyInactive ?? false,
      daysSinceLastActivity: activity?.daysSinceLastActivity ?? null,
    }
  })

  if (view === 'inactive') {
    rows = rows.filter((r) => r.isInactive)
  }

  // Dealers who've actually topped up rank to the top by volume; dealers
  // with nothing recorded yet sink to the bottom, alphabetically among
  // themselves — replaces the old manually-toggled Active/Inactive status.
  rows.sort((a, b) => b.totalPoints - a.totalPoints || a.company_name.localeCompare(b.company_name))

  // The header pill below shows `count` (the DB's pre-filter total) for
  // 'all'/'region', but the inactive view filters client-side afterward —
  // showing the same `count` there would visibly contradict the table
  // sitting right below it (and the "Needs Follow-up" KPI card that links here).
  const displayCount = view === 'inactive' ? rows.length : (count ?? 0)

  // Summary figures for the header. Derived from `rows` — the set matching the
  // current filters — rather than from the whole table, so the summary can
  // never contradict the list sitting directly beneath it. That was already a
  // live problem here: `count` is the DB's pre-filter total, and the inactive
  // view filters afterward in JS, which is why displayCount exists at all.
  const sellingCount = rows.filter((r) => r.totalPoints > 0).length
  const quietCount = rows.filter((r) => r.isInactive).length
  const noRegionCount = rows.filter((r) => !r.region).length

  // Sliced in JS rather than via .range() on the query (the pattern /records
  // uses) — rank comes from transactions.points aggregated separately, not a
  // column the DB query can .order() by, so the full filtered set has to be
  // fetched and sorted before pagination can mean "page 1 = the top-ranked
  // dealers" instead of an arbitrary slice re-sorted page-by-page.
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const pageNum = Math.min(totalPages, Math.max(1, Math.trunc(Number(page)) || 1))
  const pageRows = rows.slice((pageNum - 1) * PAGE_SIZE, pageNum * PAGE_SIZE)

  function viewHref(v: View) {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (region !== 'all') params.set('region', region)
    if (v !== 'all') params.set('view', v)
    const qs = params.toString()
    return `/dealers${qs ? `?${qs}` : ''}`
  }

  function pageHref(p: number) {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (region !== 'all') params.set('region', region)
    if (view !== 'all') params.set('view', view)
    if (p > 1) params.set('page', String(p))
    const qs = params.toString()
    return `/dealers${qs ? `?${qs}` : ''}`
  }

  // Each chip's href is the current URL minus that one filter, so removing
  // "Region: Ipoh" keeps the search term and the view.
  function withoutFilter(drop: 'q' | 'region') {
    const params = new URLSearchParams()
    if (q && drop !== 'q') params.set('q', q)
    if (region !== 'all' && drop !== 'region') params.set('region', region)
    if (view !== 'all') params.set('view', view)
    const qs = params.toString()
    return `/dealers${qs ? `?${qs}` : ''}`
  }

  const filterChips = [
    ...(q ? [{ label: 'Search', value: q, removeHref: withoutFilter('q') }] : []),
    ...(region !== 'all' ? [{ label: 'Region', value: region, removeHref: withoutFilter('region') }] : []),
  ]

  const hasFilter = Boolean(q) || region !== 'all'

  const exportParams = new URLSearchParams()
  if (q) exportParams.set('q', q)
  if (region !== 'all') exportParams.set('region', region)
  if (view !== 'all') exportParams.set('view', view)
  const exportHref = `/api/dealers/export${exportParams.toString() ? `?${exportParams.toString()}` : ''}`

  return (
    <>
      {/* Header lives on the page surface, not inside the card — see
          PageHeader for why. */}
      {/* Polaris's resource index prescription — resource type as the page
          title, the create action top right, filtering at the top of the index
          itself — was already followed here. What the page never did was say
          anything about the population it lists: 249 rows, and no answer to
          "how many of these are actually trading". */}
      <PageHeader
        title="Dealers"
        subtitle="Everyone who buys points from us, ranked by what they've topped up."
        action={canManage ? { href: '/onboard', label: 'Onboard dealer' } : undefined}
      />

      <HeroCard
        label={view === 'inactive' ? 'Dealers needing follow-up' : q || region !== 'all' ? 'Dealers matching this filter' : 'Dealers'}
        value={displayCount.toLocaleString()}
        chgSuffix={regions.length ? `across ${regions.length} region${regions.length === 1 ? '' : 's'}` : undefined}
        href="/dealers"
        stats={[
          {
            // getDealerRankingMap sums every verified transaction ever, not
            // the current month — so this cannot be labelled "this period".
            label: 'Ever topped up',
            value: sellingCount.toLocaleString(),
            href: '/records?status=verified',
            sub: 'has verified volume on record',
          },
          {
            label: 'Gone quiet',
            value: quietCount.toLocaleString(),
            href: viewHref('inactive'),
            tone: quietCount ? 'caution' : 'normal',
            sub: 'no verified top-up in 30+ days',
          },
          {
            label: 'No region set',
            value: noRegionCount.toLocaleString(),
            href: '/dealers',
            tone: noRegionCount ? 'caution' : 'normal',
            sub: 'invisible to region filters',
          },
        ]}
      />

      {onboarded && <div className="alert alert-ok">Dealer onboarded successfully.</div>}
      {deleted && <div className="alert alert-ok">Dealer deleted.</div>}
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

      {/* The list is the page — no card. See .index-surface in globals.css
          for why, and for the four products that build this screen the same
          way. Nothing here is removed or hidden: the same view switcher, the
          same search, the same region filter, the same Export and Import.
          Only the box around them is gone, and the two rows are now a
          toolbar closed by one hairline instead of floating inside six. */}
      <div className="index-surface">
        <FilterChips chips={filterChips} clearAllHref={viewHref(view)} />

        <div className="index-toolbar">
          <div className="segmented" role="group" aria-label="Saved views">
            <Link href={viewHref('all')} className={`segmented-btn ${view === 'all' ? 'active' : ''}`}>
              All
            </Link>
            <Link href={viewHref('region')} className={`segmented-btn ${view === 'region' ? 'active' : ''}`}>
              By Region
            </Link>
            <Link
              href={viewHref('inactive')}
              className={`segmented-btn ${view === 'inactive' ? 'active' : ''}`}
              title="Dealers with no verified top-up in 30+ days — independent of the top-up ranking above"
            >
              Needs Follow-up
            </Link>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <a href={exportHref} className="btn-ghost">
              ⤓ Export
            </a>
            {canManage && <ImportDealersButton />}
          </div>
        </div>

        <form className="index-filterbar" action="/dealers" method="GET">
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
        </form>

      {rows.length ? (
        <>
          <DealersTable dealers={pageRows} groupByRegion={view === 'region'} showRate={showRate} showRanking={showRanking} />
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between border-t border-ink-800 pt-3">
              <span className="text-[12px] text-paper-dim">
                Page {pageNum} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                {pageNum > 1 ? (
                  <Link href={pageHref(pageNum - 1)} className="btn-ghost py-1.5 text-xs">
                    Previous
                  </Link>
                ) : (
                  <button type="button" disabled className="btn-ghost py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40">
                    Previous
                  </button>
                )}
                {pageNum < totalPages ? (
                  <Link href={pageHref(pageNum + 1)} className="btn-ghost py-1.5 text-xs">
                    Next
                  </Link>
                ) : (
                  <button type="button" disabled className="btn-ghost py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40">
                    Next
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        hasFilter ? (
          <EmptyState
            variant="filtered"
            icon={<IconSearch className="h-5 w-5" />}
            title="No dealers match your filters"
            description={`Nothing matches${q ? ` "${q}"` : ''}${region !== 'all' ? ` in ${region}` : ''}. Clear the filters to see all dealers.`}
            action={{ href: viewHref(view), label: 'Clear filters' }}
          />
        ) : view === 'inactive' ? (
          <EmptyState
            variant="cleared"
            icon={<IconSearch className="h-5 w-5" />}
            title="Nobody needs a follow-up"
            description="Every dealer has had a verified top-up in the last 30 days."
          />
        ) : (
          <EmptyState
            variant="empty"
            icon={<IconSearch className="h-5 w-5" />}
            title="No dealers yet"
            description="Dealers you onboard appear here with their region, package and rate."
            action={canManage ? { href: '/onboard', label: 'Onboard dealer' } : undefined}
          />
        )
      )}
      </div>
    </>
  )
}
