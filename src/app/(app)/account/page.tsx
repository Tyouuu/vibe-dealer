import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { getNotificationPrefs, NOTIFICATION_CATEGORIES } from '@/lib/notifications/preferences'
import { parseUserAgent } from '@/lib/auth/login-events'
import { ChangePasswordForm } from './change-password-form'
import { NotificationPrefsForm } from './notification-prefs-form'
import { ReportSenderNameForm } from './report-sender-name-form'
import { SessionsPanel, type SignInEvent } from './sessions-panel'

import { ROLE_LABEL } from '../types'
import { PageHeader } from '../page-header'

export const metadata: Metadata = {
  title: 'Account — DealerHub',
}

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
  // login_events has no session identifier, so this is "the most recent
  // sign-in on record for this user" — not necessarily the device viewing
  // this page right now (the app supports concurrent multi-device sessions,
  // so an older-but-still-valid session opening Account Settings would see
  // someone else's device/time here). Labeled accordingly below rather than
  // as "This device".
  const currentDevice = latest ? parseUserAgent(latest.user_agent) : 'This browser'
  const since = latest ? formatSignInTime(latest.created_at) : null
  const pastHistory = history.slice(1)
  const visibleCategories = NOTIFICATION_CATEGORIES.filter((c) => c.roles.includes(user.role))

  return (
    // Four cards, one per concern, each carrying its own heading and one
    // line of explanation.
    //
    // This was the annotated two-column pattern — explanation in a 2fr
    // column, controls in 5fr. Polaris does prescribe that for settings, and
    // it is the right call when there are many sections to scan; with four,
    // the left column mostly stood empty while the controls column got
    // ~1300px, which is how a checkbox ended up 1800px from the label it
    // belongs to. Stripe, GitHub and Linear all build settings as stacked
    // cards instead, and that is what this is now.
    <div className="flex w-full flex-col gap-5">
      <PageHeader title="Account Settings" subtitle="Your profile, alerts, sessions and password" />

      <section className="app-card">
        <h2 className="form-block-title">Profile</h2>
        {/* "Managed by your admin" was on all three rows, which is three
            copies of one fact stacked in a column. It belongs to the block, so
            it is said once where the block is introduced. */}
        <p className="form-block-desc">
          How you&apos;re identified across the app — on the audit log, and as the author of anything you verify.
          {user.role !== 'master' && ' All three are set by your admin and cannot be changed here.'}
        </p>

        {/* A definition list, not three disabled inputs. None of these can be
            edited here, and drawing an input box around a value that cannot
            be typed into invites people to try. */}
        <dl className="max-w-2xl divide-y divide-ink-800 border-y border-ink-800">
          <ReadOnlyRow label="Name" value={user.name ?? '—'} />
          <ReadOnlyRow label="Email" value={user.email ?? '—'} />
          <ReadOnlyRow label="Role" value={ROLE_LABEL[user.role]} />
        </dl>

        {user.role === 'master' && (
          <div className="mt-6 max-w-xl">
            <ReportSenderNameForm initialValue={profileRow?.report_sender_name ?? ''} />
          </div>
        )}
      </section>

      <section className="app-card">
        <h2 className="form-block-title">Notifications</h2>
        <p className="form-block-desc">
          Pick which alerts reach you. Switching a category off silences it everywhere — the bell, the toast and the daily email.
        </p>
        {/* Capped. A checkbox at the far right of a 1300px row is a long way
            from the label that says what it does; Fitts's law aside, the eye
            simply loses the pairing. */}
        <div className="max-w-3xl">
          <NotificationPrefsForm masterEnabled={prefs.masterEnabled} categories={prefs.categories} visibleCategories={visibleCategories} />
        </div>
      </section>

      <section className="app-card">
        <h2 className="form-block-title">Sessions</h2>
        <p className="form-block-desc">
          Every device currently signed in as you. If you don&apos;t recognise one, sign the others out and change your password.
        </p>
        <div className="max-w-3xl">
          <SessionsPanel currentDevice={currentDevice} since={since} history={pastHistory} />
        </div>
      </section>

      <section className="app-card">
        <h2 className="form-block-title">Security</h2>
        <p className="form-block-desc">Change your password. At least 8 characters; you&apos;ll stay signed in on this device.</p>
        <div className="max-w-xl">
          <ChangePasswordForm />
        </div>
      </section>
    </div>
  )
}

// One immutable fact about the account. Label left, value right, hairline
// between — the shape a value you can only read should have.
function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3">
      <dt className="text-[13px] text-paper-dim">{label}</dt>
      <dd className="flex items-center gap-3 text-[13px]">
        <span className="font-semibold text-paper">{value}</span>
      </dd>
    </div>
  )
}
