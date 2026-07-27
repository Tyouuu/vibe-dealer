'use client'

import { useRef, useState } from 'react'
import { Modal } from './modal'

// Same external shape as before (children/className/confirmMessage, drops
// into an existing <form> unchanged) — only what happens on click changed,
// from the browser's own native confirm() (unstyled, reads as coming from
// the browser/OS rather than the app) to an in-app modal matching the rest
// of the design system.
export function ConfirmSubmitButton({
  children,
  className,
  confirmMessage,
}: {
  children: React.ReactNode
  className: string
  confirmMessage: string
}) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  function confirmAndSubmit() {
    setOpen(false)
    buttonRef.current?.form?.requestSubmit()
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={className}
        onClick={() => setOpen(true)}
      >
        {children}
      </button>
      <Modal open={open} onClose={() => setOpen(false)}>
        <p className="text-sm font-semibold text-paper">{confirmMessage}</p>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
            Cancel
          </button>
          <button type="button" onClick={confirmAndSubmit} className={className}>
            Confirm
          </button>
        </div>
      </Modal>
    </>
  )
}
