import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { getDealerActivityMap } from '@/lib/dealer-activity'
import { getDealerRankingMap, type DealerRanking, type RankingResult } from '@/lib/dealer-ranking'
import { dealerMatchNote, dealerSearchFilter, sanitizeSearchTerm } from '@/lib/search'
import { IconSearch } from '../icons'
import { DealersTable, type DealerRow } from './dealers-table'
import { ImportDealersButton } from './import-dealers-button'
import { PageHeader } from '../page-header'
import { HeroCard } from '../hero-card'
import { EmptyState } from '../empty-state'
import { FilterChips } from '../filter-chips'
import { Pagination } from '../pagination'
import { allRows } from '@/lib/fetch-all'
import { compareDealers, DEALER_SORT_KEYS, nextDealerSort, parseDealerSort } from '@/lib/dealer-sort'
import { siteOrigin } from '@/lib/site-url'
import { ColumnsMenu } from '../columns-menu'
import { TABLE_COLUMNS, columnCookieName, parseHiddenColumns } from '@/lib/table-columns'
import { cardEarningsRm, cardsOwedByDealer, packagesBoughtByDealer } from '@/lib/sim-stock'

export const metadata: Metadata = {
  title: 'Dealers — Vibe456',
}

type Dealer = {
  id: string
  company_name: string
  company_no: string | null
  contact_person: string | null
  phone: string | null
  whatsapp: string | null
  region: string | null
  package: 'A' | 'B' | 'C' | null
  rate: number | null
  /** 'active' | 'inactive' — /entry offers active dealers only. */
  status: string | null
  submit_token: string | null
}

type View = 'all' | 'region' | 'inactive' | 'nopackage'

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
    assigned?: string
    refused?: string
    page?: string
    sort?: string
    dir?: string
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
    assigned,
    refused,
    page,
    sort: rawSort,
    dir: rawDir,
  } = await searchParams
  // A column the reader chose to sort by. Null means the default order below.
  const sort = parseDealerSort(rawSort, rawDir)
  const view: View = rawView === 'region' || rawView === 'inactive' || rawView === 'nopackage' ? rawView : 'all'
  const canManage = user.role === 'cs' || user.role === 'master'
  // rate is a commission figure (PROJECT_SPEC.md section 4: "CS 看不到财务") —
  // strip it from the data sent to the client, not just hide it in the UI.
  const showRate = user.role !== 'cs'
  // Same boundary as rate: ranking is derived from transactions.points, and
  // cs has no SELECT on transactions at all (0001) — querying it would just
  // come back empty under RLS, silently showing everyone as unranked rather
  // than actually failing, so skip the query and the columns entirely.
  const showRanking = user.role !== 'cs'

  // Which columns this reader keeps, read during the render so the first HTML
  // already has the hidden ones hidden — see lib/table-columns.ts.
  const hiddenColumns = parseHiddenColumns('dealers', (await cookies()).get(columnCookieName('dealers'))?.value)

  // cs never sees a rate, a ranking or the card margin — those cells are not
  // rendered for them at all (0015 keeps rate out of dealers_directory, and
  // the card figures need `transactions`, which cs cannot read). Offering to
  // switch one on would be a control that does nothing, and a count of "5/8"
  // that can never reach 8.
  const visibleColumnSpecs = TABLE_COLUMNS.dealers.filter(
    (c) =>
      (showRate || !['rate', 'cards'].includes(c.key)) && (showRanking || !['rank', 'topup'].includes(c.key))
  )

  const supabase = await createClient()

  // cs has no SELECT on the dealers base table (0015 — rate is a commission
  // figure PROJECT_SPEC.md says cs must never see, enforced at the DB layer
  // now, not just by stripping it below) — read through dealers_directory
  // instead, which has every column except rate.
  let query = supabase
    .from(showRate ? 'dealers' : 'dealers_directory')
    // whatsapp and submit_token are here for the send-link button on each row.
    // Both are in dealers_directory as well as the base table (0042), so cs —
    // the role that fields "how do I send my order in" all day — gets it too.
    .select(
      showRate
        ? 'id, company_name, company_no, contact_person, phone, whatsapp, region, package, rate, status, submit_token'
        : 'id, company_name, company_no, contact_person, phone, whatsapp, region, package, status, submit_token',
      { count: 'exact' }
    )

  if (q) {
    // Strip characters with special meaning in PostgREST's .or() filter syntax
    // so a search term can't break out of the intended filter structure.
    const safeQ = sanitizeSearchTerm(q)
    if (safeQ) {
      query = query.or(dealerSearchFilter(safeQ))
    }
  }
  // The forty-item "All Regions" dropdown is gone: the search box above
  // already matches on region, and the By Region view groups by it, so the
  // list was a third way to do the same thing and the longest of the three.
  // The parameter stays honoured — an export link, a bookmark and the
  // removable filter chip all still work.
  if (region !== 'all') {
    query = query.eq('region', region)
  }

  const [{ data: dealers, count }, { data: regionRows }, activityMap, rankingResult, { data: pinRows }, { data: packageSaleRows }, { data: simOrderRows }] =
    await Promise.all([
      query,
      supabase.from('dealers_directory').select('region').not('region', 'is', null),
      getDealerActivityMap(supabase),
      showRanking ? getDealerRankingMap(supabase) : Promise.resolve<RankingResult>({ map: new Map<string, DealerRanking>(), unavailable: false }),
      // Unfiltered by the query above: a pin has to survive the reader
      // changing region or search, or "pinned first" would only hold on the
      // unfiltered view and quietly stop meaning anything everywhere else.
      // RLS (0039) already narrows this to the signed-in person's own rows.
      supabase.from('dealer_pins').select('dealer_id'),
      // The card side of the business. Both are finance-only: cs has no SELECT
      // on `transactions` or `sim_orders` at all, so asking as cs would come
      // back empty and render a confident "RM 0.00" for every dealer — a wrong
      // figure, not a hidden one. showRate is the same gate the rate column
      // already uses, and card margin is the same kind of number.
      // Every package sale and every SIM order there has ever been, because "cards owed" is
      // all-time entitlement minus all-time deliveries. Paged: one request stops at 1,000 rows
      // without an error, and every dealer's owed cards and card earnings would come out low.
      showRate
        ? allRows((from, to) =>
            supabase
              .from('transactions')
              .select('dealer_id, package, quantity')
              .eq('type', 'package')
              .neq('status', 'flagged')
              .order('id')
              .range(from, to),
          )
        : Promise.resolve({ data: [] }),
      showRate
        ? allRows((from, to) => supabase.from('sim_orders').select('dealer_id, quantity').order('id').range(from, to))
        : Promise.resolve({ data: [] }),
    ])

  const pinnedIds = new Set((pinRows ?? []).map((p) => p.dealer_id as string))

  // Entitled cards against delivered ones, the same reckoning /sim-stock and
  // each dealer's own page already do — done once here so the list can carry
  // the figure without asking per row.
  const packageSales = (packageSaleRows as { dealer_id: string; package: string | null; quantity: number | null }[] | null) ?? []
  const cards = cardsOwedByDealer(
    packageSales,
    (simOrderRows as { dealer_id: string; quantity: number }[] | null) ?? []
  ).byDealer
  // What each dealer bought, spelled out -- "3 × A" is the middle term that
  // makes the card-earnings figure beside it readable.
  const bought = packagesBoughtByDealer(packageSales)

  const regions = Array.from(new Set((regionRows ?? []).map((r) => r.region))).sort() as string[]
  // The ranking could not be read. Everything derived from it — the Rank and Top-up columns, the volume
  // order, "Ever topped up" — is MISSING, not zero, and the page says so instead of drawing it.
  const rankingMap = rankingResult.map
  const rankingUnavailable = rankingResult.unavailable

  let rows: DealerRow[] = ((dealers as (Dealer & { rate?: number | null })[] | null) ?? []).map((d) => {
    const activity = activityMap.get(d.id)
    const ranking = rankingMap.get(d.id)
    return {
      ...d,
      rate: showRate ? (d.rate ?? null) : null,
      submitToken: d.submit_token ?? null,
      // Earned on what their packages entitled them to, not on what has gone
      // out of the box. Which of the two is the real revenue depends on who
      // pays Vibe for the cards, which is one of the open questions for the
      // supplier — so the list shows the entitlement and names the gap beside
      // it rather than picking an answer.
      cardEarningsRm: cardEarningsRm(cards.get(d.id)?.entitled ?? 0),
      cardsOwed: cards.get(d.id)?.owed ?? 0,
      packagesBought: bought.get(d.id)?.label ?? null,
      packagesBoughtCount: bought.get(d.id)?.total ?? 0,
      totalPoints: ranking?.totalPoints ?? 0,
      rank: ranking?.rank ?? null,
      isInactive: activity?.isInactive ?? false,
      isSeverelyInactive: activity?.isSeverelyInactive ?? false,
      daysSinceLastActivity: activity?.daysSinceLastActivity ?? null,
      isPinned: pinnedIds.has(d.id),
      matchNote: q ? dealerMatchNote(d, sanitizeSearchTerm(q)) : null,
    }
  })

  if (view === 'inactive') {
    rows = rows.filter((r) => r.isInactive)
  }

  // A dealer with no package has no rate, and the credit-balance guard on
  // /entry refuses a top-up it cannot price — so these are dealers on the
  // roster who cannot trade at all. On production that is 242 of 284, and
  // until now the only way to find them was to read the Package column down
  // the whole list. The dashboard links straight here.
  //
  // Active only, which is the one view here that filters on status — caught
  // by opening the deployed page: the dashboard band counted 4 and this list
  // showed 5, the extra being an inactive dealer. Every other view can
  // legitimately show one, but this view's question is "who needs a package
  // so they can start trading", and /entry offers active dealers only. Giving
  // an inactive dealer a package would not let them trade, so counting them
  // here would send someone to do work that changes nothing.
  if (view === 'nopackage') {
    rows = rows.filter((r) => !r.package && r.status === 'active')
  }

  // Pinned first, then the volume order below. A pin is the reader saying
  // which dealers are theirs, and that has to outrank a global measure of who
  // is biggest — otherwise pinning changes nothing for anyone whose dealers
  // are not also the top sellers, which is most people.
  //
  // It also has to come before pagination rather than after: 284 dealers is
  // several pages, and a pin that only reorders the page you are already on
  // would leave your dealers wherever they were.
  //
  // Clicking a column header replaces that order outright: a list sorted by name
  // that still floated pinned dealers to the top would not be sorted by name.
  rows.sort(
    sort
      ? (a, b) => compareDealers(a, b, sort)
      : (a, b) =>
          Number(b.isPinned) - Number(a.isPinned) ||
          b.totalPoints - a.totalPoints ||
          a.company_name.localeCompare(b.company_name),
  )

  // The header pill below shows `count` (the DB's pre-filter total) for
  // 'all'/'region', but the inactive view filters client-side afterward —
  // showing the same `count` there would visibly contradict the table
  // sitting right below it (and the "Needs Follow-up" KPI card that links here).
  const displayCount = view === 'inactive' || view === 'nopackage' ? rows.length : (count ?? 0)

  // "4 across 10 regions" was wrong for the same reason displayCount exists:
  // `regions` is every region in the table — it has to be, it fills the region
  // filter — while a client-side view has already cut the list. The four
  // dealers with no package sit in two regions, not ten.
  const shownRegionCount =
    view === 'inactive' || view === 'nopackage'
      ? new Set(rows.map((r) => r.region).filter(Boolean)).size
      : regions.length

  // Summary figures for the header. Derived from `rows` — the set matching the
  // current filters — rather than from the whole table, so the summary can
  // never contradict the list sitting directly beneath it. That was already a
  // live problem here: `count` is the DB's pre-filter total, and the inactive
  // view filters afterward in JS, which is why displayCount exists at all.
  const sellingCount = rows.filter((r) => r.totalPoints > 0).length
  // The number this card was hiding. "Gone quiet" is built from
  // dealer_last_verified_activity, which only ever contains dealers who have
  // transacted — so a dealer who has never bought anything cannot appear in it
  // by construction, and the card read "249 dealers, 1 gone quiet" while 242 of
  // them had never placed a single order. Never-sold and went-quiet are
  // different problems with different fixes, so both are named.
  const neverSoldCount = rows.length - sellingCount
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
    if (sort) { params.set('sort', sort.key); params.set('dir', sort.dir) }
    const qs = params.toString()
    return `/dealers${qs ? `?${qs}` : ''}`
  }

  function pageHref(p: number) {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (region !== 'all') params.set('region', region)
    if (view !== 'all') params.set('view', view)
    if (sort) { params.set('sort', sort.key); params.set('dir', sort.dir) }
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
    if (sort) { params.set('sort', sort.key); params.set('dir', sort.dir) }
    const qs = params.toString()
    return `/dealers${qs ? `?${qs}` : ''}`
  }

  // Where clicking each sortable header leads. Always back to page 1: staying on page 4
  // of a list that has just been re-ordered would show an arbitrary slice of it.
  const sortHrefs = Object.fromEntries(
    DEALER_SORT_KEYS.map((key) => {
      const next = nextDealerSort(sort, key)
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      if (region !== 'all') params.set('region', region)
      if (view !== 'all') params.set('view', view)
      if (next) { params.set('sort', next.key); params.set('dir', next.dir) }
      return [key, `/dealers${params.toString() ? `?${params.toString()}` : ''}`]
    }),
  ) as Record<(typeof DEALER_SORT_KEYS)[number], string>

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
        label={
          view === 'inactive'
            ? 'Dealers needing follow-up'
            : view === 'nopackage'
              ? 'Dealers with package not recorded'
              : q || region !== 'all'
                ? 'Dealers matching this filter'
                : 'Dealers'
        }
        value={displayCount.toLocaleString()}
        chgSuffix={shownRegionCount ? `across ${shownRegionCount} region${shownRegionCount === 1 ? '' : 's'}` : undefined}
        href="/dealers"
        stats={[
          {
            // getDealerRankingMap sums every verified transaction ever, not
            // the current month — so this cannot be labelled "this period".
            label: 'Ever topped up',
            value: rankingUnavailable ? '—' : sellingCount.toLocaleString(),
            href: '/records?status=verified',
            tone: !rankingUnavailable && neverSoldCount > sellingCount ? 'caution' : 'normal',
            sub: rankingUnavailable
              ? 'could not be loaded — refresh to try again'
              : neverSoldCount > 0
                ? `${neverSoldCount.toLocaleString()} on the roster never have`
                : 'every dealer has verified volume on record',
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

      {/* Says how many, because the whole point was doing it to hundreds at
          once — "Saved" would leave you counting rows to find out what
          happened. Refusals are named rather than hidden: the expected one is
          a dealer who already had a package by the time the button was
          pressed, which is not a failure worth stopping for. */}
      {assigned && (
        <div className="alert alert-ok">
          Package set for {assigned} dealer{assigned === '1' ? '' : 's'}. They can trade now.
          {refused && Number(refused) > 0 ? ` ${refused} were skipped — they already had one.` : ''}
        </div>
      )}
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
      {rankingUnavailable && (
        <div className="alert alert-warn">
          The top-up ranking could not be loaded, so the Rank and Top-up columns and &ldquo;Ever topped up&rdquo; are missing — they are not zero. Refresh to try again.
        </div>
      )}

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
            <Link
              href={viewHref('nopackage')}
              className={`segmented-btn ${view === 'nopackage' ? 'active' : ''}`}
              title="They have bought a package, but Vibe has not said which — they top up at 6% either way"
            >
              Package Unknown
            </Link>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ColumnsMenu
              table="dealers"
              columns={visibleColumnSpecs}
              hidden={[...hiddenColumns]}
              alwaysOn="Company"
            />
            <a href={exportHref} className="btn-ghost">
              ⤓ Export
            </a>
            {canManage && <ImportDealersButton />}
          </div>
        </div>

        <form className="index-filterbar" action="/dealers" method="GET">
          {view !== 'all' && <input type="hidden" name="view" value={view} />}
          {region !== 'all' && <input type="hidden" name="region" value={region} />}
          {sort && <input type="hidden" name="sort" value={sort.key} />}
          {sort && <input type="hidden" name="dir" value={sort.dir} />}
          <label className="mini-search w-96 max-w-full transition-colors focus-within:border-primary">
            <IconSearch className="h-4 w-4 shrink-0" />
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Search name, contact, phone or reg. no."
              className="w-full bg-transparent text-sm text-paper outline-none placeholder:text-paper-dim/70"
            />
          </label>
          {/* Secondary, not primary. Applying a filter is reversible and changes
              nothing; Export produces a file that leaves the system. As
              btn-primary this was the heaviest control on the page and outranked
              the one with a real consequence. */}
          <button type="submit" className="btn-ghost">
            Search
          </button>
        </form>

      {rows.length ? (
        <>
          <DealersTable
            dealers={pageRows}
            groupByRegion={view === 'region'}
            showRate={showRate}
            showRanking={showRanking}
            origin={await siteOrigin()}
            canAssign={canManage}
            listHref={pageHref(pageNum)}
            sort={sort}
            sortHrefs={sortHrefs}
          />
          <Pagination
            page={pageNum}
            totalPages={totalPages}
            hrefFor={pageHref}
            summary={`${((pageNum - 1) * PAGE_SIZE + 1).toLocaleString()}–${Math.min(pageNum * PAGE_SIZE, rows.length).toLocaleString()} of ${rows.length.toLocaleString()} dealers`}
          />
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
        ) : view === 'nopackage' ? (
          <EmptyState
            variant="cleared"
            icon={<IconSearch className="h-5 w-5" />}
            title="Every dealer's package is recorded"
            description="Nothing left to fill in."
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
