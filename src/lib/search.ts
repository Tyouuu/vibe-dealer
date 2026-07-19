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
