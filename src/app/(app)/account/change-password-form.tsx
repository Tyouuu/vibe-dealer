'use client'

import { Field } from '../field'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function ChangePasswordForm() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (password.length < 10) {
      setError('Password must be at least 10 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setPending(true)
    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setPending(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setSuccess(true)
    setPassword('')
    setConfirm('')
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
      {error && <div className="alert alert-bad">{error}</div>}
      {success && <div className="alert alert-ok">Password updated.</div>}
      <div className="form-grid">
        <Field label="New password" hint="Must be at least 10 characters." required>
          {(id) => (
            <input
              id={id}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
              className="field-input"
            />
          )}
        </Field>
        <Field label="Confirm new password" required>
          {(id) => (
            <input
              id={id}
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
              className="field-input"
            />
          )}
        </Field>
      </div>
      <button type="submit" disabled={pending} className="btn-primary mt-1 w-fit">
        {pending ? 'Updating…' : 'Update Password'}
      </button>
    </form>
  )
}
