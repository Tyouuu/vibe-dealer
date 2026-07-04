import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { EntryForm } from './entry-form'

export const metadata: Metadata = {
  title: '录入交易 — DealerHub',
}

type PageProps = {
  searchParams: Promise<{ error?: string }>
}

export default async function EntryPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { error } = await searchParams

  if (user.role !== 'accountant' && user.role !== 'master') {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-400">
        你的角色（{user.role}）没有录入交易权限。
      </div>
    )
  }

  const supabase = await createClient()
  const { data: dealers } = await supabase
    .from('dealers')
    .select('id, company_name, package, rate')
    .order('company_name', { ascending: true })

  return (
    <>
      {error && (
        <div className="mb-4 rounded-lg border border-red-800 bg-red-950/50 px-3.5 py-2.5 text-sm text-red-300">
          {error}
        </div>
      )}
      <EntryForm dealers={dealers ?? []} />
    </>
  )
}
