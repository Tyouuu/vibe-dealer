'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import * as Sentry from '@sentry/nextjs'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runAndStoreSystemChecks } from '@/lib/system-check-run'
import { reportToSentry } from '@/lib/sentry-report'

// "Check now", for the moment someone has just fixed something or wants to know before the morning.
//
// It runs as the service role, because run_system_checks() reads every finance table and is granted to
// no one else (0058) — so the role check below is the only thing standing between a signed-in user and
// that function, and it is done here, in the action, before the service client is even created.
export async function runCheckNow() {
  const user = await requireUser()
  if (user.role !== 'master' && user.role !== 'accountant') redirect('/dashboard')

  // Each run reads every ledger row. Twelve an hour is generous for a person pressing a button and
  // small enough that a stuck script or a held-down key cannot keep the database busy.
  const supabase = await createClient()
  const { data: allowed } = await supabase.rpc('check_rate_limit', {
    p_key: `system-check:${user.id}`,
    p_max_hits: 12,
    p_window_seconds: 60 * 60,
  })
  if (allowed === false) redirect('/system-check?error=' + encodeURIComponent('That is a lot of checks in an hour — the last one is still on this page.'))

  let failed: string | null = null
  try {
    await runAndStoreSystemChecks(createServiceClient(), { source: 'manual', runBy: user.id })
  } catch (err) {
    failed = err instanceof Error ? err.message : 'The check did not run.'
    await reportToSentry(() => Sentry.captureException(err))
  }
  // Outside the try: redirect() works by throwing, and a catch would swallow it.
  if (failed) redirect('/system-check?error=' + encodeURIComponent(failed))

  revalidatePath('/system-check')
  redirect('/system-check')
}
