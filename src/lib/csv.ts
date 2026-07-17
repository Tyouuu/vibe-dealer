// Shared by every /api/**/export route. Prevents CSV/Excel formula
// injection: free-text fields (dealer names, notes, actor names, ...)
// ultimately get opened directly in Excel/Sheets, and a value starting with
// =/+/-/@/tab/CR is otherwise interpreted as a formula by the spreadsheet
// app, not shown as plain text.
export function csvCell(value: string | number | null): string {
  if (value == null) return ''
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(value)) {
    value = `'${value}`
  }
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
