'use server'

import { cookies } from 'next/headers'
import { requireUser, PREVIEW_ROLE_COOKIE, type Role } from '@/lib/auth/dal'

const ROLES: Role[] = ['master', 'accountant', 'cs']

// Lets a real master account preview the app as another role for demos —
// only ever narrows what's shown (see PREVIEW_ROLE_COOKIE), so this is safe
// to expose to any authenticated user: a non-master calling it is a no-op.
export async function setPreviewRole(role: Role) {
  const user = await requireUser()
  if (user.actualRole !== 'master' || !ROLES.includes(role)) return

  const jar = await cookies()
  if (role === 'master') {
    jar.delete(PREVIEW_ROLE_COOKIE)
  } else {
    jar.set(PREVIEW_ROLE_COOKIE, role, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 12,
    })
  }
}
