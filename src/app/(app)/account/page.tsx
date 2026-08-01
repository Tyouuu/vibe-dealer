import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { getNotificationPrefs, NOTIFICATION_CATEGORIES } from '@/lib/notifications/preferences'
import { parseUserAgent } from '@/lib/auth/login-events'
import { ChangePasswordForm } from './change-password-form'
import { NotificationPrefsForm } from './notification-prefs-form'
import { ReportSenderNameForm } from './report-sender-name-form'
import { SessionsPanel, type SignInEvent } from './sessions-panel'
import { IconInfo, IconUsers, IconBell, IconDevices, IconLock } from '../icons'
import { AnnotatedSection } from '../annotated-section'
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

// Managed-by-admin note repeated under each disabled field — matches the
// GitHub Primer treatment the client picked (a note per field, not one
// shared banner for the whole section).
function AdminManagedNote() {
  return (
    <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-paper-dim">
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
    // Full content width, with each section splitting into an explanation
    // column and a controls column (see AnnotatedSection). The page previously
    // capped at max-w-2xl, which left a third of a 1440px screen unclaimed
    // whichever way it was aligned.
    <div className="flex w-full flex-col gap-1">
      <PageHeader title="Account Settings" subtitle="Your profile, alerts, sessions and password" />

      <AnnotatedSection
        icon={<IconUsers />}
        title="Profile"
        description="How you're identified across the app — on the audit log, and as the author of anything you verify."
      >
        <div className="grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <span className="field-label">Name</span>
            <div className="field-disabled">{user.name ?? '—'}</div>
            {user.role !== 'master' && <AdminManagedNote />}
          </div>
          <div>
            <span className="field-label">Email</span>
            <div className="field-disabled">{user.email ?? '—'}</div>
            {user.role !== 'master' && <AdminManagedNote />}
          </div>
          <div>
            <span className="field-label">Role</span>
            <div className="field-disabled">{ROLE_LABEL[user.role]}</div>
            {user.role !== 'master' && <AdminManagedNote />}
          </div>
        </div>
        {user.role === 'master' && (
          <div className="mt-6 max-w-xl">
            <ReportSenderNameForm initialValue={profileRow?.report_sender_name ?? ''} />
          </div>
        )}
      </AnnotatedSection>

      <AnnotatedSection
        icon={<IconBell />}
        title="Notifications"
        description="Pick which alerts reach you. Switching a category off silences it everywhere — the bell, the toast and the daily email."
      >
        <NotificationPrefsForm masterEnabled={prefs.masterEnabled} categories={prefs.categories} visibleCategories={visibleCategories} />
      </AnnotatedSection>

      <AnnotatedSection
        icon={<IconDevices />}
        title="Sessions"
        description="Every device currently signed in as you. If you don't recognise one, sign the others out and change your password."
      >
        <SessionsPanel currentDevice={currentDevice} since={since} history={pastHistory} />
      </AnnotatedSection>

      <AnnotatedSection
        icon={<IconLock />}
        title="Security"
        description="Change your password. At least 8 characters; you'll stay signed in on this device."
      >
        <div className="max-w-xl">
          <ChangePasswordForm />
        </div>
      </AnnotatedSection>
    </div>
  )
}
