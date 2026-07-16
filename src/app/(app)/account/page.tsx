import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/dal'
import { ChangePasswordForm } from './change-password-form'
import { IconUsers, IconLock } from '../icons'

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
    <div className="flex max-w-xl flex-col gap-5">
      <h1 className="text-[26px] font-extrabold tracking-tight text-paper">Account Settings</h1>

      <div className="app-card">
        <div className="form-section-head">
          <span className="tile">
            <IconUsers />
          </span>
          <span>Profile</span>
          <span className="rule" />
        </div>
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

      <div className="app-card">
        <div className="form-section-head">
          <span className="tile">
            <IconLock />
          </span>
          <span>Security</span>
          <span className="rule" />
        </div>
        <ChangePasswordForm />
      </div>
    </div>
  )
}
