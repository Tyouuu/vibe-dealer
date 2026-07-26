import type { Metadata } from 'next'
import { ResetPasswordForm } from './reset-password-form'
import { LogoMark } from '../(app)/icons'

export const metadata: Metadata = {
  title: 'Set New Password — DealerHub',
}

export default function ResetPasswordPage() {
  return (
    <div className="grid min-h-screen place-items-center bg-ink-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <LogoMark className="h-11 w-11" />
          <div>
            <p className="text-xl font-bold tracking-tight text-paper">Set a new password</p>
            <p className="mt-1 text-xs font-medium text-paper-dim">Choose something you haven&apos;t used before.</p>
          </div>
        </div>
        <ResetPasswordForm />
      </div>
    </div>
  )
}
