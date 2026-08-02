import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/dal'
import { PermissionDenied } from '../../permission-denied'
import { PageHeader } from '../../page-header'
import { IntakeForm } from '../intake-form'
import { SIM_BOX_SIZE, SIM_UNIT_COST_RM } from '@/lib/sim-stock'
import { formatMYR } from '@/lib/money'

export const metadata: Metadata = {
  title: 'Log stock intake — DealerHub',
}

type PageProps = {
  searchParams: Promise<{ error?: string }>
}

// A box arriving from Vibe Mobile gets its own page, the way onboarding a
// dealer and entering a transaction already do. See purchases/new for why
// the three inline form cards moved: seven of the app's pages carry exactly
// one card, and the three that carried more were the three the client picked
// out as not fitting.
export default async function LogIntakePage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { error } = await searchParams

  if (user.role !== 'accountant' && user.role !== 'master') {
    return <PermissionDenied role={user.role} action="log SIM stock intake" />
  }

  return (
    <div className="flex w-full flex-col">
      <PageHeader
        title="Log stock intake"
        subtitle={`A box from Vibe Mobile, ${SIM_BOX_SIZE} cards at ${formatMYR(SIM_UNIT_COST_RM)} each. It adds to whichever pool you pick — the three cannot borrow from each other.`}
        action={
          <Link href="/sim-stock" className="btn-ghost shrink-0">
            Back to SIM Card Stock
          </Link>
        }
      />

      {error && <div className="alert alert-bad">{error}</div>}

      <div className="app-card mt-4">
        <IntakeForm />
      </div>
    </div>
  )
}
