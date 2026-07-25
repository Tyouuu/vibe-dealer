'use client'

import { useEffect, useRef, useState } from 'react'
import { REGIONS } from '@/lib/regions'
import { updateDealer } from '../actions'
import { checkDuplicateDealer } from '../../onboard/actions'

type DealerFields = {
  id: string
  company_name: string
  company_no: string | null
  contact_person: string | null
  phone: string | null
  email: string | null
  address: string | null
  region: string | null
  notes: string | null
}

export function EditDealerButton({ dealer }: { dealer: DealerFields }) {
  const [open, setOpen] = useState(false)
  const [duplicate, setDuplicate] = useState<{ id: string; company_name: string } | null>(null)
  const [checking, setChecking] = useState(false)
  const [submitting, setSubmitting] = useState(false)
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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)

    // Onboarding has always guarded against creating a same-name dealer —
    // renaming one via Edit had no equivalent check, so a typo could quietly
    // collide with an existing dealer. excludeId so a save that doesn't
    // change the name (matching itself) doesn't false-positive.
    if (!duplicate) {
      const newName = String(formData.get('company_name') ?? '')
      if (newName.trim().toLowerCase() !== dealer.company_name.trim().toLowerCase()) {
        setChecking(true)
        const existing = await checkDuplicateDealer(newName, dealer.id)
        setChecking(false)
        if (existing) {
          setDuplicate(existing)
          return
        }
      }
    } else {
      formData.set('confirm_duplicate', 'true')
    }

    setSubmitting(true)
    await updateDealer(formData)
  }

  return (
    <div className="relative inline-block" ref={ref} onKeyDown={(e) => e.key === 'Escape' && closePanel()}>
      <button ref={triggerRef} type="button" className="btn-ghost py-1.5 text-xs" onClick={() => setOpen((o) => !o)}>
        Edit
      </button>
      {open && (
        <div className="dropdown-panel w-[420px] max-w-[90vw] p-4">
          <p className="mb-3 text-xs font-semibold text-paper">Edit dealer info</p>
          {duplicate && (
            <div className="alert alert-bad mb-3">
              A dealer named &quot;{duplicate.company_name}&quot; already exists. Save again to confirm this rename is intentional.
            </div>
          )}
          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            <input type="hidden" name="id" value={dealer.id} />
            <div className="form-grid">
              <div>
                <label className="field-label">
                  Company Name<span className="req"> *</span>
                </label>
                <input
                  name="company_name"
                  defaultValue={dealer.company_name}
                  required
                  className="field-input"
                  onChange={() => setDuplicate(null)}
                />
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
              <div className="sm:col-span-2">
                <label className="field-label">Region</label>
                <input list="edit-dealer-regions" name="region" defaultValue={dealer.region ?? ''} className="field-input" />
                <datalist id="edit-dealer-regions">
                  {REGIONS.map((r) => (
                    <option key={r} value={r} />
                  ))}
                </datalist>
              </div>
              <div className="sm:col-span-2">
                <label className="field-label">Notes</label>
                <textarea name="notes" defaultValue={dealer.notes ?? ''} rows={2} className="field-input resize-none" />
              </div>
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <button type="submit" disabled={checking || submitting} className="btn-primary flex-1">
                {checking ? 'Checking…' : duplicate ? 'Yes, Save Anyway' : 'Save Changes'}
              </button>
              <button type="button" onClick={closePanel} className="btn-ghost">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
