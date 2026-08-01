'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

// Unlike Combobox (strict — you must pick one of its options) this is a
// plain text field that also suggests matches as you type. Region is
// deliberately free text (lib/regions.ts normalizeRegion never rejects an
// unknown value, it only snaps a known one to its canonical casing), so a
// forced-choice select would block onboarding a dealer in a town that isn't
// in the preset list yet.
export function TextAutocomplete({
  name,
  value,
  defaultValue,
  onChange,
  suggestions,
  placeholder,
  required,
}: {
  name: string
  value?: string
  defaultValue?: string
  onChange?: (v: string) => void
  suggestions: string[]
  placeholder?: string
  required?: boolean
}) {
  const isControlled = value !== undefined
  const [internal, setInternal] = useState(defaultValue ?? '')
  const current = isControlled ? (value ?? '') : internal
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

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

  const filtered = useMemo(() => {
    const q = current.trim().toLowerCase()
    if (!q) return suggestions
    return suggestions.filter((s) => s.toLowerCase().includes(q))
  }, [suggestions, current])

  return (
    <div className="relative" ref={ref} onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
      <input
        ref={inputRef}
        name={name}
        type="text"
        value={current}
        onChange={(e) => {
          set(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        className="field-input"
      />
      {open && filtered.length > 0 && (
        <div className="dropdown-panel left-0 right-auto max-h-56 w-full min-w-full overflow-y-auto p-1.5">
          {filtered.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                set(s)
                setOpen(false)
                inputRef.current?.focus()
              }}
              className={`block w-full rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold transition-colors hover:bg-primary-soft ${
                s === current ? 'bg-primary-soft text-primary-deep' : 'text-paper'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
