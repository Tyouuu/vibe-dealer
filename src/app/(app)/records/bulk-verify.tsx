'use client'

import { useEffect, useState } from 'react'
import { verifyTransactions } from './actions'
import { ConfirmSubmitButton } from '../confirm-submit-button'

// The id the row checkboxes point at.
//
// The obvious build — wrap the table in one <form> — does not work here, and
// the browser says so out loud: "<form> cannot contain a nested <form>". Every
// pending row already carries its own form for the single-row Verify and Flag
// buttons, and HTML forbids nesting them, so the parser discards the inner
// ones and the checkboxes end up associated with nothing predictable.
//
// The form attribute is the way out. A control can belong to a form it does not
// sit inside by naming that form's id, so the bar below owns a form of its own
// outside the table and each checkbox joins it by id.
const FORM_ID = 'bulk-verify'

// A count read off the DOM rather than mirrored into state: a checkbox already
// is the selection, and holding a second copy in React would give two sources
// of truth for one fact and a bug the first time they disagree.
function countChecked() {
  return document.querySelectorAll<HTMLInputElement>(`input[name="ids"][form="${FORM_ID}"]:checked`).length
}

export function BulkVerifyBar() {
  const [count, setCount] = useState(0)

  // The row checkboxes live in the table, outside this bar's form, so their
  // change events never reach it — a listener on the form element alone would
  // only ever see the select-all above. One document-level listener catches
  // both, and is registered in an effect rather than set during render.
  useEffect(() => {
    const onChange = () => setCount(countChecked())
    document.addEventListener('change', onChange)
    return () => document.removeEventListener('change', onChange)
  }, [])

  function toggleAll(checked: boolean) {
    document.querySelectorAll<HTMLInputElement>(`input[name="ids"][form="${FORM_ID}"]`).forEach((el) => {
      el.checked = checked
    })
    // Setting .checked in script fires no change event, so the document
    // listener above will not see this one — count it here.
    setCount(countChecked())
  }

  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
      <label className="flex items-center gap-2 text-[12px] font-semibold text-paper-dim">
        <input type="checkbox" className="h-4 w-4 accent-primary" onChange={(e) => toggleAll(e.currentTarget.checked)} />
        Select all pending on this page
      </label>

      <form id={FORM_ID} action={verifyTransactions} className="flex items-center gap-3">
        {count > 0 && (
          <>
            <span className="text-[12px] font-semibold text-paper">{count} selected</span>
            {/* Confirmed, like the single-row Verify. Verifying is what moves
                money into a month's totals, and a batch of it should not be one
                stray click. */}
            <ConfirmSubmitButton
              className="btn-jade py-1.5 text-xs"
              confirmMessage={`Verify ${count} transaction${count === 1 ? '' : 's'}? Any correction you posted yourself will be left for someone else to check.`}
            >
              Verify {count} selected
            </ConfirmSubmitButton>
          </>
        )}
      </form>
    </div>
  )
}

// One row's checkbox, belonging to the bar's form rather than to the row's own
// Verify/Flag form it happens to sit beside. Only pending rows get one —
// anything already verified or flagged has nothing this action could do to it,
// and an inert checkbox would be an offer the page cannot keep.
//
// relative z-10 is load-bearing: the dealer name in the next cell spans the
// whole row via after:inset-0 to make it clickable, and without this the
// overlay sits on top of the checkbox — a click opens the dealer page instead
// of ticking the box. Found by the driver reporting that the link "intercepts
// pointer events", not by looking at the screen, where it appears fine.
export function RowSelect({ id }: { id: string }) {
  return (
    // The box stays 16px; the thing you tap is 28px.
    //
    // A bare 16×16 checkbox is the one control in the app that failed WCAG
    // 2.2's 24px target size on a phone with no exception to fall back on —
    // it is not inline text and it has no spacing to spare in a table row.
    // The label around it carries negative margin equal to its padding, so
    // the hit area grows without moving the box or changing the row height.
    // Same pattern SIM Delivery already used for its row checkbox; this was
    // the one that never got it.
    <label className="relative z-10 -m-1.5 inline-flex cursor-pointer p-1.5">
      <input type="checkbox" name="ids" value={id} form={FORM_ID} className="h-4 w-4 accent-primary" aria-label="Select for bulk verify" />
    </label>
  )
}
