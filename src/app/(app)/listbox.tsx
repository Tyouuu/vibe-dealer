'use client'

import { useEffect, useRef, useState } from 'react'
import { IconChevronDown } from './icons'

export type ListboxOption = { value: string; label: string; dotColor?: string }

// Self-contained by default (writes a hidden input, drops into any plain
// server-rendered <form> with just name/defaultValue/options) — but also
// supports controlled usage (value/onChange) for cases like New Transaction's
// Package field, where the selection drives other client-side state.
export function Listbox({
  name,
  value: controlledValue,
  defaultValue,
  onChange,
  options,
}: {
  name?: string
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  options: ListboxOption[]
}) {
  const isControlled = controlledValue !== undefined
  const [internalValue, setInternalValue] = useState(defaultValue ?? options[0]?.value ?? '')
  const value = isControlled ? controlledValue : internalValue
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  function closePanel() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  function pick(v: string) {
    if (!isControlled) setInternalValue(v)
    onChange?.(v)
    closePanel()
  }

  const selected = options.find((o) => o.value === value)

  return (
    <div className="relative" ref={ref} onKeyDown={(e) => e.key === 'Escape' && closePanel()}>
      {name && <input type="hidden" name={name} value={value} />}
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`trigger-btn ${open ? 'open' : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        {selected?.dotColor && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: selected.dotColor }} />}
        <span className="truncate">{selected?.label ?? 'Select…'}</span>
        <IconChevronDown className={`ml-auto h-3.5 w-3.5 shrink-0 text-paper-dim transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div role="listbox" className="dropdown-panel w-full min-w-full p-1.5">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={value === o.value}
              onClick={() => pick(o.value)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-semibold transition-colors hover:bg-primary-soft ${
                value === o.value ? 'bg-primary-soft text-paper' : 'text-paper'
              }`}
            >
              {o.dotColor && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: o.dotColor }} />}
              <span className="flex-1 truncate">{o.label}</span>
              {value === o.value && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0 text-primary">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
