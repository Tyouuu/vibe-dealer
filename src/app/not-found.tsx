import Link from 'next/link'
import { LogoMark } from './(app)/icons'

// <main> and a real <h1>, like every other page in the app.
//
// This file replaces the whole app shell — the rail, the <main> scrollport,
// the page heading — so a 404 was the one screen in the product with no main
// landmark, no level-one heading and no region wrapping its content (axe:
// landmark-one-main, page-has-heading-one, region ×4). It went unnoticed
// because it is the one screen nobody navigates to on purpose.
export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-4">
      <div className="w-full max-w-sm text-center">
        <LogoMark className="mx-auto mb-5 h-11 w-11" />
        {/* The figure and the sentence are one heading, so a screen reader
            announces "404, page not found" rather than a bare number. */}
        <h1 className="text-[64px] font-semibold leading-none tracking-tight text-paper">
          404
          <span className="mt-3 block text-base font-semibold text-paper">Page not found</span>
        </h1>
        <p className="mt-1.5 text-sm text-paper-dim">
          That page doesn&apos;t exist, or you don&apos;t have a link to it anymore.
        </p>
        <Link href="/" className="btn-primary mt-6 inline-flex">
          Back to Vibe456
        </Link>
      </div>
    </main>
  )
}
