'use client'

import { useState } from 'react'
import { setStaffRole, setStaffActive, resetStaffPassword } from './actions'
import { Listbox } from '../listbox'
import { ConfirmSubmitButton } from '../confirm-submit-button'

export function StaffRow({
  id,
  name,
  email,
  role,
  roleLabel,
  active,
  isSelf,
  isMaster,
  since,
  avatar,
  statusDot,
}: {
  id: string
  name: string
  email: string
  role: string
  roleLabel: string
  active: boolean
  isSelf: boolean
  isMaster: boolean
  since: string | null
  avatar: React.ReactNode
  statusDot: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [newPassword, setNewPassword] = useState('')

  // The master account and your own account are not editable from here. Both
  // guards exist server-side too — these just stop the page offering something
  // it will refuse, which is worse than not offering it.
  const locked = isMaster || isSelf

  return (
    <li className="border-t border-ink-800 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {avatar}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2">
              <span className="truncate text-[13px] font-semibold text-paper">{name}</span>
              {/* A bordered chip, not .pill-neutral — that class is only a
                  dim text colour, so "CS (test)  CS" and "Accountant (test)
                  Master you" came out as three same-sized words in a row with
                  nothing saying which was the name and which the role. */}
              <span className="rounded-md border border-ink-800 bg-ink-850 px-1.5 py-0.5 text-[12px] font-semibold text-paper-dim">
                {roleLabel}
              </span>
              {isSelf && <span className="text-[12px] text-paper-dim">you</span>}
            </div>
            <p className="truncate text-[12px] text-paper-dim">
              {email}
              {since && ` · added ${since}`}
            </p>
          </div>
        </div>

        {statusDot}

        {!locked && (
          <button type="button" onClick={() => setOpen((o) => !o)} className="btn-ghost py-1 text-xs">
            {open ? 'Done' : 'Manage'}
          </button>
        )}
      </div>

      {open && !locked && (
        <div className="mt-3 flex flex-wrap items-end gap-3 rounded-lg bg-ink-850 p-3">
          <form action={setStaffRole} className="flex items-end gap-2">
            <input type="hidden" name="id" value={id} />
            <div>
              <span className="field-label">Role</span>
              <div className="w-40">
                <Listbox
                  name="role"
                  defaultValue={role}
                  options={[
                    { value: 'accountant', label: 'Accountant' },
                    { value: 'cs', label: 'CS' },
                  ]}
                />
              </div>
            </div>
            <button type="submit" className="btn-ghost py-2">
              Change
            </button>
          </form>

          <form action={resetStaffPassword} className="flex items-end gap-2">
            <input type="hidden" name="id" value={id} />
            <div>
              <span className="field-label">New temporary password</span>
              <input
                name="password"
                minLength={10}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="field-input w-52 font-mono"
                placeholder="At least 10 characters"
              />
            </div>
            <button type="submit" className="btn-ghost py-2">
              Set
            </button>
          </form>

          {/* Switching someone off, never deleting them: transactions,
              dealers and rate history all point at this row, and an audit
              trail that loses the name of whoever did something is not one. */}
          <form action={setStaffActive} className="ml-auto">
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="active" value={active ? 'false' : 'true'} />
            {active ? (
              <ConfirmSubmitButton
                className="btn-clay py-2"
                confirmMessage={`Switch off ${name}? They will not be able to sign in. Everything they have recorded stays exactly as it is.`}
              >
                Switch off
              </ConfirmSubmitButton>
            ) : (
              <button type="submit" className="btn-jade py-2">
                Let them back in
              </button>
            )}
          </form>
        </div>
      )}
    </li>
  )
}
