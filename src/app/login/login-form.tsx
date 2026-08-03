'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signIn } from './actions'
import { IconMail, IconLock, IconEye, IconEyeOff } from '../(app)/icons'

export function LoginForm({ resetSuccess }: { resetSuccess?: boolean }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  // Off by default. This is a financial system and the machines it runs on are
  // shared, so staying signed in is a choice someone makes, not one made for
  // them — the same default Stripe, Mercury and every bank ships.
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)

    const { error } = await signIn(email, password, rememberMe)

    if (error) {
      setError(error)
      setPending(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {resetSuccess && <div className="alert alert-ok">Password updated — sign in with your new password.</div>}
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

      <div>
        <label htmlFor="password" className="field-label">
          Password
        </label>
        <div className="relative">
          <IconLock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-dim" />
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field-input pl-10 pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-paper-dim transition-colors hover:text-paper"
          >
            {showPassword ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <label className="flex items-center gap-2 text-[12px] font-medium text-paper-dim">
        <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="h-4 w-4 accent-primary" />
        Remember me on this device
      </label>

      {/* "Sign in" — sentence case, matching the heading above it and every
          other action label in the app. It was "Sign In". */}
      <button type="submit" disabled={pending} className="btn-primary mt-1 w-full py-2.5">
        {pending ? 'Signing in…' : 'Sign in'}
      </button>

      {/* "No account? Contact your admin" moved out to the page footnote,
          which already says exactly that. What is left is the one thing
          someone stuck on this form can act on. */}
      <p className="text-center text-[12px]">
        <Link href="/forgot-password" className="font-medium text-primary-deep underline underline-offset-2 hover:no-underline">
          Forgot your password?
        </Link>
      </p>
    </form>
  )
}
