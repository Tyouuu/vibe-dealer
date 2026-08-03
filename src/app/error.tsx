'use client'

import { LogoMark } from './(app)/icons'

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-4">
      <div className="w-full max-w-sm text-center">
        <LogoMark className="mx-auto mb-5 h-11 w-11" />
        <p className="text-base font-semibold text-paper">Something went wrong</p>
        <p className="mt-1.5 text-sm text-paper-dim">
          That&apos;s on us — nothing you did caused this. Try again, and it should be back to normal.
        </p>
        <button type="button" onClick={reset} className="btn-primary mt-6 inline-flex">
          Try again
        </button>
        {/* The digest is the id Next puts on the same error in the server logs
            and Sentry. Without it on screen, "it broke" is all anyone can
            report, and there is nothing to search on at the other end. */}
        {error.digest && (
          <p className="mt-5 text-[12px] text-paper-dim">
            Reference: <code className="font-mono">{error.digest}</code>
          </p>
        )}
      </div>
    </div>
  )
}
