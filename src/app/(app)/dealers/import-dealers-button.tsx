'use client'

import { useState } from 'react'
import { importDealers } from './actions'

export function ImportDealersButton() {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button type="button" className="btn-ghost" onClick={() => setOpen((o) => !o)}>
        ⇧ Import
      </button>
      {open && (
        <div className="dropdown-panel w-80 p-3">
          <p className="mb-2 text-xs text-paper-dim">
            CSV with a <code>company_name</code> column (required) plus any of company_no, contact_person, phone, email,
            region, address, package, status. Export the current list first to see the exact format. Duplicate company
            names are skipped.
          </p>
          <form action={importDealers} className="flex flex-col gap-2">
            <input type="file" name="file" accept=".csv,text/csv" required className="field-input" />
            <button type="submit" className="btn-primary">
              Upload &amp; Import
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
