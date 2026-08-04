'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser, ROLES, type Role } from '@/lib/auth/dal'
import { createServiceClient } from '@/lib/supabase/service'

function fail(message: string): never {
  redirect('/staff?error=' + encodeURIComponent(message))
}

const MIN_PASSWORD = 10

// Creating a staff account is the one thing in this app that needs the service
// role from a user-facing action: Supabase Auth users cannot be created by an
// ordinary session, and self-signup is off by design. Every entry point here
// re-checks master server-side — the nav link and the page guard are UX, this
// is the gate.
async function requireMaster() {
  const user = await requireUser()
  if (user.actualRole !== 'master') fail('Only the master account can manage staff.')
  return user
}

export async function createStaff(formData: FormData) {
  await requireMaster()

  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const name = String(formData.get('name') ?? '').trim()
  const role = String(formData.get('role') ?? '') as Role
  const password = String(formData.get('password') ?? '')

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Enter a valid email address.')
  if (!name) fail('Enter the person’s name — it is what the audit trail will show.')
  if (!ROLES.includes(role)) fail('Choose a role.')
  if (role === 'master') fail('There is one master account, and it is not created from here.')
  if (password.length < MIN_PASSWORD) fail(`The temporary password needs at least ${MIN_PASSWORD} characters.`)

  const admin = createServiceClient()

  // The two writes are the whole reason this screen exists. Done by hand in
  // the Supabase dashboard it is easy to create the auth user and forget the
  // profiles row, and that combination is silent: the person signs in with the
  // right password, getCurrentUser finds no profile, and they are bounced back
  // to the login page with nothing on screen to explain it. They conclude they
  // typed the password wrong. Forever.
  //
  // So: create the auth user, and if the profile insert fails for any reason,
  // delete the auth user again rather than leave that half-account behind.
  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    // No confirmation email to chase — the master hands over the temporary
    // password directly, which is also the only path that does not depend on
    // Supabase's own SMTP being configured.
    email_confirm: true,
  })

  if (authError || !created?.user) {
    const msg = String(authError?.message ?? '')
    if (/already been registered|already exists/i.test(msg)) fail('Someone already has an account with that email.')
    fail(`Could not create the account: ${msg || 'unknown error'}`)
  }

  const { error: profileError } = await admin.from('profiles').insert({
    id: created.user.id,
    email,
    name,
    role,
    active: true,
  })

  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id)
    fail(`Could not finish setting up the account, so nothing was created: ${profileError.message}`)
  }

  revalidatePath('/staff')
  redirect(`/staff?created=${encodeURIComponent(name)}`)
}

export async function setStaffRole(formData: FormData) {
  const master = await requireMaster()

  const id = String(formData.get('id') ?? '')
  const role = String(formData.get('role') ?? '') as Role
  if (!id) fail('Missing staff id.')
  if (!ROLES.includes(role)) fail('Choose a role.')
  if (id === master.id) fail('You cannot change your own role.')
  if (role === 'master') fail('A second master cannot be created from here.')

  const admin = createServiceClient()
  const { data: target } = await admin.from('profiles').select('role, name').eq('id', id).maybeSingle()
  if (!target) fail('That staff member no longer exists.')
  if (target.role === 'master') fail('The master account’s role cannot be changed from here.')

  const { error } = await admin.from('profiles').update({ role }).eq('id', id)
  if (error) fail(`Could not change the role: ${error.message}`)

  revalidatePath('/staff')
  redirect(`/staff?role_changed=${encodeURIComponent(target.name ?? 'that person')}`)
}

export async function setStaffActive(formData: FormData) {
  const master = await requireMaster()

  const id = String(formData.get('id') ?? '')
  const active = String(formData.get('active') ?? '') === 'true'
  if (!id) fail('Missing staff id.')
  // Locking yourself out of the only account that can manage staff would need
  // a database console to undo.
  if (id === master.id) fail('You cannot switch off your own account.')

  const admin = createServiceClient()
  const { data: target } = await admin.from('profiles').select('role, name').eq('id', id).maybeSingle()
  if (!target) fail('That staff member no longer exists.')
  if (target.role === 'master') fail('The master account cannot be switched off from here.')

  const { error } = await admin.from('profiles').update({ active }).eq('id', id)
  if (error) fail(`Could not update the account: ${error.message}`)

  revalidatePath('/staff')
  redirect(`/staff?${active ? 'enabled' : 'disabled'}=${encodeURIComponent(target.name ?? 'that person')}`)
}

// A forgotten password, without depending on email. The master sets a new
// temporary one and hands it over the same way they handed over the first.
export async function resetStaffPassword(formData: FormData) {
  const master = await requireMaster()

  const id = String(formData.get('id') ?? '')
  const password = String(formData.get('password') ?? '')
  if (!id) fail('Missing staff id.')
  if (id === master.id) fail('Change your own password from Account settings.')
  if (password.length < MIN_PASSWORD) fail(`The temporary password needs at least ${MIN_PASSWORD} characters.`)

  const admin = createServiceClient()
  const { data: target } = await admin.from('profiles').select('role, name').eq('id', id).maybeSingle()
  if (!target) fail('That staff member no longer exists.')
  if (target.role === 'master') fail('The master password is not reset from here.')

  const { error } = await admin.auth.admin.updateUserById(id, { password })
  if (error) fail(`Could not set the password: ${error.message}`)

  revalidatePath('/staff')
  redirect(`/staff?password_set=${encodeURIComponent(target.name ?? 'that person')}`)
}
