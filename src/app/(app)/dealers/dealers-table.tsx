'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Avatar } from '../avatar'
import { IconBuilding, IconMapPin, IconPhone, IconUsers, IconTag, IconTrendUp, IconChevronDown, IconStar, IconSend, IconCard, IconTrophy } from '../icons'
import { PACKAGE_PILL_CLASS } from '@/lib/packages'
import { DataGrid } from '../data-grid'
import { formatMYR } from '@/lib/money'
import { toggleDealerPin } from './actions'

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
  submitToken: string | null
  /** RM1.50 a card on everything their packages entitled them to. */
  cardEarningsRm: number
  /** Entitled but not yet handed over. Stock the business still owes them. */
  cardsOwed: number
  totalPoints: number
  rank: number | null
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
}: {
  dealers: DealerRow[]
  groupByRegion: boolean
  showRate: boolean
  showRanking: boolean
  /** Where the app is served from, resolved server-side — see lib/site-url. */
  origin: string
}) {
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
                        {d.company_no && <div className="truncate text-[12px] text-paper-dim">{d.company_no}</div>}
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
  )
}
