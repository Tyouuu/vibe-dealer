import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/dal'
import { PermissionDenied } from '../permission-denied'
import { createServiceClient } from '@/lib/supabase/service'
import { PageHeader } from '../page-header'
import { HeroCard } from '../hero-card'
import { Avatar } from '../avatar'
import { StatusDot } from '../status-dot'
import { formatDateLabel } from '@/lib/month'
import { NewStaffForm } from './new-staff-form'
import { StaffRow } from './staff-row'

export const metadata: Metadata = {
  title: 'Staff — Vibe456',
}

type StaffProfile = {
  id: string
  name: string | null
  email: string | null
  role: 'master' | 'accountant' | 'cs'
  active: boolean
  created_at: string | null
}

const ROLE_LABEL: Record<string, string> = { master: 'Master', accountant: 'Accountant', cs: 'CS' }

type PageProps = {
  searchParams: Promise<{
    error?: string
    created?: string
    role_changed?: string
    enabled?: string
    disabled?: string
    password_set?: string
  }>
}

// Who can sign in, and with what.
//
// This page exists because the app told everyone "accounts are set up by your
// admin, no self-signup" and then had nowhere for the admin to do it. The only
// way to add the real accountant and the real CS was two separate manual steps
// in the Supabase dashboard — create the auth user, then hand-write the
// matching profiles row — where getting the second one wrong produces an
// account that signs in successfully and is bounced straight back to the login
// screen with nothing on screen to explain why.
export default async function StaffPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { error, created, role_changed: roleChanged, enabled, disabled, password_set: passwordSet } = await searchParams

  if (user.actualRole !== 'master') {
    return <PermissionDenied role={user.role} action="manage staff accounts" />
  }

  // Service role: profiles' own SELECT policy is own-row-or-master, and while
  // master would pass it, this page also needs `active` and `created_at` for
  // people other than the viewer. staff_directory deliberately exposes only
  // id and display name, so it is not the right source here.
  const admin = createServiceClient()
  const { data } = await admin.from('profiles').select('id, name, email, role, active, created_at').order('role').order('name')
  const staff = (data ?? []) as StaffProfile[]

  const activeCount = staff.filter((s) => s.active).length
  const disabledCount = staff.length - activeCount
  const accountantCount = staff.filter((s) => s.active && s.role === 'accountant').length
  const csCount = staff.filter((s) => s.active && s.role === 'cs').length

  return (
    <>
      <PageHeader
        title="Staff"
        subtitle="Who can sign in to Vibe456, and what each of them can see. Accounts are created here — there is no self-signup."
      />

      {error && <div className="alert alert-bad">{error}</div>}
      {created && (
        <div className="alert alert-ok">
          {created}&rsquo;s account is ready. Give them the temporary password you just set, and have them change it under
          Account once they are in.
        </div>
      )}
      {roleChanged && <div className="alert alert-ok">{roleChanged}&rsquo;s role has been changed.</div>}
      {enabled && <div className="alert alert-ok">{enabled} can sign in again.</div>}
      {disabled && <div className="alert alert-ok">{disabled} can no longer sign in. Everything they recorded stays exactly as it is.</div>}
      {passwordSet && <div className="alert alert-ok">A new temporary password is set for {passwordSet}. Give it to them directly.</div>}

      {/* Every page in the app opens on one painted surface that anchors it;
          this one had two unpainted bands and nothing else, which the audit
          reads — correctly — as a page with no anchor. The headline figure is
          not "how many staff exist" but how many people can sign in right now,
          which is the question this screen is for. */}
      <HeroCard
        label={activeCount === 1 ? 'Person who can sign in' : 'People who can sign in'}
        value={String(activeCount)}
        chgSuffix="everyone else on this list has been switched off"
        href="/staff"
        stats={[
          { label: 'Accountants', value: String(accountantCount), href: '/staff', sub: 'record and verify money' },
          { label: 'CS', value: String(csCount), href: '/staff', sub: 'dealers and delivery only' },
          {
            label: 'Switched off',
            value: String(disabledCount),
            href: '/staff',
            tone: disabledCount ? 'caution' : 'normal',
            sub: 'kept, so their name still shows',
          },
        ]}
      />

      <div className="page-band">
        <h2 className="text-sm font-semibold text-paper">Everyone with an account</h2>
        <p className="mt-1 text-[12px] text-paper-dim">
          Nobody is ever deleted — the ledger points at these rows to say who recorded what.
        </p>

        <ul className="mt-4 flex flex-col">
          {staff.map((s) => (
            <StaffRow
              key={s.id}
              id={s.id}
              name={s.name ?? s.email ?? '—'}
              email={s.email ?? '—'}
              role={s.role}
              roleLabel={ROLE_LABEL[s.role] ?? s.role}
              active={s.active}
              isSelf={s.id === user.id}
              isMaster={s.role === 'master'}
              since={s.created_at ? formatDateLabel(s.created_at.slice(0, 10)) : null}
              avatar={<Avatar name={s.name ?? s.email ?? '?'} size={28} />}
              statusDot={
                s.active ? (
                  <StatusDot color="jade-bright" label="Active" />
                ) : (
                  <StatusDot color="clay-bright" label="Switched off" />
                )
              }
            />
          ))}
        </ul>
      </div>

      <NewStaffForm />
    </>
  )
}
