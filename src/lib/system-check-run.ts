import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { interpret, type CheckRun, type RawCheckRow } from './system-check'

// Running the checks and keeping what they said. The wording and severities are in system-check.ts;
// this is the part that talks to the database, kept apart so the wording can be tested without one.

/**
 * Asks the database to check itself. Throws if it could not — a run that failed to happen must be
 * loud, because "no problems reported" and "nothing was checked" look identical on a quiet day.
 *
 * `client` must be the service-role client: run_system_checks() reads every finance table and is
 * granted to no one else (0058). Whoever calls this is responsible for having checked that the
 * person asking is a master or an accountant.
 */
export async function runSystemChecks(client: SupabaseClient): Promise<CheckRun> {
  const { data, error } = await client.rpc('run_system_checks')
  if (error) throw new Error(`The system check could not run: ${error.message}`)
  return interpret((data ?? []) as RawCheckRow[])
}

export type StoredRun = CheckRun & { id: string; ranAt: string }

/** Runs the checks and records the result, so "has this been clean all month?" is a record. */
export async function runAndStoreSystemChecks(
  client: SupabaseClient,
  opts: { source: 'nightly' | 'manual'; runBy: string | null },
): Promise<StoredRun> {
  const run = await runSystemChecks(client)
  const { data, error } = await client
    .from('system_check_runs')
    .insert({
      source: opts.source,
      run_by: opts.runBy,
      results: run.results,
      fail_count: run.failCount,
      warn_count: run.warnCount,
    })
    .select('id, ran_at')
    .single()
  // The checks ran and their answer is in hand, so a failure to file it must not throw the answer
  // away — but it is not silent either: the caller decides, and the nightly route reports it.
  if (error || !data) throw new Error(`The system check ran but could not be saved: ${error?.message ?? 'no row returned'}`)
  return { ...run, id: data.id as string, ranAt: data.ran_at as string }
}
