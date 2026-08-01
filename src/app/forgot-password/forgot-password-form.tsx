'use client'

import { useState } from 'react'
import Link from 'next/link'
import { requestPasswordReset } from './actions'
import { IconMail } from '../(app)/icons'

export function ForgotPasswordForm({ initialError }: { initialError?: string }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(initialError ?? null)
  const [sent, setSent] = useState(false)
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)

    const { error } = await requestPasswordReset(email)
    setPending(false)

    if (error) {
      setError(error)
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <div className="alert alert-ok">If that email has an account, we&apos;ve sent a link to reset your password.</div>
        <Link href="/login" className="foot-link text-center text-[12px] text-primary-deep">
          Back to Sign In
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <div className="alert alert-bad">{error}</div>}

      <div>
        <label htmlFor="email" className="field-label">
          Email
        </label>
        <div className="relative">
          <IconMail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-dim" />
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field-input pl-10"
          />
        </div>
      </div>

      <button type="submit" disabled={pending} className="btn-primary mt-1 w-full py-2.5">
        {pending ? 'Sending…' : 'Send Reset Link'}
      </button>

      <Link href="/login" className="text-center text-[12px] text-primary-deep">
        Back to Sign In
      </Link>
    </form>
  )
}
