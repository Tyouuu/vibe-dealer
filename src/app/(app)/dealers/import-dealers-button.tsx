'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { importDealers } from './actions'

export function ImportDealersButton() {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
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

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(() => {
      importDealers(formData)
    })
  }

  return (
    <div className="relative" ref={ref} onKeyDown={(e) => e.key === 'Escape' && closePanel()}>
      <button ref={triggerRef} type="button" className="btn-ghost" onClick={() => setOpen((o) => !o)}>
        ⇧ Import
      </button>
      {open && (
        <div className="dropdown-panel w-80 p-3">
          <p className="mb-2 text-xs text-paper-dim">
            CSV with a <code>company_name</code> column (required) plus any of company_no, contact_person, phone, email,
            region, address, package, status. Export the current list first to see the exact format. Duplicate company
            names are skipped.
          </p>
          <form onSubmit={handleSubmit} className="flex flex-col gap-2">
            <input type="file" name="file" accept=".csv,text/csv" required disabled={pending} className="field-input" />
            <button type="submit" disabled={pending} className="btn-primary disabled:opacity-60">
              {pending ? 'Importing…' : 'Upload & Import'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
