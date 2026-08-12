import type { Metadata } from 'next'
import { ResetPasswordForm } from './reset-password-form'
import { LogoMark } from '../(app)/icons'

export const metadata: Metadata = {
  title: 'Set New Password — Vibe456',
}

// Same shell as /login and /forgot-password.
export default function ResetPasswordPage() {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-[400px]">
        {/* Same landmarks as /login — see the note there. */}
        <header className="mb-6 flex items-center justify-center gap-2.5">
          <LogoMark className="h-8 w-8" />
          <span className="text-[17px] font-semibold tracking-[-0.02em] text-paper">Vibe456</span>
        </header>

        <main className="app-card p-7">
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-paper">Set a new password</h1>
          <p className="mt-1.5 text-[13px] text-paper-dim">At least 10 characters, and not one you use anywhere else.</p>

          <div className="mt-6">
            <ResetPasswordForm />
          </div>
        </main>
      </div>
    </div>
  )
}
