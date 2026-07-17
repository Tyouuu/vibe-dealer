import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { getNotificationPrefs } from '@/lib/notifications/preferences'
import { parseUserAgent } from '@/lib/auth/login-events'
import { ChangePasswordForm } from './change-password-form'
import { NotificationPrefsForm } from './notification-prefs-form'
import { ReportSenderNameForm } from './report-sender-name-form'
import { SessionsPanel, type SignInEvent } from './sessions-panel'
import { IconInfo } from '../icons'

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

// Managed-by-admin note repeated under each disabled field — matches the
// GitHub Primer treatment the client picked (a note per field, not one
// shared banner for the whole section).
function AdminManagedNote() {
  return (
    <div className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-paper-dim">
      <IconInfo className="h-3 w-3 shrink-0" />
      Managed by your admin
    </div>
  )
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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <h1 className="text-[26px] font-extrabold tracking-tight text-paper">Account Settings</h1>

      <section>
        <h2 className="mb-4 text-[15px] font-extrabold text-paper">Profile</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <span className="field-label">Name</span>
            <div className="field-disabled">{user.name ?? '—'}</div>
            <AdminManagedNote />
          </div>
          <div>
            <span className="field-label">Email</span>
            <div className="field-disabled">{user.email ?? '—'}</div>
            <AdminManagedNote />
          </div>
          <div>
            <span className="field-label">Role</span>
            <div className="field-disabled">{ROLE_LABEL[user.role]}</div>
            <AdminManagedNote />
          </div>
        </div>
        {user.role === 'master' && (
          <div className="mt-6">
            <ReportSenderNameForm initialValue={profileRow?.report_sender_name ?? ''} />
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-[15px] font-extrabold text-paper">Notifications</h2>
        <NotificationPrefsForm masterEnabled={prefs.masterEnabled} categories={prefs.categories} />
      </section>

      <section>
        <h2 className="mb-4 text-[15px] font-extrabold text-paper">Sessions</h2>
        <SessionsPanel currentDevice={currentDevice} since={since} history={pastHistory} />
      </section>

      <section>
        <h2 className="mb-4 text-[15px] font-extrabold text-paper">Security</h2>
        <ChangePasswordForm />
      </section>
    </div>
  )
}
