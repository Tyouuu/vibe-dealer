import type { Metadata } from 'next'
import { LoginForm } from './login-form'
import { LogoMark } from '../(app)/icons'

export const metadata: Metadata = {
  title: 'Sign In — Vibe456',
}

type PageProps = {
  searchParams: Promise<{ reset?: string; ended?: string; idle?: string }>
}

export default async function LoginPage({ searchParams }: PageProps) {
  const { reset, ended, idle } = await searchParams
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
          <span className="text-[17px] font-semibold tracking-[-0.02em] text-paper">Vibe456</span>
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

          {/* Someone whose account was switched off mid-session lands here.
              Without a word they would assume the password stopped working
              and try it again, and again. */}
          {ended && (
            <div className="alert alert-warn mt-4">
              Your session has ended because your account is no longer active. Ask your admin if you think that is wrong.
            </div>
          )}

          {/* Says how long and why, because a screen that only says "sign in
              again" reads as a fault. This one is the system working: the
              machines here are shared, and a ledger left open on an empty desk
              is the thing being prevented. */}
          {idle && (
            <div className="alert alert-warn mt-4">
              Signed out after 15 minutes without activity, so the ledger is not left open on an unattended screen. On your own
              machine, tick &ldquo;Remember me&rdquo; below and this will not happen again.
            </div>
          )}

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
