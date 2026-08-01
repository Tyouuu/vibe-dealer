'use client'

import Link from 'next/link'
import { Avatar } from '../avatar'
import { IconBuilding, IconMapPin, IconPhone, IconUsers, IconTag, IconTrendUp, IconChevronDown } from '../icons'
import { PACKAGE_PILL_CLASS } from '@/lib/packages'
import { ScrollFade } from '../scroll-fade'

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
            <summary className="mb-2 flex cursor-pointer list-none items-center gap-2 text-xs font-bold uppercase tracking-wide text-paper-dim">
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
            <colgroup>
              {showRanking && <col className="w-14" />}
              <col />
              <col className="w-28" />
              <col className="w-32" />
              <col className="w-36" />
              <col className="w-20" />
              {showRate && <col className="w-16" />}
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
                <tr key={d.id} className="tr-row group relative">
                  {showRanking && (
                    <td className="td">
                      <RankBadge rank={d.rank} />
                    </td>
                  )}
                  <td className="td">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={d.company_name} />
                      <div>
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/dealers/${d.id}`}
                            className="font-semibold text-paper after:absolute after:inset-0 after:content-[''] hover:text-jade-bright"
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
                  <td className="td text-paper-dim">{d.region ?? '—'}</td>
                  <td className="td figure text-paper-dim">{d.phone ?? '—'}</td>
                  <td className="td text-paper-dim">{d.contact_person ?? '—'}</td>
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
