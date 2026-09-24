import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { getNotificationPrefs, NOTIFICATION_CATEGORIES } from '@/lib/notifications/preferences'
import { parseUserAgent } from '@/lib/auth/login-events'
import { ChangePasswordForm } from './change-password-form'
import { NotificationPrefsForm } from './notification-prefs-form'
import { PhoneNotifications } from './phone-notifications'
import { pushConfigured } from '@/lib/push'
import { ReportSenderNameForm } from './report-sender-name-form'
import { ReportFrequencyForm } from './report-frequency-form'
import { SessionsPanel, type SignInEvent } from './sessions-panel'

import type { ReportFrequency } from '@/lib/reports/report-period'
import { ROLE_LABEL } from '../types'
import { PageHeader } from '../page-header'

export const metadata: Metadata = {
  title: 'Account — Vibe456',
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
    user.role === 'master' ? supabase.from('profiles').select('report_sender_name, report_frequency').eq('id', user.id).single() : Promise.resolve({ data: null }),
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
  // Phone alerts carry two categories: Deliveries (a parcel to ship: master and cs) and Credit &
  // reconciliation (a failed system check: master and accountant). Shown to any role that has one of them —
  // a role with neither would be offered a switch for a thing that can never reach it.
  const showPhoneAlerts = pushConfigured() && visibleCategories.some((c) => c.key === 'deliveries' || c.key === 'credit_reconciliation')

  const sections = [
    { id: 'profile', label: 'Profile' },
    ...(user.role === 'master' ? [{ id: 'emailed-report', label: 'Emailed report' }] : []),
    { id: 'notifications', label: 'Notifications' },
    { id: 'sessions', label: 'Sessions' },
    { id: 'security', label: 'Security' },
  ]

  return (
    // Cards, one per concern — and now in a column the width of what they
    // hold, with an index in the space that leaves.
    //
    // The cards were full-width (1,136px) while every one of them capped its
    // own contents: max-w-2xl on Profile, max-w-3xl on Notifications and
    // Sessions, max-w-xl on Security. Those caps are right — a checkbox at
    // the far right of a 1,300px row is a long way from the label that says
    // what it does — but they were applied INSIDE a full-width box, so each
    // card ended with a different amount of blank to its right: measured at
    // 440, 581, 359, 359 and 536px. Five ragged margins read as five
    // unfinished cards. This was the only page in the app where the empty
    // space was not a deliberate hero margin.
    //
    // So the cap moves out to the column and the inner caps come off: the
    // content fills its card, and the leftover is one margin on the page
    // rather than five inside it. The index then uses that margin for
    // something — this is the one page in this product where the job is
    // "find the thing", which is exactly when Polaris says a settings page
    // earns a section nav.
    <div className="w-full lg:grid lg:grid-cols-[184px_minmax(0,720px)] lg:items-start lg:gap-8">
      <div className="lg:col-span-2">
        <PageHeader title="Account Settings" subtitle="Your profile, alerts, sessions and password" />
      </div>

      {/* Anchors, not tabs: every section stays on the page and Ctrl+F still
          finds all of it. Hidden below lg, where the column collapses and
          scrolling past four cards is shorter than reading an index. */}
      <nav aria-label="Settings sections" className="hidden lg:sticky lg:top-2 lg:block">
        <ul className="flex flex-col gap-0.5">
          {sections.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="block rounded-lg px-3 py-1.5 text-[13px] font-medium text-paper-dim hover:bg-ink-850 hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex w-full flex-col gap-5">

      <section id="profile" className="app-card scroll-mt-3">
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
        <dl className="divide-y divide-ink-800 border-y border-ink-800">
          <ReadOnlyRow label="Name" value={user.name ?? '—'} />
          <ReadOnlyRow label="Email" value={user.email ?? '—'} />
          <ReadOnlyRow label="Role" value={ROLE_LABEL[user.role]} />
        </dl>

        {user.role === 'master' && (
          <div className="mt-6">
            <ReportSenderNameForm initialValue={profileRow?.report_sender_name ?? ''} />
          </div>
        )}
      </section>

      {/* Its own section, not a field under Profile. How often you are emailed
          is a decision about your working week; the sender name is a string on
          an email. They were sitting together only because both concern the
          report. */}
      {user.role === 'master' && (
        <section id="emailed-report" className="app-card scroll-mt-3">
        <h2 className="form-block-title">Emailed report</h2>
          <p className="form-block-desc">
            A summary of what was verified — top-up, your 2%, the busiest dealer, and what is still waiting on you.
          </p>
          <ReportFrequencyForm initialValue={(profileRow?.report_frequency ?? 'daily') as ReportFrequency} />
        </section>
      )}

      <section id="notifications" className="app-card scroll-mt-3">
        <h2 className="form-block-title">Notifications</h2>
        <p className="form-block-desc">
          Pick which alerts reach you. Switching a category off silences it everywhere — the bell, the toast, the daily email and your phone.
        </p>
        {/* Capped. A checkbox at the far right of a 1300px row is a long way
            from the label that says what it does; Fitts's law aside, the eye
            simply loses the pairing. */}
        <div>
          <NotificationPrefsForm masterEnabled={prefs.masterEnabled} categories={prefs.categories} visibleCategories={visibleCategories} />
        </div>
        {showPhoneAlerts && (
          <div className="mt-4">
            <PhoneNotifications publicKey={process.env.VAPID_PUBLIC_KEY ?? ''} />
          </div>
        )}
      </section>

      <section id="sessions" className="app-card scroll-mt-3">
        <h2 className="form-block-title">Sessions</h2>
        <p className="form-block-desc">
          Every device currently signed in as you. If you don&apos;t recognise one, sign the others out and change your password.
        </p>
        <div>
          <SessionsPanel currentDevice={currentDevice} since={since} history={pastHistory} />
        </div>
      </section>

      <section id="security" className="app-card scroll-mt-3">
        <h2 className="form-block-title">Security</h2>
        <p className="form-block-desc">Change your password. At least 10 characters; you&apos;ll stay signed in on this device.</p>
        <div>
          <ChangePasswordForm />
        </div>
      </section>
      </div>
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
