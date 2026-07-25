'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Avatar } from './avatar'
import { IconChevronDown, IconSearch } from './icons'

export type ComboboxOption = {
  value: string
  label: string
  sublabel?: string
  avatarName?: string
  avatarPackage?: string | null
}

// Controlled (value/onChange), unlike Listbox/MonthPicker — entry-form needs
// to drive the selection programmatically (Recent-dealer shortcuts) and react
// to it (auto-filling other fields), so a plain hidden-input-only component
// isn't enough here.
export function Combobox({
  name,
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder = 'Search…',
}: {
  name?: string
  value: string
  onChange: (value: string) => void
  options: ComboboxOption[]
  placeholder: string
  searchPlaceholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  function openPanel() {
    setQuery('')
    setOpen(true)
    requestAnimationFrame(() => searchRef.current?.focus())
  }

  function closePanel() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.label.toLowerCase().includes(q))
  }, [options, query])

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
        onClick={() => (open ? closePanel() : openPanel())}
      >
        {selected?.avatarName && <Avatar name={selected.avatarName} package={selected.avatarPackage} size={22} />}
        <span className={`truncate ${selected ? '' : 'text-paper-dim'}`}>{selected ? selected.label : placeholder}</span>
        <IconChevronDown className={`ml-auto h-3.5 w-3.5 shrink-0 text-paper-dim transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="dropdown-panel w-full min-w-full p-0">
          <div className="flex items-center gap-2 border-b border-ink-800 px-3 py-2.5">
            <IconSearch className="h-3.5 w-3.5 shrink-0 text-paper-dim" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent text-[13.5px] text-paper outline-none placeholder:text-paper-dim/70"
            />
          </div>
          <div role="listbox" className="max-h-64 overflow-y-auto p-1.5">
            {filtered.length ? (
              filtered.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={value === o.value}
                  onClick={() => {
                    onChange(o.value)
                    closePanel()
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-primary-soft ${
                    value === o.value ? 'bg-primary-soft' : ''
                  }`}
                >
                  {o.avatarName && <Avatar name={o.avatarName} package={o.avatarPackage} size={26} />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-bold text-paper">{o.label}</span>
                    {o.sublabel && <span className="block truncate text-[11.5px] text-paper-dim">{o.sublabel}</span>}
                  </span>
                  {value === o.value && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0 text-primary">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </button>
              ))
            ) : (
              <p className="px-3 py-6 text-center text-sm text-paper-dim">No dealers found.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
