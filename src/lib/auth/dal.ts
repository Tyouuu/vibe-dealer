import 'server-only'

import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type Role = 'master' | 'accountant' | 'cs'

export type CurrentUser = {
  id: string
  email: string | null
  name: string | null
  role: Role
}

// Cached per request: safe to call from multiple Server Components without
// re-hitting Supabase Auth / the profiles table each time.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, role')
    .eq('id', user.id)
    .single()

  // Authenticated with Supabase Auth but no profiles row (e.g. not yet
  // provisioned by master) — treat as unauthenticated for this app.
  if (!profile) return null

  return {
    id: user.id,
    email: user.email ?? null,
    name: profile.name,
    role: profile.role as Role,
  }
})

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
}
