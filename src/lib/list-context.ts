// "Back to the list" that remembers the list. A detail page and a bulk action
// both used to send you to bare /dealers, dropping the search, region, view and
// page you had come from. The address travels in the query string, so it is
// untrusted: only a path that IS the list (or the list plus a query) is honoured,
// anything else — another site, another page — falls back to the plain list.
export function safeListPath(raw: string | null | undefined, list = '/dealers'): string {
  if (!raw) return list
  return raw === list || raw.startsWith(`${list}?`) ? raw : list
}
