import 'server-only'

import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type Role = 'master' | 'accountant' | 'cs'

const ROLES: Role[] = ['master', 'accountant', 'cs']

// Cookie a real master account can set to preview the app as another role —
// for demoing, never a real permission change. Only ever honored when the
// underlying profiles.role is 'master' (see getCurrentUser below), so it can
// only ever narrow what an account can do, never escalate it. All writes
// still record the real auth uid, and Supabase RLS still enforces against
// the real profiles.role — this only changes what our own app-level role
// checks (nav items, page gates) see.
export const PREVIEW_ROLE_COOKIE = 'preview_role'

export type CurrentUser = {
  id: string
  email: string | null
  name: string | null
  role: Role
  /** The role on the profiles row, ignoring any preview override. */
  actualRole: Role
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

  const actualRole = profile.role as Role

  let role = actualRole
  if (actualRole === 'master') {
    const previewCookie = (await cookies()).get(PREVIEW_ROLE_COOKIE)?.value
    if (previewCookie && ROLES.includes(previewCookie as Role)) {
      role = previewCookie as Role
    }
  }

  return {
    id: user.id,
    email: user.email ?? null,
    name: profile.name,
    role,
    actualRole,
  }
})

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
}
