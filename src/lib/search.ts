// Strips characters with special meaning in PostgREST's .ilike()/.or() filter
// grammar (',' separates conditions, '()' groups them, '%' and '*' are both
// wildcards — '*' is PostgREST's documented alias for '%' in like/ilike
// specifically) so a search term can't break out of the intended filter
// structure, or act as an unintended wildcard. Used by every free-text
// search against dealers/transactions — previously copied inline in 4
// places, the same "security-relevant snippet drifts apart" shape csvCell
// had before it was consolidated into src/lib/csv.ts.
export function sanitizeSearchTerm(q: string): string {
  return q.replace(/[,()%*]/g, '').trim()
}

// Every column the Dealers search box matches. It used to be name, region and
// contact only — but the row shows the registration number, and Contact and
// Phone are hidden columns, so a search for "WEI" returned 14 dealers none of
// whose visible text contained it. Search what people copy off a document
// (registration number, phone) as well as what they remember (name, contact).
const DEALER_SEARCH_COLUMNS = ['company_name', 'company_no', 'contact_person', 'phone', 'whatsapp', 'region'] as const

export function dealerSearchFilter(safeQ: string): string {
  return DEALER_SEARCH_COLUMNS.map((c) => `${c}.ilike.%${safeQ}%`).join(',')
}

// Why a row is in the results, when the reason is not on screen. Null when the
// company name matched (the name is what you are looking at) and when nothing
// hidden matched. The registration number and region are already shown on the
// row, so they need no explanation.
export type MatchNote = { label: string; before: string; hit: string; after: string }

// The text around the first case-insensitive occurrence of the search term, so a
// result can show the reader what it matched on.
export function splitMatch(value: string | null, safeQ: string): { before: string; hit: string; after: string } | null {
  const needle = safeQ.trim().toLowerCase()
  const at = value && needle ? value.toLowerCase().indexOf(needle) : -1
  if (!value || at < 0) return null
  return { before: value.slice(0, at), hit: value.slice(at, at + needle.length), after: value.slice(at + needle.length) }
}

export function dealerMatchNote(
  d: { company_name: string; contact_person: string | null; phone: string | null; whatsapp: string | null },
  safeQ: string,
): MatchNote | null {
  const needle = safeQ.trim().toLowerCase()
  if (!needle || d.company_name.toLowerCase().includes(needle)) return null
  for (const [label, value] of [
    ['Contact', d.contact_person],
    ['Phone', d.phone],
    ['WhatsApp', d.whatsapp],
  ] as const) {
    const m = splitMatch(value, needle)
    if (m) return { label, ...m }
  }
  return null
}
