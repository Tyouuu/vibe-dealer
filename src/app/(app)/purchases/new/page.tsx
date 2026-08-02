import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/dal'
import { PermissionDenied } from '../../permission-denied'
import { todayInMalaysia } from '@/lib/month'
import { PageHeader } from '../../page-header'
import { PurchaseForm } from '../purchase-form'

export const metadata: Metadata = {
  title: 'Log a purchase — DealerHub',
}

type PageProps = {
  searchParams: Promise<{ error?: string }>
}

// Logging a purchase gets its own page, the way onboarding a dealer and
// entering a transaction already do.
//
// Measured across the app: seven pages carry exactly one card, and the three
// that carried more were the three the client picked out as not fitting. In
// every case the extra card was a form sitting inside a page whose job is to
// show you something. Credit Purchases shows a balance and a history; the
// form is the action on it, so it moves where the app's other create actions
// already live rather than a third pattern being invented for it.
//
// There is a note in the parent page arguing the opposite — that the form is
// this page's primary task and hiding it is the mistake NN/g warns about. It
// was right about disclosure: this form was once folded behind a toggle in
// place, which does hide it. A primary button in the page header is not the
// same thing. It is where New Transaction and Onboard Dealer are reached
// from, and nobody would call those hidden.
export default async function NewPurchasePage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { error } = await searchParams

  if (user.role !== 'accountant' && user.role !== 'master') {
    return <PermissionDenied role={user.role} action="log credit purchases" />
  }

  return (
    <div className="flex w-full flex-col">
      <PageHeader
        title="Log a purchase"
        subtitle="Each entry adds to the points balance. Verified dealer transactions subtract from it — the balance on Credit Purchases is what's left to sell."
        action={
          <Link href="/purchases" className="btn-ghost shrink-0">
            Back to Credit Purchases
          </Link>
        }
      />

      {error && <div className="alert alert-bad">{error}</div>}

      <div className="app-card mt-4">
        <PurchaseForm today={todayInMalaysia()} />
      </div>
    </div>
  )
}
