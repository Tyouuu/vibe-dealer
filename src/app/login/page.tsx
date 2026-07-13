import type { Metadata } from 'next'
import { LoginForm } from './login-form'
import { LogoMark } from '../(app)/icons'

export const metadata: Metadata = {
  title: 'Sign In — DealerHub',
}

export default function LoginPage() {
  return (
    <div className="grid min-h-screen place-items-center bg-ink-950 px-4">
      <div className="w-full max-w-sm">
        <div className="app-card">
          <div className="mb-6 flex flex-col items-center gap-2.5 text-center">
            <span style={{ filter: 'drop-shadow(0 6px 16px rgba(20, 122, 78, 0.35))' }}>
              <LogoMark className="h-11 w-11" />
            </span>
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
