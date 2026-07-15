import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/dal'

export const metadata: Metadata = {
  title: 'Account — DealerHub',
}

const ROLE_LABEL = {
  master: 'Master',
  accountant: 'Accountant',
  cs: 'CS',
} as const

export default async function AccountPage() {
  const user = await requireUser()

  return (
    <div className="app-card max-w-md">
      <h1 className="mb-4 text-base font-bold text-paper">Account Settings</h1>
      <div className="profile-grid">
        <div className="profile-field">
          <label>Name</label>
          <div>{user.name ?? '—'}</div>
        </div>
        <div className="profile-field">
          <label>Email</label>
          <div>{user.email ?? '—'}</div>
        </div>
        <div className="profile-field">
          <label>Role</label>
          <div>{ROLE_LABEL[user.role]}</div>
        </div>
      </div>
      <p className="note-strip">
        Name and role are managed by Master when your account is set up. Contact Master to change either.
      </p>
    </div>
  )
}
