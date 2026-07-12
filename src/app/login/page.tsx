import type { Metadata } from 'next'
import { LoginForm } from './login-form'

export const metadata: Metadata = {
  title: 'Sign In — DealerHub',
}

export default function LoginPage() {
  return (
    <div className="grid min-h-screen place-items-center bg-ink-950 px-4">
      <div className="w-full max-w-sm">
        <div className="app-card">
          <div className="mb-6 flex flex-col items-center gap-2.5 text-center">
            <div
              className="grid h-11 w-11 place-items-center rounded-full bg-jade text-lg font-extrabold text-white"
              style={{ boxShadow: '0 0 0 6px rgba(20, 122, 78, 0.08), 0 6px 16px -4px rgba(20, 122, 78, 0.35)' }}
            >
              D
            </div>
            <div>
              <p className="text-base font-bold text-paper">DealerHub</p>
              <p className="text-xs text-paper-dim">Vibe Mobile · Master Ledger</p>
            </div>
          </div>
          <LoginForm />
        </div>
        <p className="mt-4 text-center text-[11px] text-paper-dim">
          Records money and points — never sums them, never places orders.
        </p>
      </div>
    </div>
  )
}
