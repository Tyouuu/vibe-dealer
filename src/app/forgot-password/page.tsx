import type { Metadata } from 'next'
import { ForgotPasswordForm } from './forgot-password-form'
import { LogoMark } from '../(app)/icons'

export const metadata: Metadata = {
  title: 'Reset Password — DealerHub',
}

type PageProps = {
  searchParams: Promise<{ error?: string }>
}

export default async function ForgotPasswordPage({ searchParams }: PageProps) {
  const { error } = await searchParams
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
              <p className="text-lg font-extrabold tracking-tight text-paper">Reset your password</p>
              <p className="mt-0.5 text-xs font-medium text-paper-dim">We&apos;ll email you a link to set a new one.</p>
            </div>
          </div>
          <ForgotPasswordForm initialError={error} />
        </div>
      </div>
    </div>
  )
}
