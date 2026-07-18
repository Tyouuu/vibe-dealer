import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/dal'
import { OnboardForm } from './onboard-form'

export const metadata: Metadata = {
  title: 'Onboard Dealer — DealerHub',
}

type PageProps = {
  searchParams: Promise<{ error?: string }>
}

export default async function OnboardPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { error } = await searchParams

  if (user.role !== 'cs' && user.role !== 'master') {
    return <div className="app-card text-sm text-paper-dim">Your role ({user.role}) does not have permission to onboard dealers.</div>
  }

  return <OnboardForm initialError={error} />
}
