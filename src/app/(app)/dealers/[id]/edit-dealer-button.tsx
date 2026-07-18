'use client'

import { useEffect, useRef, useState } from 'react'
import { updateDealer } from '../actions'

type DealerFields = {
  id: string
  company_name: string
  company_no: string | null
  contact_person: string | null
  phone: string | null
  email: string | null
  address: string | null
  region: string | null
}

export function EditDealerButton({ dealer }: { dealer: DealerFields }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  return (
    <div className="relative inline-block" ref={ref}>
      <button type="button" className="btn-ghost py-1.5 text-xs" onClick={() => setOpen((o) => !o)}>
        Edit
      </button>
      {open && (
        <div className="dropdown-panel w-[420px] max-w-[90vw] p-4">
          <p className="mb-3 text-xs font-semibold text-paper">Edit dealer info</p>
          <form action={updateDealer} className="flex flex-col gap-3">
            <input type="hidden" name="id" value={dealer.id} />
            <div className="form-grid">
              <div>
                <label className="field-label">
                  Company Name<span className="req"> *</span>
                </label>
                <input name="company_name" defaultValue={dealer.company_name} required className="field-input" />
              </div>
              <div>
                <label className="field-label">Company No. (SSM)</label>
                <input name="company_no" defaultValue={dealer.company_no ?? ''} className="field-input" />
              </div>
              <div>
                <label className="field-label">Contact Person</label>
                <input name="contact_person" defaultValue={dealer.contact_person ?? ''} className="field-input" />
              </div>
              <div>
                <label className="field-label">Phone Number</label>
                <input name="phone" defaultValue={dealer.phone ?? ''} className="field-input" />
              </div>
              <div className="sm:col-span-2">
                <label className="field-label">Email</label>
                <input name="email" type="email" defaultValue={dealer.email ?? ''} className="field-input" />
              </div>
              <div className="sm:col-span-2">
                <label className="field-label">Address</label>
                <input name="address" defaultValue={dealer.address ?? ''} className="field-input" />
              </div>
              <div>
                <label className="field-label">Region</label>
                <input name="region" defaultValue={dealer.region ?? ''} className="field-input" />
              </div>
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <button type="submit" className="btn-primary flex-1">
                Save Changes
              </button>
              <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
