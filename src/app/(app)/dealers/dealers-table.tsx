'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Avatar } from '../avatar'
import { IconBuilding, IconMapPin, IconPhone, IconUsers, IconTag, IconTrendUp, IconChevronDown, IconStar, IconSend, IconCard, IconBox, IconTrophy } from '../icons'
import { PACKAGE_PILL_CLASS } from '@/lib/packages'
import { DataGrid } from '../data-grid'
import { formatMYR } from '@/lib/money'
import { SIM_MARGIN_RM } from '@/lib/sim-stock'
import { toggleDealerPin, assignPackages } from './actions'
import { PACKAGES, type PackageCode } from '@/lib/packages'
import type { MatchNote } from '@/lib/search'

// A checkbox, and the bar that appears once anything is ticked.
//
// Only dealers with NO package can be ticked. assign_dealer_package (0047)
// refuses to overwrite one, so offering the checkbox on a dealer who already
// has Package B would be offering an action that cannot happen — and moving
// someone from B to C changes what they earn on everything afterwards, which
// is a conversation, not a checkbox on a list of five hundred.
function SelectBox({ dealer, checked, onChange }: { dealer: DealerRow; checked: boolean; onChange: (id: string, on: boolean) => void }) {
  if (dealer.package) {
    // Not a disabled checkbox: a control you can see and cannot use invites
    // the question "why not" on every row. The package pill further along the
    // row already answers it.
    return <span className="w-4 shrink-0" aria-hidden="true" />
  }
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(dealer.id, e.target.checked)}
      aria-label={`Select ${dealer.company_name} to set a package`}
      className="relative z-10 h-4 w-4 shrink-0 cursor-pointer accent-primary"
    />
  )
}

function AssignBar({ ids, view, onClear }: { ids: string[]; view: string; onClear: () => void }) {
  const [confirming, setConfirming] = useState<PackageCode | null>(null)
  if (!ids.length) return null

  return (
    <div className="sticky top-0 z-20 mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-primary/40 bg-primary-soft px-4 py-3">
      <span className="text-[13px] font-semibold text-paper">
        {ids.length} dealer{ids.length === 1 ? '' : 's'} selected
      </span>

      {confirming ? (
        <form action={assignPackages} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="ids" value={ids.join(',')} />
          <input type="hidden" name="package" value={confirming} />
          <input type="hidden" name="view" value={view} />
          {/* Says what will happen to whom, in numbers, before it happens.
              Five hundred rate assignments is not something to confirm with
              the word "OK". */}
          <span className="text-[13px] text-paper">
            Give <b className="font-semibold">Package {confirming}</b> — {PACKAGES[confirming].rate}% on every top-up — to{' '}
            <b className="font-semibold">{ids.length}</b> dealer{ids.length === 1 ? '' : 's'}?
          </span>
          <button type="submit" className="btn-primary py-1.5 text-xs">
            Yes, set {ids.length} package{ids.length === 1 ? '' : 's'}
          </button>
          <button type="button" onClick={() => setConfirming(null)} className="text-[12px] font-semibold text-paper-dim hover:text-paper">
            Back
          </button>
        </form>
      ) : (
        <>
          <span className="text-[13px] text-paper-dim">Set package</span>
          {(Object.keys(PACKAGES) as PackageCode[]).map((code) => (
            <button key={code} type="button" onClick={() => setConfirming(code)} className="btn-ghost py-1.5 text-xs">
              {code} · RM{PACKAGES[code].price}
            </button>
          ))}
          <button type="button" onClick={onClear} className="ml-auto text-[12px] font-semibold text-paper-dim hover:text-paper">
            Clear
          </button>
        </>
      )}
    </div>
  )
}

export type DealerRow = {
  id: string
  company_name: string
  company_no: string | null
  contact_person: string | null
  phone: string | null
  whatsapp: string | null
  region: string | null
  package: 'A' | 'B' | 'C' | null
  rate: number | null
  /** 'active' | 'inactive'. /entry offers active dealers only, so the
      No Package view filters on it — see the note in page.tsx. */
  status: string | null
  submitToken: string | null
  /** What they have actually bought, as "3 × A" or "2 × A + 1 × C". Null
      until they buy one — which is not the same as having no package, since
      a dealer can be given a tier in bulk and buy nothing for months. */
  packagesBought: string | null
  /** How many packages that adds up to, across all three codes. */
  packagesBoughtCount: number
  /** RM1.50 a card on everything their packages entitled them to. */
  cardEarningsRm: number
  /** Entitled but not yet handed over. Stock the business still owes them. */
  cardsOwed: number
  totalPoints: number
  rank: number | null
  /** Why this row is in the search results when the reason is a hidden field
      (the contact's name, a phone number). Null otherwise. */
  matchNote?: MatchNote | null
  isInactive: boolean
  isSeverelyInactive: boolean
  daysSinceLastActivity: number | null
  isPinned: boolean
}

// The row is one big link — the company name carries `after:inset-0`, which
// lays an invisible overlay across the whole <tr>. Anything meant to be
// clickable in its own right has to be lifted above that overlay, or pressing
// the star navigates to the dealer instead of pinning them.
function PinButton({ dealer }: { dealer: DealerRow }) {
  return (
    <form action={toggleDealerPin} className="relative z-10 shrink-0">
      <input type="hidden" name="dealer_id" value={dealer.id} />
      <button
        type="submit"
        title={dealer.isPinned ? `Unpin ${dealer.company_name}` : `Pin ${dealer.company_name} to the top`}
        aria-label={dealer.isPinned ? `Unpin ${dealer.company_name}` : `Pin ${dealer.company_name} to the top`}
        aria-pressed={dealer.isPinned}
        /* 32px, not the icon's 16 — a star small enough to look right in a
           table row is too small to hit on a phone, so the target is padded
           out around it. */
        className={`grid h-8 w-8 place-items-center rounded-md transition-colors ${
          dealer.isPinned
            ? 'text-brass-bright hover:text-paper-dim'
            : 'text-paper-dim/40 hover:bg-ink-900 hover:text-brass-bright'
        }`}
      >
        <IconStar className="h-4 w-4" filled={dealer.isPinned} />
      </button>
    </form>
  )
}

// Send a dealer their own request link, from the list, without opening them.
//
// The link lived only on the dealer's own page, three cards down the rail —
// which meant sending links to a morning's worth of dealers was 284 page
// loads. This is the same URL SubmitLink shows, one tap from the row.
//
// Same z-10 escape hatch as PinButton: the row is one big link and anything
// clickable has to be lifted above the overlay, or this navigates instead.
function SendLinkButton({ dealer, origin }: { dealer: DealerRow; origin: string }) {
  const [copied, setCopied] = useState(false)
  if (!dealer.submitToken) return null

  const url = `${origin}/r/${dealer.submitToken}`
  // Malaysian numbers are stored as 012-3456789; wa.me wants 60123456789.
  const number = (dealer.whatsapp ?? dealer.phone)?.replace(/\D/g, '').replace(/^0/, '60') || null
  const message = `Hi ${dealer.company_name}, you can send us your top-up requests here: ${url}`

  const shell =
    'relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-md text-paper-dim/40 transition-colors hover:bg-ink-900 hover:text-jade-bright'

  // With a number the button does the whole job in one tap. Without one there
  // is nothing to open, so it copies instead — and says which it did, because
  // a button that silently does one of two different things is worse than two
  // buttons.
  if (number) {
    return (
      <a
        href={`https://wa.me/${number}?text=${encodeURIComponent(message)}`}
        target="_blank"
        rel="noreferrer"
        title={`WhatsApp ${dealer.company_name} their request link`}
        aria-label={`WhatsApp ${dealer.company_name} their request link`}
        className={shell}
      >
        <IconSend className="h-4 w-4" />
      </a>
    )
  }

  return (
    <button
      type="button"
      title={`No number saved — copy ${dealer.company_name}'s request link instead`}
      aria-label={`Copy ${dealer.company_name}'s request link`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        } catch {
          setCopied(false)
        }
      }}
      className={shell}
    >
      {copied ? <span className="text-[10px] font-semibold text-jade-bright">✓</span> : <IconSend className="h-4 w-4" />}
    </button>
  )
}

// Every rank in the same chip. Gold, silver and bronze on the trophy.
//
// It used to be three things at once: #1 in semibold ink, #2 and #3 in a
// lighter chip, and #4 onward as bare dim figures with no chip at all. Three
// treatments for one kind of value, and the darker #1 read as a state rather
// than a position. The chip is now identical for everybody — same border,
// same fill, same text colour — and the only thing that changes across the
// podium is the metal on the trophy, which is the one place a reader already
// expects first/second/third to be encoded by colour.
//
// The metals are their own tokens rather than borrowed from the status
// palette; see --color-medal-* in globals.css for why, and for the contrast
// each one had to be darkened to.
// Utility classes, not style={{ color: 'var(--color-medal-gold)' }}. The
// tokens live in @theme, and Tailwind v4 only emits a theme variable it can
// see being used — a var() built inside JSX is invisible to the scanner, so
// the first version of this rendered all three trophies in the inherited grey
// and the test caught three identical colours. Writing the class names as
// whole literals is what makes them exist at all. Fourth time this codebase
// has lost something to Tailwind's scanner; see lib/log-columns.ts.
const MEDAL = ['text-medal-gold', 'text-medal-silver', 'text-medal-bronze']

function RankBadge({ rank }: { rank: number | null }) {
  // The same 58px, even with nothing in it. Most dealers have no rank, so a
  // narrow dash here would put the avatar and the company name at a different
  // x on those rows — the ragged edge would just move one column right.
  if (rank == null) return <span className="inline-block w-[58px] text-center text-paper-dim/50">—</span>
  const podium = rank <= 3
  return (
    // One width for every chip, podium or not. A trophy is 14px plus a 6px
    // gap, so "1" and "#4" produced chips 20px apart and the column had a
    // ragged right edge down the whole table — which is the thing that reads
    // as untidy, not the colours. Fixed width and centred content instead of
    // min-width: the widest possible content is "#284", and sizing to the
    // content means the column changes shape as you page through it.
    <span
      className="pill pill-neutral w-[58px] justify-center whitespace-nowrap tabular-nums"
      title={`#${rank} by cumulative top-up`}
    >
      {podium && <IconTrophy className={`h-3.5 w-3.5 shrink-0 ${MEDAL[rank - 1]}`} />}
      {podium ? rank : `#${rank}`}
    </span>
  )
}

export function DealersTable({
  dealers,
  groupByRegion,
  showRate,
  showRanking,
  origin,
  canAssign = false,
  view = '',
}: {
  dealers: DealerRow[]
  groupByRegion: boolean
  showRate: boolean
  showRanking: boolean
  /** Where the app is served from, resolved server-side — see lib/site-url. */
  origin: string
  /** cs and master may set a package; accountant may not. */
  canAssign?: boolean
  /** Carried back through the action so the redirect lands on the same view. */
  view?: string
}) {
  // Selection lives here rather than in the page, because the page is a
  // server component and this table is already a client one. Lifting it out
  // would mean a third component whose only job is to hold a Set.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const toggleOne = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  const assignable = dealers.filter((d) => !d.package)
  const allPicked = assignable.length > 0 && assignable.every((d) => selected.has(d.id))

  if (!dealers.length) {
    return null
  }

  const groups = groupByRegion
    ? [...dealers.reduce((map, d) => {
        const key = d.region ?? '(No Region)'
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(d)
        return map
      }, new Map<string, DealerRow[]>())].sort((a, b) => a[0].localeCompare(b[0]))
    : [['', dealers] as [string, DealerRow[]]]

  return (
    <>
      {/* Above the grid, not inside it: the bar is about the selection, not
          about any one row, and a control that scrolls away with the table
          is a control you lose halfway down five hundred names. */}
      {canAssign && <AssignBar ids={[...selected]} view={view} onClear={() => setSelected(new Set())} />}
      <DataGrid id="dealers" label="Dealer directory">
      {groups.map(([region, rows]) => {
        // A <details> with no <summary> is not an empty disclosure — the
        // browser supplies its own default label, and "Details" was rendering
        // above the table on the ungrouped view. Only the grouped view has
        // anything to disclose, so only it gets a <details>.
        const Wrapper = groupByRegion ? 'details' : 'div'
        return (
        <Wrapper key={region || 'flat'} {...(groupByRegion ? { open: true } : {})} className="mb-3 last:mb-0">
          {groupByRegion && (
            <summary className="mb-2 flex cursor-pointer list-none items-center gap-2 text-xs font-semibold uppercase tracking-wide text-paper-dim">
              <IconChevronDown className="h-3.5 w-3.5 -rotate-90 transition-transform [details[open]_&]:rotate-0" />
              {region} <span className="pill pill-neutral">{rows.length}</span>
            </summary>
          )}
          {/* table-fixed + an explicit colgroup, identical across every region
              group's own <table> — table-layout:auto (the default) sizes
              each column from that one table's own content, so a region with
              short names/phones ends up with different column widths than
              one with long ones, and the columns visibly stop lining up as
              you scroll past a group boundary. Fixed widths shared by every
              group is what actually keeps them aligned. */}
          {/* Widths on the header cells, not in a colgroup. A <col> keeps its
              width when its cells are hidden, so a column switched off in the
              Columns menu would leave a gap behind and shift everything after
              it — see lib/table-columns.ts. Every group renders its own
              <table>, and they stay aligned because they all declare the same
              numbers. */}
          <table className="grid-table table-fixed text-sm">
            <thead>
              <tr>
                {/* Company is the frozen column, so it has to be the first
                    one. Rank used to sit to its left; it is now a badge inside
                    this cell, which is where it belonged anyway — a rank is
                    something a dealer has, not a fact of its own. */}
                <th className="th pin-name" style={{ width: 264 }}>
                  <span className="inline-flex items-center gap-1.5">
                    {canAssign && assignable.length > 0 && (
                      <input
                        type="checkbox"
                        checked={allPicked}
                        onChange={(e) =>
                          setSelected(e.target.checked ? new Set(assignable.map((d) => d.id)) : new Set())
                        }
                        aria-label={`Select all ${assignable.length} dealers on this page that have no package`}
                        title={`Select the ${assignable.length} on this page with no package`}
                        className="relative z-10 mr-1 h-4 w-4 cursor-pointer accent-primary"
                      />
                    )}
                    <IconBuilding /> Company
                  </span>
                </th>
                <th className="th" data-c="region" style={{ width: 120 }}>
                  <span className="inline-flex items-center gap-1.5">
                    <IconMapPin /> Region
                  </span>
                </th>
                <th className="th" data-c="phone" style={{ width: 144 }}>
                  <span className="inline-flex items-center gap-1.5">
                    <IconPhone /> Phone
                  </span>
                </th>
                <th className="th" data-c="contact" style={{ width: 156 }}>
                  <span className="inline-flex items-center gap-1.5">
                    <IconUsers className="h-3.5 w-3.5" /> Contact
                  </span>
                </th>
                <th className="th" data-c="package" style={{ width: 92 }}>
                  <span className="inline-flex items-center gap-1.5">
                    <IconTag /> Package
                  </span>
                </th>
                {/* Sits between the tier and the money it earns, because it
                    is the term that connects them: the tier says what the
                    dealer is on, this says how many they bought, and the
                    figure on the right is those two multiplied by RM1.50 a
                    card. Read left to right the row now explains itself.
                    116px holds "2 × A + 1 × C", the widest real value. */}
                {showRate && (
                  <th className="th" data-c="bought" style={{ width: 116 }}>
                    <span className="inline-flex items-center gap-1.5">
                      <IconBox className="h-3.5 w-3.5" /> Bought
                    </span>
                  </th>
                )}
                {showRate && (
                  <th className="th" data-c="rate" style={{ width: 68 }}>
                    Rate
                  </th>
                )}
                {showRanking && (
                  <th className="th text-right" data-c="topup" style={{ width: 118 }}>
                    <span className="inline-flex items-center gap-1.5">
                      <IconTrendUp className="h-3.5 w-3.5" /> Top-up
                    </span>
                  </th>
                )}
                {/* The owner's own money. Everything else on this row is the
                    dealer's side of the relationship — what they bought, at
                    what rate — and none of it is what the business keeps. */}
                {showRate && (
                  <th className="th text-right" data-c="cards" style={{ width: 132 }}>
                    <span className="inline-flex items-center gap-1.5">
                      <IconCard className="h-3.5 w-3.5" /> Card earnings
                    </span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className="tr-row group relative h-16">
                  <td className="td pin-name">
                    <div className="flex min-w-0 items-center gap-2.5">
                      {canAssign && <SelectBox dealer={d} checked={selected.has(d.id)} onChange={toggleOne} />}
                      <PinButton dealer={d} />
                      {showRanking && (
                        <span data-c="rank" className="shrink-0">
                          <RankBadge rank={d.rank} />
                        </span>
                      )}
                      <Avatar name={d.company_name} />
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <Link
                            href={`/dealers/${d.id}`}
                            title={d.company_name}
                            className="truncate font-semibold text-paper after:absolute after:inset-0 after:content-[''] hover:text-jade-bright"
                          >
                            {d.company_name}
                          </Link>
                          {d.isInactive && (
                            <span
                              className={`pill ${d.isSeverelyInactive ? 'pill-clay' : 'pill-brass'}`}
                              title={`${d.daysSinceLastActivity} days since the last verified top-up`}
                            >
                              {d.daysSinceLastActivity}d
                            </span>
                          )}
                        </div>
                        {/* Replaces the registration number rather than adding a third
                            line, so a row keeps the height every other row has. */}
                        {d.matchNote ? (
                          <div className="truncate text-[12px] text-paper-dim">
                            {d.matchNote.label}: {d.matchNote.before}
                            <mark className="bg-transparent font-semibold text-paper">{d.matchNote.hit}</mark>
                            {d.matchNote.after}
                          </div>
                        ) : (
                          d.company_no && <div className="truncate text-[12px] text-paper-dim">{d.company_no}</div>
                        )}
                      </div>
                      {/* Right edge of the frozen column, so it lands in the
                          same place on every row and stays reachable however
                          far the table has been scrolled. */}
                      <span className="ml-auto pl-1">
                        <SendLinkButton dealer={d} origin={origin} />
                      </span>
                    </div>
                  </td>
                  {/* title on every cell that can truncate. Clipped with no way
                      to see the rest is information gone, not information
                      abbreviated — "Tanjong Piandang" was arriving as "Tanjong
                      Pian…" with nothing to recover it. */}
                  <td className="td truncate text-paper-dim" data-c="region" title={d.region ?? undefined}>
                    {d.region ?? '—'}
                  </td>
                  {/* nowrap, and 144px rather than 128. A mobile number is
                      twelve characters — 012-514 7788 — against eleven for a
                      landline, and in mono at 14px that one character was the
                      difference between fitting and wrapping to a second line.
                      Thirteen of the demo's thirty-four dealers carry mobiles,
                      which is exactly how many rows came out 81px tall against
                      64px for the rest. A number is never worth wrapping. */}
                  <td className="td figure whitespace-nowrap text-paper-dim" data-c="phone">{d.phone ?? '—'}</td>
                  <td className="td truncate text-paper-dim" data-c="contact" title={d.contact_person ?? undefined}>
                    {d.contact_person ?? '—'}
                  </td>
                  <td className="td" data-c="package">
                    {d.package ? (
                      <span className={`pill ${PACKAGE_PILL_CLASS[d.package]}`}>{d.package}</span>
                    ) : (
                      <span className="text-paper-dim/50">—</span>
                    )}
                  </td>
                  {showRate && (
                    <td className="td figure whitespace-nowrap text-paper" data-c="bought">
                      {/* Tabular figures and no wrap, on one line like every
                          other cell here: a dealer who bought two codes still
                          gets one row height. The title carries the card
                          count, which is what turns this into the money on
                          the right. */}
                      {d.packagesBought ? (
                        <span title={`${d.packagesBoughtCount} package${d.packagesBoughtCount === 1 ? '' : 's'} — ${Math.round(d.cardEarningsRm / SIM_MARGIN_RM)} SIM cards at RM${SIM_MARGIN_RM.toFixed(2)} each`}>
                          {d.packagesBought}
                        </span>
                      ) : (
                        <span className="text-paper-dim/50">—</span>
                      )}
                    </td>
                  )}
                  {showRate && (
                    <td className="td figure whitespace-nowrap font-semibold text-paper" data-c="rate">
                      {d.rate != null ? `${d.rate}%` : '—'}
                    </td>
                  )}
                  {showRanking && (
                    <td className="td figure-points whitespace-nowrap text-right" data-c="topup">
                      {d.totalPoints > 0 ? `${d.totalPoints.toLocaleString()} pts` : <span className="text-paper-dim/50">—</span>}
                    </td>
                  )}
                  {showRate && (
                    <td className="td whitespace-nowrap text-right" data-c="cards">
                      {/* One line, always. A second line under the figure was
                          tried and reverted: it appeared only on the rows with
                          cards outstanding, which made those rows 81px against
                          64px everywhere else — the uneven-row-heights
                          complaint this project has already fixed twice.

                          So the shortfall rides on the figure itself, in the
                          same brass-and-semibold the delivery column uses for
                          an overdue shipment, with the count in the title. The
                          amount stays fully readable either way, so the colour
                          is a second signal rather than the only one; the full
                          entitled/sent/owed split lives on the dealer's own
                          page and on /sim-stock, which both have room for it. */}
                      {d.cardEarningsRm > 0 ? (
                        <span
                          className={`figure-money ${d.cardsOwed > 0 ? 'text-brass-bright' : ''}`}
                          title={
                            d.cardsOwed > 0
                              ? `${d.cardsOwed} of these cards have not been handed over yet`
                              : 'RM1.50 a card on everything their packages entitled them to'
                          }
                        >
                          {formatMYR(d.cardEarningsRm)}
                        </span>
                      ) : (
                        <span className="text-paper-dim/50">—</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Wrapper>
        )
      })}
      </DataGrid>
    </>
  )
}
