import type { Metadata } from 'next'
import { ResetPasswordForm } from './reset-password-form'
import { LogoMark } from '../(app)/icons'

export const metadata: Metadata = {
  title: 'Set New Password — DealerHub',
}

export default function ResetPasswordPage() {
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-ink-950 px-4">
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
              <p className="text-lg font-extrabold tracking-tight text-paper">Set a new password</p>
              <p className="mt-0.5 text-xs font-medium text-paper-dim">Choose something you haven&apos;t used before.</p>
            </div>
          </div>
          <ResetPasswordForm />
        </div>
      </div>
    </div>
  )
}
