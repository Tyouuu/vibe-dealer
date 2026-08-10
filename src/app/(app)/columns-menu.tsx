'use client'

import { useEffect, useRef, useState } from 'react'
import { IconChevronDown } from './icons'
import {
  columnCookieName,
  hiddenColumnCss,
  serializeHiddenColumns,
  type ColumnSpec,
  type TableId,
} from '@/lib/table-columns'

// Which columns this table is showing.
//
// The <style> element is rendered here rather than by the page so that one
// component owns it in both renders: the server produces it from the cookie,
// so the first paint already has the right columns hidden, and the client
// takes it over on hydration with no flash and no mismatch.
//
// Toggling writes the cookie directly instead of going through a Server
// Action. The visible effect is a style rule, which React applies on the spot;
// the cookie only has to be right by the time the page is server-rendered
// again. A round trip here would make an instant control feel like a save.
export function ColumnsMenu({
  table,
  columns,
  hidden: initialHidden,
  alwaysOn,
}: {
  table: TableId
  columns: ColumnSpec[]
  hidden: string[]
  /** Named in the menu as fixed, so their absence does not read as an omission. */
  alwaysOn: string
}) {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(initialHidden))
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // The cookie follows the state rather than being written beside it, so the
  // two cannot drift. Skipped on the first run: mounting is not a choice, and
  // writing then would freeze today's defaults into the cookie of everyone who
  // merely loaded the page — after which changing a default here would never
  // reach them again.
  const mounted = useRef(false)
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    // A year, path-wide, Lax. Nothing here is a secret — it is which columns
    // someone likes looking at — but it rides on every request to this origin,
    // so it stays short: keys, dot-separated.
    document.cookie = `${columnCookieName(table)}=${serializeHiddenColumns(hidden)};path=/;max-age=31536000;samesite=lax`
  }, [hidden, table])

  function toggle(key: string) {
    const next = new Set(hidden)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setHidden(next)
  }

  const shownCount = columns.length - hidden.size

  return (
    <div className="relative" ref={wrapRef}>
      {/* The CSS is built from the fixed key list in lib/table-columns and a
          fixed table id — no value here ever comes from a request. */}
      <style dangerouslySetInnerHTML={{ __html: hiddenColumnCss(table, hidden) }} />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className="btn-ghost gap-1.5"
      >
        Columns
        {/* The count, not a dot. "Columns 6/8" says both that something is
            hidden and how much, which a badge cannot. */}
        <span className="figure text-paper-dim">
          {shownCount}/{columns.length}
        </span>
        <IconChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1.5 w-64 rounded-xl border border-ink-800 bg-ink-900 p-2 shadow-lg">
          <p className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.07em] text-paper-dim">
            Show these columns
          </p>
          {columns.map((col) => (
            <label
              key={col.key}
              className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-ink-850"
            >
              <input
                type="checkbox"
                checked={!hidden.has(col.key)}
                onChange={() => toggle(col.key)}
                className="mt-[3px] h-3.5 w-3.5 accent-primary"
              />
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-paper">{col.label}</span>
                {col.hint && <span className="block text-[11px] leading-snug text-paper-dim">{col.hint}</span>}
              </span>
            </label>
          ))}
          <p className="border-t border-ink-800 px-2 pb-1 pt-2 text-[11px] leading-snug text-paper-dim">
            {alwaysOn} always stay. Your choice is remembered on this device.
          </p>
        </div>
      )}
    </div>
  )
}
