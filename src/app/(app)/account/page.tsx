import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { getNotificationPrefs } from '@/lib/notifications/preferences'
import { parseUserAgent } from '@/lib/auth/login-events'
import { ChangePasswordForm } from './change-password-form'
import { NotificationPrefsForm } from './notification-prefs-form'
import { ReportSenderNameForm } from './report-sender-name-form'
import { SessionsPanel, type SignInEvent } from './sessions-panel'
import { IconUsers, IconLock, IconBell, IconDevices } from '../icons'

export const metadata: Metadata = {
  title: 'Account — DealerHub',
}

const ROLE_LABEL = {
  master: 'Master',
  accountant: 'Accountant',
  cs: 'CS',
} as const

function formatSignInTime(iso: string): string {
  return new Date(iso).toLocaleString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function AccountPage() {
  const user = await requireUser()
  const supabase = await createClient()

  const [prefs, { data: profileRow }, { data: loginRows }] = await Promise.all([
    getNotificationPrefs(supabase, user.id),
    user.role === 'master' ? supabase.from('profiles').select('report_sender_name').eq('id', user.id).single() : Promise.resolve({ data: null }),
    supabase.from('login_events').select('id, created_at, user_agent').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
  ])

  const history: SignInEvent[] = (loginRows ?? []).map((r) => ({
    id: r.id,
    device: parseUserAgent(r.user_agent),
    when: formatSignInTime(r.created_at),
  }))
  const latest = loginRows?.[0]
  const currentDevice = latest ? parseUserAgent(latest.user_agent) : 'This browser'
  const since = latest ? formatSignInTime(latest.created_at) : null
  // history[0] IS the current session's own sign-in row, already surfaced as
  // "This device" above — drop it from the list below so it isn't shown twice.
  const pastHistory = history.slice(1)

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
            <div className="field-disabled">{user.name ?? '—'}</div>
          </div>
          <div className="profile-field">
            <label>Email</label>
            <div className="field-disabled">{user.email ?? '—'}</div>
          </div>
          <div className="profile-field">
            <label>Role</label>
            <div className="field-disabled">{ROLE_LABEL[user.role]}</div>
          </div>
        </div>
        <p className="note-strip">
          Name and role are managed by Master when your account is set up. Contact Master to change either.
        </p>
        {user.role === 'master' && (
          <div className="mt-4 border-t border-ink-800 pt-4">
            <ReportSenderNameForm initialValue={profileRow?.report_sender_name ?? ''} />
          </div>
        )}
      </div>

      <div className="app-card">
        <div className="form-section-head">
          <span className="tile">
            <IconBell />
          </span>
          <span>Notifications</span>
          <span className="rule" />
        </div>
        <NotificationPrefsForm masterEnabled={prefs.masterEnabled} categories={prefs.categories} />
      </div>

      <div className="app-card">
        <div className="form-section-head">
          <span className="tile">
            <IconDevices />
          </span>
          <span>Sessions</span>
          <span className="rule" />
        </div>
        <SessionsPanel currentDevice={currentDevice} since={since} history={pastHistory} />
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
