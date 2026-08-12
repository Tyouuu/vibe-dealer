import { PageHeader } from './page-header'
import { EmptyState } from './empty-state'

// The 404 a signed-in person gets, as opposed to the standalone one at
// src/app/not-found.tsx.
//
// Two reasons this file has to exist rather than letting the root one serve
// both. First, the framework: not-found.js "renders between loading.js and
// page.js" (next/dist/docs/.../not-found.md), so a notFound() thrown by
// /dealers/[id] renders the boundary INSIDE this group's layout — and that
// layout already owns the page's <main>, so the root screen's own <main>
// nested one inside the other (axe: landmark-no-duplicate-main,
// landmark-main-is-top-level).
//
// Second, and the reason it is worth a file rather than a workaround:
// someone who lands here is already signed in and in the middle of something.
// The standalone screen throws away the rail and offers a single "Back to
// Vibe456" — a dead end for a person who just wants the next dealer. Keeping
// the shell means the whole app is still one click away.
//
// A deleted dealer is the way this is actually reached: a link shared over
// WhatsApp, opened after the record is gone.
export default function AppNotFound() {
  return (
    <>
      <PageHeader title="Page not found" subtitle="That link is out of date, or the record it pointed at has been removed." />
      <EmptyState
        variant="filtered"
        title="Nothing here"
        description="If someone sent you this link, ask them to open the record and send it again — a dealer or transaction that has been removed keeps its old address but no longer has a page."
        action={{ href: '/dashboard', label: 'Go to Dashboard' }}
      />
    </>
  )
}
