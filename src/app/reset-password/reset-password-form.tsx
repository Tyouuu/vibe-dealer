'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type Status = 'checking' | 'ready' | 'invalid'

// The reset link's session isn't visible to the server on first load, and
// @supabase/ssr's browser client — unlike the plain supabase-js client —
// doesn't auto-detect either shape it can arrive in, so both are handled by
// hand: a #access_token=...&refresh_token=... fragment (the shape
// admin.generateLink and, empirically, this project's resetPasswordForEmail
// both produce) is exchanged via setSession; a ?code=... query param (the
// PKCE shape some Supabase configurations use instead) via
// exchangeCodeForSession. Whichever it is, the token is single-use — a page
// refresh after this runs would just find no fragment/code left and no
// session at all.
export function ResetPasswordForm() {
  const router = useRouter()
  const [status, setStatus] = useState<Status>('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    async function establishSession() {
      const hashParams = new URLSearchParams(window.location.hash.slice(1))
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')
      const code = new URLSearchParams(window.location.search).get('code')

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        if (!cancelled) setStatus(error ? 'invalid' : 'ready')
        return
      }

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!cancelled) setStatus(error ? 'invalid' : 'ready')
        return
      }

      // No token in the URL at all — check for an existing session before
      // giving up, in case this page was reached some other way.
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!cancelled) setStatus(session ? 'ready' : 'invalid')
    }

    establishSession()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setPending(true)
    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setPending(false)
      setError(updateError.message)
      return
    }

    // The recovery link leaves the browser signed in as this user — sign out
    // so they land back on Sign In and prove the new password works, rather
    // than silently trusting a session someone else's mail client prefetched.
    await supabase.auth.signOut()
    router.push('/login?reset=1')
  }

  if (status === 'checking') {
    return <p className="text-center text-sm text-paper-dim">Verifying your reset link…</p>
  }

  if (status === 'invalid') {
    return (
      <div className="flex flex-col gap-4">
        <div className="alert alert-bad">That reset link is invalid or has expired.</div>
        <Link href="/forgot-password" className="text-center text-[12px] text-primary-deep">
          Request a new link
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <div className="alert alert-bad">{error}</div>}

      <div>
        <label htmlFor="password" className="field-label">
          New Password
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="field-input"
        />
      </div>

      <div>
        <label htmlFor="confirm" className="field-label">
          Confirm New Password
        </label>
        <input
          id="confirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="field-input"
        />
      </div>
      <span className="hint">Must be at least 8 characters.</span>

      <button type="submit" disabled={pending} className="btn-primary mt-1 w-full py-2.5">
        {pending ? 'Saving…' : 'Set New Password'}
      </button>
    </form>
  )
}
