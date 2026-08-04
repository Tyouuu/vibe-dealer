import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/dal'
import { PermissionDenied } from '../permission-denied'
import { OnboardForm } from './onboard-form'

export const metadata: Metadata = {
  title: 'Onboard Dealer — Vibe456',
}

type PageProps = {
  searchParams: Promise<{ error?: string }>
}

export default async function OnboardPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { error } = await searchParams

  if (user.role !== 'cs' && user.role !== 'master') {
    return <PermissionDenied role={user.role} action="onboard dealers" />
  }

  return <OnboardForm initialError={error} />
}
