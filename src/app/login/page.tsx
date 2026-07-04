import type { Metadata } from 'next'
import { LoginForm } from './login-form'

export const metadata: Metadata = {
  title: 'Sign In — DealerHub',
}

export default function LoginPage() {
  return (
    <div className="grid min-h-screen place-items-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-8">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 text-lg font-extrabold text-white">
            D
          </div>
          <div>
            <p className="text-base font-bold text-zinc-50">DealerHub</p>
            <p className="text-xs text-zinc-500">Vibe Mobile Dealer System</p>
          </div>
        </div>
        <LoginForm />
      </div>
    </div>
  )
}
