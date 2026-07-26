import Link from 'next/link'
import { LogoMark } from './(app)/icons'

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center bg-ink-950 px-4">
      <div className="w-full max-w-sm text-center">
        <LogoMark className="mx-auto mb-5 h-11 w-11" />
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
