'use client'

import { LogoMark } from './(app)/icons'

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-ink-950 px-4">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full opacity-[0.16] blur-3xl"
        style={{ background: 'var(--color-primary)' }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 -right-24 h-[380px] w-[380px] rounded-full opacity-[0.12] blur-3xl"
        style={{ background: 'var(--color-primary-deep)' }}
      />

      <div className="relative w-full max-w-sm text-center">
        <span
          className="mx-auto mb-5 inline-block"
          style={{ filter: 'drop-shadow(0 8px 20px rgba(108, 92, 231, 0.35))' }}
        >
          <LogoMark className="h-12 w-12" />
        </span>
        <p className="text-base font-bold text-paper">Something went wrong</p>
        <p className="mt-1.5 text-sm text-paper-dim">
          That&apos;s on us — nothing you did caused this. Try again, and it should be back to normal.
        </p>
        <button type="button" onClick={reset} className="btn-primary mt-6 inline-flex">
          Try again
        </button>
      </div>
    </div>
  )
}
