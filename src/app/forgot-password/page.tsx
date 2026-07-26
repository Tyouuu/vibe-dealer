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
    <div className="grid min-h-screen place-items-center bg-ink-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <LogoMark className="h-11 w-11" />
          <div>
            <p className="text-xl font-bold tracking-tight text-paper">Reset your password</p>
            <p className="mt-1 text-xs font-medium text-paper-dim">We&apos;ll email you a link to set a new one.</p>
          </div>
        </div>
        <ForgotPasswordForm initialError={error} />
      </div>
    </div>
  )
}
