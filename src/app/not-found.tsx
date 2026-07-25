import Link from 'next/link'
import { LogoMark } from './(app)/icons'

export default function NotFound() {
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-ink-950 px-4">
      {/* Same two-glow composition as the login page — an unmatched route
          shouldn't suddenly drop back to a flat, unbranded screen. */}
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
        <p className="text-[64px] font-extrabold leading-none tracking-tight text-paper">404</p>
        <p className="mt-3 text-base font-bold text-paper">Page not found</p>
        <p className="mt-1.5 text-sm text-paper-dim">
          That page doesn&apos;t exist, or you don&apos;t have a link to it anymore.
        </p>
        <Link href="/" className="btn-primary mt-6 inline-flex">
          Back to DealerHub
        </Link>
      </div>
    </div>
  )
}
