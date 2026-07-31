'use client'

import { useId } from 'react'

// A labelled form field, with the label actually associated with its control.
//
// Every form in this app was written as `<label className="field-label">X</label>`
// followed by a sibling input, with no htmlFor and no wrapping — so the two
// were never connected. A screen reader reaching the field could not say what
// it was for, and clicking the label didn't focus it. Geist's form guidance is
// blunt about both: "Every control has a <label> or is associated with a
// label" and "Clicking a <label> focuses the associated control."
//
// axe only reported a fraction of these (six across thirteen pages) because it
// accepts a placeholder as a fallback accessible name, and most of our inputs
// happen to have one. That made a systemic problem look like a handful of
// one-offs. This component removes the whole class of bug rather than the
// instances: there is no way to use it and end up with an unassociated label,
// because the id is generated here and handed to the caller.
//
// Render-prop rather than cloning children: cloning breaks silently the moment
// a caller wraps its input in anything, and several fields here render custom
// controls (DatePicker, Combobox) rather than a bare <input>.
export function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string
  /** Sits under the control. Explains the field; never repeats the label. */
  hint?: React.ReactNode
  /** Shown in place of the hint when present — errors belong beside the field
      they describe, per Geist, not collected at the top of the form. */
  error?: string
  required?: boolean
  children: (id: string) => React.ReactNode
}) {
  const id = useId()

  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-clay-bright">
            *
          </span>
        )}
      </label>
      {children(id)}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1 text-[11.5px] font-medium text-clay-bright">
          {error}
        </p>
      ) : hint ? (
        <span id={`${id}-hint`} className="hint">
          {hint}
        </span>
      ) : null}
    </div>
  )
}
