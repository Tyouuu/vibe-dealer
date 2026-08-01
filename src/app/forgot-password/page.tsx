import type { Metadata } from 'next'
import Link from 'next/link'
import { ForgotPasswordForm } from './forgot-password-form'
import { LogoMark } from '../(app)/icons'

export const metadata: Metadata = {
  title: 'Reset Password — DealerHub',
}

type PageProps = {
  searchParams: Promise<{ error?: string }>
}

// Same shell as /login and /reset-password: brand mark above, the task in a
// card on the canvas, one footnote below. These three pages were three
// slightly different centred stacks on a bare grey field.
export default async function ForgotPasswordPage({ searchParams }: PageProps) {
  const { error } = await searchParams
  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <LogoMark className="h-8 w-8" />
          <span className="text-[17px] font-semibold tracking-[-0.02em] text-paper">DealerHub</span>
        </div>

        <div className="app-card p-7">
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-paper">Reset your password</h1>
          <p className="mt-1.5 text-[13px] text-paper-dim">We&apos;ll email you a link to set a new one.</p>

          <div className="mt-6">
            <ForgotPasswordForm initialError={error} />
          </div>
        </div>

        <p className="mt-5 text-center text-[12px] text-paper-dim">
          Remembered it?{' '}
          <Link href="/login" className="font-medium text-primary-deep underline underline-offset-2 hover:no-underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
