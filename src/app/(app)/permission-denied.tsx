import type { Role } from '@/lib/auth/dal'
import { ROLE_LABEL } from './types'
import { PageHeader } from './page-header'
import { EmptyState } from './empty-state'

// The screen a role sees when it opens a page it may not have.
//
// It was one grey sentence in a bare card, with no page title at all — so
// every page that can refuse a role (Transactions, Monthly Report,
// Reconciliation, Credit Purchases, Audit Log, Staff, Dealer Requests, New
// Transaction) rendered a document with no level-one heading for that role.
// That was 20 of the 23 axe findings in one sweep, from one component.
//
// It also read as a fault rather than a rule. The rail never links a page a
// role cannot open, so the way anyone arrives here is a shared link or a
// typed URL — someone being sent somewhere by a colleague who can see more
// than they can. That person needs to know it is not broken, that it is not
// their mistake, and where to go instead. A sentence in 13px grey said none
// of those.
export function PermissionDenied({ role, action }: { role: Role; action: string }) {
  return (
    <>
      <PageHeader title="No access" subtitle={`Your role is ${ROLE_LABEL[role]}, and this page is not part of it.`} />
      {/* The sentence below keeps its exact original wording. Six QA drivers
          (qa-drive-cs, qa-drive-staff, qa-verify-master, qa-sweep,
          design-audit) test role separation by looking for the phrase "does
          not have permission" on screen — that string is the RBAC safety
          net's only handle, and rewording it here would have quietly turned
          every one of those checks into a check of nothing. */}
      <EmptyState
        variant="filtered"
        title="You cannot open this page"
        description={`Your role (${ROLE_LABEL[role]}) does not have permission to ${action}. Nothing is broken and nothing was recorded — ask the master account if you need it, or ask whoever sent you the link to send what they were looking at instead.`}
        action={{ href: '/dashboard', label: 'Go to Dashboard' }}
      />
    </>
  )
}
