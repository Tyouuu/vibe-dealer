import type { Metadata } from 'next'
import { LoginForm } from './login-form'
import { LogoMark } from '../(app)/icons'

export const metadata: Metadata = {
  title: 'Sign In — DealerHub',
}

export default function LoginPage() {
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-ink-950 px-4">
      {/* Two soft brand-colored glows, not a new palette entry — same
          primary/primary-deep tokens the logo tile itself uses. Purely
          composition; the flat single-tone background this replaced read as
          an afterthought next to every other page's more considered layout. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full opacity-[0.16] blur-3xl"
        style={{ background: 'var(--color-primary)' }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 -right-24 h-[380px] w-[380px] rounded-full opacity-[0.12] blur-3xl"
        style={{ background: 'var(--color-primary-deep)' }}
      />

      <div className="relative w-full max-w-sm">
        <div className="app-card">
          <div className="mb-7 flex flex-col items-center gap-3 text-center">
            <span style={{ filter: 'drop-shadow(0 8px 20px rgba(108, 92, 231, 0.35))' }}>
              <LogoMark className="h-12 w-12" />
            </span>
            <div>
              <p className="text-lg font-extrabold tracking-tight text-paper">DealerHub</p>
              <p className="mt-0.5 text-xs font-medium text-paper-dim">Vibe Mobile · Master Ledger</p>
            </div>
          </div>
          <LoginForm />
        </div>
        <p className="mt-5 text-center text-[11.5px] text-paper-dim">
          Staff access only — accounts are set up by your admin, no self-signup.
        </p>
      </div>
    </div>
  )
}
