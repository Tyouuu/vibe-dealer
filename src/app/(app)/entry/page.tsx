import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { EntryForm } from './entry-form'

export const metadata: Metadata = {
  title: 'New Transaction — DealerHub',
}

type PageProps = {
  searchParams: Promise<{ error?: string; dealer?: string }>
}

export default async function EntryPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { error, dealer } = await searchParams

  if (user.role !== 'accountant' && user.role !== 'master') {
    return <div className="app-card text-sm text-paper-dim">Your role ({user.role}) does not have permission to enter transactions.</div>
  }

  const supabase = await createClient()
  const { data: dealers } = await supabase
    .from('dealers')
    .select('id, company_name, package, rate')
    .order('company_name', { ascending: true })

  return (
    <>
      {error && <div className="alert alert-bad">{error}</div>}
      <EntryForm dealers={dealers ?? []} initialDealerId={dealer} />
    </>
  )
}
