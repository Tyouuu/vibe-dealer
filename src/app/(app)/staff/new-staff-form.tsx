'use client'

import { useState } from 'react'
import { createStaff } from './actions'
import { Listbox } from '../listbox'

// A temporary password the master reads out, rather than an invite email.
//
// Supabase's own SMTP is not configured on this project, and its built-in
// sender is rate-limited to a handful of messages an hour — an invite flow
// resting on that would fail on the day it matters, for the one account that
// has to work. Resend is wired up for the daily report, not for Auth.
//
// So the handover is deliberately human: master sets a password, tells the
// person, they change it under Account. Suggested rather than imposed, because
// the master may want to use something they can say over the phone.
function suggestPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint32Array(14))
  return Array.from(bytes, (n) => alphabet[n % alphabet.length]).join('')
}

export function NewStaffForm() {
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('accountant')
  const [copied, setCopied] = useState(false)

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be blocked; the field itself is still selectable.
      setCopied(false)
    }
  }

  return (
    <div className="page-band">
      <h2 className="text-sm font-semibold text-paper">Add someone</h2>
      <p className="mb-4 mt-1 text-[12px] leading-relaxed text-paper-dim">
        Creates their sign-in and their role in one step. Both have to exist or the account half-works — an account with no
        role signs in and lands straight back on the login screen.
      </p>

      <form action={createStaff} className="form-grid">
        <div className="sm:col-span-3 lg:col-span-3">
          <label htmlFor="staff-name" className="field-label">
            Name<span className="req"> *</span>
          </label>
          <input id="staff-name" name="name" required className="field-input" placeholder="What the audit trail will show" />
        </div>

        <div className="sm:col-span-3 lg:col-span-3">
          <label htmlFor="staff-email" className="field-label">
            Email<span className="req"> *</span>
          </label>
          <input id="staff-email" name="email" type="email" required className="field-input" placeholder="them@example.com" />
        </div>

        <div className="sm:col-span-3 lg:col-span-3">
          <span className="field-label">
            Role<span className="req"> *</span>
          </span>
          <Listbox
            name="role"
            value={role}
            onChange={setRole}
            options={[
              { value: 'accountant', label: 'Accountant' },
              { value: 'cs', label: 'CS' },
            ]}
          />
          <p className="mt-1.5 text-[12px] leading-relaxed text-paper-dim">
            {role === 'accountant'
              ? 'Records and verifies transactions, reconciles the month, sees every figure.'
              : 'Onboards dealers and handles SIM delivery. Never sees rates, rankings, or the ledger.'}
          </p>
        </div>

        <div className="sm:col-span-3 lg:col-span-3">
          <label htmlFor="staff-password" className="field-label">
            Temporary password<span className="req"> *</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              id="staff-password"
              name="password"
              required
              minLength={10}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field-input font-mono"
              placeholder="At least 10 characters"
            />
            <button type="button" onClick={() => setPassword(suggestPassword())} className="btn-ghost shrink-0 py-2">
              Suggest
            </button>
            <button
              type="button"
              onClick={copyPassword}
              disabled={!password}
              className="btn-ghost shrink-0 py-2 disabled:opacity-40"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="mt-1.5 text-[12px] leading-relaxed text-paper-dim">
            You will not be shown this again — write it down or send it now.
          </p>
        </div>

        <div className="sm:col-span-6 lg:col-span-12">
          <button type="submit" className="btn-primary">
            Create account
          </button>
        </div>
      </form>
    </div>
  )
}
