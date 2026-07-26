import type { Metadata } from 'next'
import { LoginForm } from './login-form'
import { LogoMark } from '../(app)/icons'

export const metadata: Metadata = {
  title: 'Sign In — DealerHub',
}

type PageProps = {
  searchParams: Promise<{ reset?: string }>
}

export default async function LoginPage({ searchParams }: PageProps) {
  const { reset } = await searchParams
  return (
    <div className="grid min-h-screen place-items-center bg-ink-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <LogoMark className="h-11 w-11" />
          <p className="text-xl font-bold tracking-tight text-paper">Sign in to DealerHub</p>
        </div>
        <LoginForm resetSuccess={reset === '1'} />
        <p className="mt-6 text-center text-[11.5px] text-paper-dim">
          Staff access only — accounts are set up by your admin, no self-signup.
        </p>
      </div>
    </div>
  )
}
