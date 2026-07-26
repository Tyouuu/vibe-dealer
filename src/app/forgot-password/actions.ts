'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

const RESET_MAX_ATTEMPTS = 3
const RESET_WINDOW_SECONDS = 15 * 60

// Always reports success regardless of whether the email is registered —
// resetPasswordForEmail itself never reveals that either, so a different
// message here would be the only leak. Rate-limited per email (not per IP,
// which is the login form's own axis) so someone can't be email-bombed with
// reset links by repeatedly submitting their address.
export async function requestPasswordReset(email: string): Promise<{ error: string | null }> {
  const trimmed = email.trim().toLowerCase()
  if (!trimmed) return { error: 'Please enter your email address.' }

  const supabase = await createClient()
  const h = await headers()

  const { data: allowed } = await supabase.rpc('check_rate_limit', {
    p_key: `reset:${trimmed}`,
    p_max_hits: RESET_MAX_ATTEMPTS,
    p_window_seconds: RESET_WINDOW_SECONDS,
  })
  if (allowed === false) {
    return { error: 'Too many reset requests. Please wait 15 minutes and try again.' }
  }

  const origin = h.get('origin') ?? `https://${h.get('host')}`
  await supabase.auth.resetPasswordForEmail(trimmed, {
    redirectTo: `${origin}/reset-password`,
  })

  return { error: null }
}
