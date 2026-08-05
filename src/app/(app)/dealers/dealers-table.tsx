'use client'

import Link from 'next/link'
import { Avatar } from '../avatar'
import { IconBuilding, IconMapPin, IconPhone, IconUsers, IconTag, IconTrendUp, IconChevronDown, IconStar } from '../icons'
import { PACKAGE_PILL_CLASS } from '@/lib/packages'
import { ScrollFade } from '../scroll-fade'
import { toggleDealerPin } from './actions'

export type DealerRow = {
  id: string
  company_name: string
  company_no: string | null
  contact_person: string | null
  phone: string | null
  region: string | null
  package: 'A' | 'B' | 'C' | null
  rate: number | null
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

function RankBadge({ rank }: { rank: number | null }) {
  if (rank == null) return <span className="text-paper-dim/50">—</span>
  // No status dot. #1 used to render as `pill pill-brass`, which now draws the
  // amber dot that means "pending" everywhere else — a rank is a position, not
  // a state. The top three are distinguished by weight and a chip; the rest
  // are plain figures.
  if (rank <= 3) {
    return (
      <span className={`pill pill-neutral ${rank === 1 ? 'font-semibold text-paper' : ''}`} title={`#${rank} by cumulative top-up`}>
        #{rank}
      </span>
    )
  }
  return <span className="figure text-paper-dim">#{rank}</span>
}

export function DealersTable({
  dealers,
  groupByRegion,
  showRate,
  showRanking,
}: {
  dealers: DealerRow[]
  groupByRegion: boolean
  showRate: boolean
  showRanking: boolean
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
    <ScrollFade label="Dealer directory">
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
          <table className="w-full min-w-[860px] table-fixed border-collapse text-sm">
            {/* Percentages, not fixed widths with one open column. Company
                was the bare <col>, so it absorbed all the table's slack —
                ~3.9x the median column, measured — which put a long empty
                run between the company name and the figures on every row,
                while the fixed columns stayed cramped. Same bug fixed on
                /audit.

                Widening Company to 34% to stop it truncating on a phone was
                tried and reverted: below ~1140px the table sits at its own
                min-width so it helped there, but above it the same 34%
                pooled slack again — 3.1x the median column at 1440, the
                exact bug this colgroup exists to fix. Eight columns do not
                fit a phone at any split; the answer was not a better split
                but title attributes on the three cells that clip, so the
                full value is a hover or a long-press away. Abbreviated is
                fine. Unrecoverable is not. */}
            <colgroup>
              {showRanking && <col className="w-[6%]" />}
              <col className="w-[26%]" />
              <col className="w-[13%]" />
              <col className="w-[15%]" />
              <col className="w-[16%]" />
              <col className="w-[9%]" />
              {showRate && <col className="w-[7%]" />}
              {showRanking && <col className="w-28" />}
            </colgroup>
            <thead>
              <tr>
                {showRanking && <th className="th w-12">Rank</th>}
                <th className="th">
                  <span className="inline-flex items-center gap-1.5">
                    <IconBuilding /> Company
                  </span>
                </th>
                <th className="th">
                  <span className="inline-flex items-center gap-1.5">
                    <IconMapPin /> Region
                  </span>
                </th>
                <th className="th">
                  <span className="inline-flex items-center gap-1.5">
                    <IconPhone /> Phone
                  </span>
                </th>
                <th className="th">
                  <span className="inline-flex items-center gap-1.5">
                    <IconUsers className="h-3.5 w-3.5" /> Contact
                  </span>
                </th>
                <th className="th">
                  <span className="inline-flex items-center gap-1.5">
                    <IconTag /> Package
                  </span>
                </th>
                {showRate && <th className="th">Rate</th>}
                {showRanking && (
                  <th className="th text-right">
                    <span className="inline-flex items-center gap-1.5">
                      <IconTrendUp className="h-3.5 w-3.5" /> Top-up
                    </span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className="tr-row group relative h-16">
                  {showRanking && (
                    <td className="td">
                      <RankBadge rank={d.rank} />
                    </td>
                  )}
                  <td className="td">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <PinButton dealer={d} />
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
                        {d.company_no && <div className="text-[12px] text-paper-dim">{d.company_no}</div>}
                      </div>
                    </div>
                  </td>
                  {/* title on every cell that can truncate. Eight columns do
                      not fit a phone, and something has to clip — but clipped
                      with no way to see the rest is information gone, not
                      information abbreviated. "Tanjong Piandang" was arriving
                      as "Tanjong Pian…" and "AZLINA BINTI BAHARUDDIN" lost
                      half its length, with nothing to recover it. */}
                  <td className="td truncate text-paper-dim" title={d.region ?? undefined}>{d.region ?? '—'}</td>
                  <td className="td figure text-paper-dim">{d.phone ?? '—'}</td>
                  <td className="td truncate text-paper-dim" title={d.contact_person ?? undefined}>{d.contact_person ?? '—'}</td>
                  <td className="td">
                    {d.package ? (
                      <span className={`pill ${PACKAGE_PILL_CLASS[d.package]}`}>{d.package}</span>
                    ) : (
                      <span className="text-paper-dim/50">—</span>
                    )}
                  </td>
                  {showRate && <td className="td figure font-semibold text-paper">{d.rate != null ? `${d.rate}%` : '—'}</td>}
                  {showRanking && (
                    <td className="td figure-points relative text-right">
                      {d.totalPoints > 0 ? `${d.totalPoints.toLocaleString()} pts` : <span className="text-paper-dim/50">—</span>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Wrapper>
        )
      })}
    </ScrollFade>
  )
}
