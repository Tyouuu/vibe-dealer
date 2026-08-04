'use client'

// The filter bar's form, minus the empty fields.
//
// A plain GET form submits every named control it owns, so setting one filter
// produced
//   /records?q=&status=all&type=all&month=&sort=desc&min=1200&max=&from=&to=&by=
// The page reads that correctly — blank and "all" both mean "not filtering by
// this" — so nothing was broken. But the URL is the shareable artefact on this
// page (it is the whole reason the filters live in the query string rather
// than in component state), and that one cannot be read at a glance, cannot be
// edited by hand, and does not look like the clean links the chips and the
// sort controls emit for the very same view. Two spellings of one state.
//
// Progressive enhancement rather than a rewrite: the controls carrying nothing
// are disabled for the instant the browser serialises the form, and a disabled
// control is not submitted. They are re-enabled immediately afterwards so a
// Back navigation onto a restored page never finds half its inputs dead. With
// JavaScript off the form still submits and still filters — just with the
// noisier URL it had before.
export function FilterForm({ children, className }: { children: React.ReactNode; className?: string }) {
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const form = e.currentTarget
    const silenced: (HTMLInputElement | HTMLSelectElement)[] = []

    for (const el of Array.from(form.elements)) {
      if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement)) continue
      if (!el.name || el.disabled) continue
      // "all" and "desc" are this page's names for the unfiltered, unsorted
      // default — the same values hrefWith() leaves out of every link it
      // builds, so leaving them out here is what makes the two agree.
      const isDefault =
        el.value.trim() === '' ||
        ((el.name === 'status' || el.name === 'type') && el.value === 'all') ||
        (el.name === 'sort' && el.value === 'desc')
      if (isDefault) {
        el.disabled = true
        silenced.push(el)
      }
    }

    // Not preventDefault: the browser's own submit still runs, and serialises
    // the form after this handler returns. The timeout lands after that.
    setTimeout(() => {
      for (const el of silenced) el.disabled = false
    }, 0)
  }

  return (
    <form onSubmit={handleSubmit} className={className} action="/records" method="GET">
      {children}
    </form>
  )
}
