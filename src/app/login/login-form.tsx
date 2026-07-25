'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from './actions'
import { IconMail, IconLock, IconEye, IconEyeOff } from '../(app)/icons'

export function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)

    const { error } = await signIn(email, password)

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

      <button type="submit" disabled={pending} className="btn-primary mt-1 w-full py-2.5">
        {pending ? 'Signing in…' : 'Sign In'}
      </button>

      <p className="text-center text-[11.5px] text-paper-dim">Forgot your password? Contact your admin.</p>
    </form>
  )
}
