'use client'

import { useEffect, useRef, useState } from 'react'
import { IconChevronDown } from './icons'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatLabel(value: string): string {
  if (!value) return ''
  const [y, m] = value.split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}

function currentYearMonth(): [number, number] {
  const now = new Date()
  return [now.getFullYear(), now.getMonth()]
}

// Self-contained: writes a hidden input so it drops into a plain server-
// rendered <form> (GET or POST) with zero wiring beyond name/defaultValue —
// no controlled state needed from the parent.
export function MonthPicker({
  name,
  defaultValue,
  placeholder = 'Select a month…',
  allowClear = false,
}: {
  name: string
  defaultValue?: string
  placeholder?: string
  allowClear?: boolean
}) {
  const [value, setValue] = useState(defaultValue ?? '')
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(() => (defaultValue ? Number(defaultValue.split('-')[0]) : currentYearMonth()[0]))
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  const [todayY, todayM] = currentYearMonth()
  const selY = value ? Number(value.split('-')[0]) : null
  const selM = value ? Number(value.split('-')[1]) - 1 : null

  function pick(monthIdx: number) {
    setValue(`${viewYear}-${String(monthIdx + 1).padStart(2, '0')}`)
    setOpen(false)
  }

  return (
    <div className="relative" ref={ref}>
      <input type="hidden" name={name} value={value} />
      <button type="button" className={`trigger-btn ${open ? 'open' : ''}`} onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[15px] w-[15px] shrink-0 text-paper-dim">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
        <span className={value ? '' : 'text-paper-dim'}>{value ? formatLabel(value) : placeholder}</span>
        <IconChevronDown className={`ml-auto h-3.5 w-3.5 text-paper-dim transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="dropdown-panel w-[260px] p-0">
          <div className="flex items-center justify-between px-3 py-2.5">
            <button type="button" className="grid h-6 w-6 place-items-center rounded-md border border-ink-800 text-paper-dim hover:bg-ink-850 hover:text-paper" onClick={() => setViewYear((y) => y - 1)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            <span className="text-[13px] font-extrabold text-paper">{viewYear}</span>
            <button type="button" className="grid h-6 w-6 place-items-center rounded-md border border-ink-800 text-paper-dim hover:bg-ink-850 hover:text-paper" onClick={() => setViewYear((y) => y + 1)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><path d="m9 18 6-6-6-6" /></svg>
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5 px-3 pb-3">
            {MONTHS.map((m, i) => {
              const isToday = viewYear === todayY && i === todayM
              const isSelected = viewYear === selY && i === selM
              return (
                <button
                  type="button"
                  key={m}
                  onClick={() => pick(i)}
                  className={`rounded-lg border-[1.5px] py-2 text-[12.5px] font-bold transition-colors ${
                    isSelected
                      ? 'border-primary bg-primary text-white'
                      : isToday
                        ? 'border-ink-800 text-paper hover:bg-ink-850'
                        : 'border-transparent text-paper hover:bg-ink-850'
                  }`}
                >
                  {m}
                </button>
              )
            })}
          </div>
          <div className="flex items-center justify-between border-t border-ink-800 px-3 py-2 text-xs font-bold">
            {allowClear ? (
              <button type="button" className="text-paper-dim hover:underline" onClick={() => { setValue(''); setOpen(false) }}>
                Clear
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              className="text-primary-deep hover:underline"
              onClick={() => {
                setViewYear(todayY)
                setValue(`${todayY}-${String(todayM + 1).padStart(2, '0')}`)
                setOpen(false)
              }}
            >
              This month
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
