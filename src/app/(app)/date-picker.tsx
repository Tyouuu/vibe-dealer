'use client'

import { useEffect, useRef, useState } from 'react'
import { IconChevronDown } from './icons'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function parseISO(v: string | undefined): { y: number; m: number; d: number } | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const [y, m, d] = v.split('-').map(Number)
  return { y, m: m - 1, d }
}

function toISO(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function formatDisplay(v: string): string {
  const p = parseISO(v)
  if (!p) return ''
  return `${p.d} ${MONTHS[p.m].slice(0, 3)} ${p.y}`
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate()
}

function firstWeekday(y: number, m: number): number {
  return new Date(y, m, 1).getDay()
}

// Controlled (value/onChange) or uncontrolled (defaultValue, writes a hidden
// input) — entry-form.tsx needs the value to gate max-date/other state, every
// other caller is a plain server-action <form> that just needs name+the
// eventual submitted value, same split as Combobox vs Listbox/MonthPicker.
export function DatePicker({
  name,
  value,
  defaultValue,
  onChange,
  min,
  max,
  placeholder = 'Select a date',
  allowClear = false,
  required,
  todayIso,
}: {
  name: string
  value?: string
  defaultValue?: string
  onChange?: (v: string) => void
  min?: string
  max?: string
  placeholder?: string
  allowClear?: boolean
  required?: boolean
  todayIso?: string
}) {
  const isControlled = value !== undefined
  const [internal, setInternal] = useState(defaultValue ?? '')
  const current = isControlled ? (value ?? '') : internal
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const anchor = parseISO(current) ?? parseISO(max) ?? parseISO(todayIso) ?? { y: new Date().getFullYear(), m: new Date().getMonth(), d: 1 }
  const [viewY, setViewY] = useState(anchor.y)
  const [viewM, setViewM] = useState(anchor.m)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  function set(v: string) {
    if (!isControlled) setInternal(v)
    onChange?.(v)
  }

  function closePanel() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  function openPanel() {
    const a = parseISO(current) ?? parseISO(max) ?? parseISO(todayIso)
    if (a) {
      setViewY(a.y)
      setViewM(a.m)
    }
    setOpen((o) => !o)
  }

  function isDisabled(iso: string) {
    if (min && iso < min) return true
    if (max && iso > max) return true
    return false
  }

  function pick(day: number) {
    const iso = toISO(viewY, viewM, day)
    if (isDisabled(iso)) return
    set(iso)
    closePanel()
  }

  function changeMonth(delta: number) {
    let m = viewM + delta
    let y = viewY
    if (m < 0) {
      m = 11
      y -= 1
    } else if (m > 11) {
      m = 0
      y += 1
    }
    setViewM(m)
    setViewY(y)
  }

  const total = daysInMonth(viewY, viewM)
  const lead = firstWeekday(viewY, viewM)
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)]
  const selected = parseISO(current)
  const today = parseISO(todayIso)

  return (
    <div className="relative" ref={ref} onKeyDown={(e) => e.key === 'Escape' && closePanel()}>
      <input type="hidden" name={name} value={current} required={required} />
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        className={`trigger-btn ${open ? 'open' : ''}`}
        onClick={openPanel}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[15px] w-[15px] shrink-0 text-paper-dim">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
        <span className={current ? '' : 'text-paper-dim'}>{current ? formatDisplay(current) : placeholder}</span>
        <IconChevronDown className={`ml-auto h-3.5 w-3.5 text-paper-dim transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="dropdown-panel w-[280px] p-0">
          <div className="flex items-center justify-between px-3 py-2.5">
            <button
              type="button"
              aria-label="Previous month"
              className="grid h-6 w-6 place-items-center rounded-md border border-ink-800 text-paper-dim hover:bg-ink-850 hover:text-paper"
              onClick={() => changeMonth(-1)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <span className="text-[13px] font-semibold text-paper">
              {MONTHS[viewM]} {viewY}
            </span>
            <button
              type="button"
              aria-label="Next month"
              className="grid h-6 w-6 place-items-center rounded-md border border-ink-800 text-paper-dim hover:bg-ink-850 hover:text-paper"
              onClick={() => changeMonth(1)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </div>
          <div className="grid grid-cols-7 gap-y-1 px-3">
            {WEEKDAYS.map((w, i) => (
              <span key={i} className="grid h-6 place-items-center text-[11px] font-semibold uppercase text-paper-dim/70">
                {w}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-1 px-3 pb-3">
            {cells.map((day, i) => {
              if (day == null) return <span key={i} />
              const iso = toISO(viewY, viewM, day)
              const disabled = isDisabled(iso)
              const isSelected = !!selected && selected.y === viewY && selected.m === viewM && selected.d === day
              const isToday = !!today && today.y === viewY && today.m === viewM && today.d === day
              return (
                <button
                  type="button"
                  key={i}
                  disabled={disabled}
                  onClick={() => pick(day)}
                  className={`grid h-8 w-8 place-items-center rounded-lg text-[12px] font-semibold transition-colors ${
                    disabled
                      ? 'cursor-not-allowed text-paper-dim/30'
                      : isSelected
                        ? 'bg-primary text-white'
                        : isToday
                          ? 'border-[1.5px] border-ink-800 text-paper hover:bg-ink-850'
                          : 'text-paper hover:bg-ink-850'
                  }`}
                >
                  {day}
                </button>
              )
            })}
          </div>
          <div className="flex items-center justify-between border-t border-ink-800 px-3 py-2 text-xs font-semibold">
            {allowClear ? (
              <button type="button" className="text-paper-dim hover:underline" onClick={() => { set(''); closePanel() }}>
                Clear
              </button>
            ) : (
              <span />
            )}
            {todayIso && !isDisabled(todayIso) && (
              <button
                type="button"
                className="text-primary-deep hover:underline"
                onClick={() => {
                  const t = parseISO(todayIso)!
                  setViewY(t.y)
                  setViewM(t.m)
                  set(todayIso)
                  closePanel()
                }}
              >
                Today
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
