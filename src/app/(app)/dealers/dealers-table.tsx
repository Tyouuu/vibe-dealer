'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Avatar } from '../avatar'
import { IconBuilding, IconMapPin, IconPhone, IconUsers, IconTag, IconCheckCircle } from '../icons'
import { setDealerStatus, bulkSetDealerStatus } from './actions'

export type DealerRow = {
  id: string
  company_name: string
  company_no: string | null
  contact_person: string | null
  phone: string | null
  region: string | null
  package: 'A' | 'B' | 'C' | null
  rate: number | null
  status: 'active' | 'inactive'
  isInactive: boolean
  isSeverelyInactive: boolean
  daysSinceLastActivity: number | null
}

const PACKAGE_STYLE: Record<string, string> = {
  A: 'pill-neutral',
  B: 'pill-jade',
  C: 'pill-brass',
}

export function DealersTable({
  dealers,
  groupByRegion,
  canManage,
}: {
  dealers: DealerRow[]
  groupByRegion: boolean
  canManage: boolean
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll(ids: string[]) {
    setSelected((prev) => {
      const allSelected = ids.every((id) => prev.has(id))
      const next = new Set(prev)
      if (allSelected) ids.forEach((id) => next.delete(id))
      else ids.forEach((id) => next.add(id))
      return next
    })
  }

  function runBulk(status: 'active' | 'inactive') {
    const ids = [...selected]
    startTransition(async () => {
      await bulkSetDealerStatus(ids, status)
      setSelected(new Set())
    })
  }

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
    <div className="relative">
      <div className="overflow-x-auto">
        {groups.map(([region, rows]) => (
          <details key={region || 'flat'} open className="mb-3 last:mb-0">
            {groupByRegion && (
              <summary className="mb-2 flex cursor-pointer list-none items-center gap-2 text-xs font-bold uppercase tracking-wide text-paper-dim">
                <span className="inline-block transition-transform [details[open]_&]:rotate-90">▸</span>
                {region} <span className="pill pill-neutral">{rows.length}</span>
              </summary>
            )}
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {canManage && (
                    <th className="th w-8">
                      <input
                        type="checkbox"
                        checked={rows.every((r) => selected.has(r.id))}
                        onChange={() => toggleAll(rows.map((r) => r.id))}
                        aria-label="Select all"
                      />
                    </th>
                  )}
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
                  <th className="th">Rate</th>
                  <th className="th">
                    <span className="inline-flex items-center gap-1.5">
                      <IconCheckCircle className="h-3.5 w-3.5" /> Status
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id} className="tr-row group relative">
                    {canManage && (
                      <td className="td">
                        <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} aria-label={`Select ${d.company_name}`} />
                      </td>
                    )}
                    <td className="td">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={d.company_name} />
                        <div>
                          <div className="flex items-center gap-2">
                            <Link href={`/dealers/${d.id}`} className="font-semibold text-paper hover:text-jade-bright">
                              {d.company_name}
                            </Link>
                            {d.isInactive && (
                              <span className={`pill ${d.isSeverelyInactive ? 'pill-clay' : 'pill-brass'}`}>{d.daysSinceLastActivity}d</span>
                            )}
                          </div>
                          {d.company_no && <div className="text-[11px] text-paper-dim">{d.company_no}</div>}
                        </div>
                      </div>
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
                    <td className="td figure font-semibold text-paper">{d.rate != null ? `${d.rate}%` : '—'}</td>
                    <td className="td">
                      {canManage ? (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              await setDealerStatus(d.id, d.status === 'active' ? 'inactive' : 'active')
                            })
                          }
                          className={`pill cursor-pointer transition-opacity hover:opacity-70 disabled:opacity-40 ${
                            d.status === 'active' ? 'pill-jade' : 'pill-neutral'
                          }`}
                          title="Click to toggle status"
                        >
                          {d.status === 'active' ? 'Active' : 'Inactive'}
                        </button>
                      ) : (
                        <span className={d.status === 'active' ? 'pill pill-jade' : 'pill pill-neutral'}>
                          {d.status === 'active' ? 'Active' : 'Inactive'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        ))}
      </div>

      {canManage && selected.size > 0 && (
        <div className="sticky bottom-4 z-20 mt-3 flex items-center gap-3 rounded-xl border border-ink-800 bg-paper px-4 py-3 text-white shadow-2xl">
          <span className="text-sm font-bold">{selected.size} selected</span>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" disabled={pending} onClick={() => runBulk('active')} className="btn-jade">
              Set Active
            </button>
            <button type="button" disabled={pending} onClick={() => runBulk('inactive')} className="btn-clay">
              Set Inactive
            </button>
            <button type="button" onClick={() => setSelected(new Set())} className="text-xs font-semibold text-white/60 hover:text-white">
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
