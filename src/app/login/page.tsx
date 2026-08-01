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
    // The form now sits in a card on the canvas, which is how every other
    // surface in this app is built and how Stripe, Linear and Mercury all
    // build this screen. It was a bare form floating on a flat grey field —
    // the one page in the product with no surface at all, and the first
    // thing anyone sees.
    <div className="grid min-h-screen place-items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-[400px]">
        {/* Brand mark and wordmark above the card rather than inside it, so
            the card holds only the task. */}
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <LogoMark className="h-8 w-8" />
          <span className="text-[17px] font-semibold tracking-[-0.02em] text-paper">DealerHub</span>
        </div>

        <div className="app-card p-7">
          {/* 24px, not the 20px this was. The page had four type sizes inside
              a 1.7:1 range — 12/14/16/20 — which impeccable's detector reads
              as no hierarchy at all, and it was right: nothing on the page
              was clearly the most important thing. */}
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-paper">Sign in</h1>
          <p className="mt-1.5 text-[13px] text-paper-dim">
            Enter the email and password your admin set up for you.
          </p>

          <div className="mt-6">
            <LoginForm resetSuccess={reset === '1'} />
          </div>
        </div>

        <p className="mt-5 text-center text-[12px] text-paper-dim">
          Staff access only — accounts are set up by your admin, no self-signup.
        </p>
      </div>
    </div>
  )
}
