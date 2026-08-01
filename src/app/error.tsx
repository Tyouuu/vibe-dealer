'use client'

import { LogoMark } from './(app)/icons'

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid min-h-screen place-items-center bg-ink-950 px-4">
      <div className="w-full max-w-sm text-center">
        <LogoMark className="mx-auto mb-5 h-11 w-11" />
        <p className="text-base font-semibold text-paper">Something went wrong</p>
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
