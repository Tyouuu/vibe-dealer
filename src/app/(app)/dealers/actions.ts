'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { PACKAGES, type PackageCode } from '@/lib/packages'
import { normalizeRegion } from '@/lib/regions'
import { sanitizeSearchTerm } from '@/lib/search'
import { safeListPath } from '@/lib/list-context'
import { friendlyDbError } from '@/lib/db-error'

// The import reads the whole file into memory and parses it in one pass, so it
// needs the same two bounds every other upload path in this app already has
// (the OCR route caps bytes and MIME type; this had neither). 2MB is roughly
// 20,000 dealer rows of CSV — far past the 242 dealers this business has, and
// small enough that a mistaken upload can't exhaust the function's memory.
const IMPORT_MAX_BYTES = 2 * 1024 * 1024
const IMPORT_MAX_ROWS = 5000

/**
 * Give a package to dealers that have none, in one pass.
 *
 * 500 of 551 dealers cannot trade because they have no package, so no rate,
 * so the credit guard on /entry refuses every top-up they place. One at a
 * time was not a slow route to fixing that — it was no route at all, because
 * there is no package field on a dealer's page. See 0047 for why the two
 * existing audited paths could not be reused: one records a sale that never
 * happened, the other only works on a row being inserted.
 *
 * Every dealer goes through assign_dealer_package individually rather than
 * one bulk UPDATE. It costs a round trip each, and it buys three things a
 * bulk statement cannot: the rate is derived per dealer from the package, a
 * dealer who already has one is refused rather than overwritten, and each
 * gets its own dealer_rate_history row naming who did it. Five hundred round
 * trips on a job run once is a fair price for an audit trail that is right.
 */
export async function assignPackages(formData: FormData) {
  const user = await requireUser()
  assertCanManage(user.role)

  const pkg = String(formData.get('package') ?? '').toUpperCase()
  if (!(pkg in PACKAGES)) {
    redirect('/dealers?import_error=' + encodeURIComponent('That is not a package we sell.'))
  }
  const ids = String(formData.get('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (!ids.length) {
    redirect('/dealers?import_error=' + encodeURIComponent('Nobody was selected.'))
  }
  if (ids.length > 1000) {
    redirect('/dealers?import_error=' + encodeURIComponent('That is more than 1,000 dealers at once — narrow the filter and do it in parts.'))
  }

  const supabase = await createClient()
  let done = 0
  const refused: string[] = []
  for (const id of ids) {
    const { error } = await supabase.rpc('assign_dealer_package', { p_dealer_id: id, p_package: pkg })
    if (error) refused.push(error.message)
    else done++
  }

  revalidatePath('/dealers')
  revalidatePath('/dashboard')

  // The refusals are counted, not hidden. "Already has a package" is the
  // expected one — someone else set it between the page rendering and the
  // button being pressed — and it is not a failure worth stopping for.
  const back = safeListPath(String(formData.get('back') ?? ''))
  redirect(`${back}${back.includes('?') ? '&' : '?'}assigned=${done}${refused.length ? `&refused=${refused.length}` : ''}`)
}

function assertCanManage(role: string) {
  if (role !== 'cs' && role !== 'master') {
    throw new Error('Not authorized to manage dealers.')
  }
}

// cs/master only, matching who can onboard a dealer in the first place —
// editing contact/profile info is roster management, not a finance action,
// same split the page already draws for CSV import. Routes through
// update_dealer_profile (0021) unconditionally rather than branching cs
// through an RPC and master through a direct .update() — one code path,
// no drift between them.
export async function updateDealer(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const user = await requireUser()
  assertCanManage(user.role)
  if (!id) redirect('/dealers')

  const companyName = String(formData.get('company_name') ?? '').trim()
  if (!companyName) {
    redirect(`/dealers/${id}?error=` + encodeURIComponent('Company name is required.'))
  }

  const supabase = await createClient()

  // Defense in depth — the Edit form already checks and asks the user to
  // confirm client-side, but that's only a UX nicety; this is the real
  // backstop, same pattern createDealer already uses for onboarding.
  const confirmedDuplicate = String(formData.get('confirm_duplicate') ?? '') === 'true'
  if (!confirmedDuplicate) {
    const safeCompanyName = sanitizeSearchTerm(companyName)
    const { data: existing } = await supabase
      .from('dealers_directory')
      .select('company_name')
      .ilike('company_name', safeCompanyName)
      .neq('id', id)
      .maybeSingle()
    if (existing) {
      redirect(
        `/dealers/${id}?error=` +
          encodeURIComponent(`A dealer named "${existing.company_name}" already exists — save again to confirm this rename is intentional.`)
      )
    }
  }

  const { error } = await supabase.rpc('update_dealer_profile', {
    p_dealer_id: id,
    p_company_name: companyName,
    p_company_no: String(formData.get('company_no') ?? '').trim() || null,
    p_contact_person: String(formData.get('contact_person') ?? '').trim() || null,
    p_phone: String(formData.get('phone') ?? '').trim() || null,
    p_email: String(formData.get('email') ?? '').trim() || null,
    p_address: String(formData.get('address') ?? '').trim() || null,
    p_region: normalizeRegion(formData.get('region') as string | null),
    p_notes: String(formData.get('notes') ?? '').trim() || null,
    p_whatsapp: String(formData.get('whatsapp') ?? '').trim() || null,
  })

  if (error) {
    redirect(`/dealers/${id}?error=` + encodeURIComponent(friendlyDbError(error.message)))
  }

  revalidatePath('/dealers')
  revalidatePath(`/dealers/${id}`)
  redirect(`/dealers/${id}?updated=1`)
}

// Master-only, and only for a dealer with zero transactions ever recorded —
// a pure onboarding mistake, not a real dealer with history to lose. Every
// other table stays delete-free by design; this is the one narrow exception.
// The RLS policy (0011) enforces both conditions independently of this check.
export async function deleteDealer(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const user = await requireUser()
  if (!id) redirect('/dealers')
  if (user.role !== 'master') {
    redirect(`/dealers/${id}?error=` + encodeURIComponent('Only master can delete a dealer.'))
  }

  const supabase = await createClient()
  const { count } = await supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('dealer_id', id)
  if (count && count > 0) {
    redirect(`/dealers/${id}?error=` + encodeURIComponent('This dealer has transactions recorded and cannot be deleted.'))
  }

  const { error } = await supabase.from('dealers').delete().eq('id', id)
  if (error) {
    redirect(`/dealers/${id}?error=` + encodeURIComponent(friendlyDbError(error.message)))
  }

  revalidatePath('/dealers')
  redirect('/dealers?deleted=1')
}

// Minimal RFC4180-ish CSV parser (quoted fields, "" escaping, embedded commas
// /newlines) — matches the quoting style /api/dealers/export produces, so a
// round-trip export → edit in Excel → re-import works without a dependency.
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const s = text.replace(/^﻿/, '').replace(/\r\n/g, '\n')

  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += c
    }
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.length > 1 || r[0] !== '')
}

export async function importDealers(formData: FormData) {
  const user = await requireUser()
  if (user.role !== 'cs' && user.role !== 'master') {
    redirect('/dealers?import_error=' + encodeURIComponent('You do not have permission to import dealers.'))
  }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    redirect('/dealers?import_error=' + encodeURIComponent('Please choose a CSV file.'))
  }
  if (file.size > IMPORT_MAX_BYTES) {
    redirect('/dealers?import_error=' + encodeURIComponent('That file is too large (max 2MB). Split it and import in parts.'))
  }

  const rows = parseCsv(await file.text())
  if (rows.length < 2) {
    redirect('/dealers?import_error=' + encodeURIComponent('CSV has no data rows.'))
  }
  if (rows.length - 1 > IMPORT_MAX_ROWS) {
    redirect(
      '/dealers?import_error=' +
        encodeURIComponent(`That file has ${(rows.length - 1).toLocaleString()} rows (max ${IMPORT_MAX_ROWS.toLocaleString()}). Split it and import in parts.`)
    )
  }

  const header = rows[0].map((h) => h.trim().toLowerCase())
  const colIndex = (name: string) => header.indexOf(name)
  if (colIndex('company_name') === -1) {
    redirect('/dealers?import_error=' + encodeURIComponent('CSV must have a "company_name" column — export the dealer list first to see the expected format.'))
  }
  const col = (r: string[], name: string) => {
    const i = colIndex(name)
    return i === -1 ? '' : (r[i] ?? '').trim()
  }

  const supabase = await createClient()
  const { data: existing } = await supabase.from('dealers_directory').select('company_name')
  const existingNames = new Set((existing ?? []).map((d) => d.company_name.trim().toLowerCase()))
  const seenInBatch = new Set<string>()

  let duplicates = 0
  let invalid = 0
  const toInsert: {
    company_name: string
    company_no: string | null
    contact_person: string | null
    phone: string | null
    whatsapp: string | null
    email: string | null
    region: string | null
    address: string | null
    notes: string | null
    package: PackageCode | null
    rate: number | null
    onboarded_by: string
  }[] = []

  for (const r of rows.slice(1)) {
    const companyName = col(r, 'company_name')
    if (!companyName) {
      invalid++
      continue
    }
    const key = companyName.toLowerCase()
    if (existingNames.has(key) || seenInBatch.has(key)) {
      duplicates++
      continue
    }
    seenInBatch.add(key)

    // Never trust the CSV's own "rate" column — always derive it from the
    // package code so an edited/garbled sheet can't violate the
    // dealers_rate_matches_package check constraint (migration 0007).
    const pkgRaw = col(r, 'package').toUpperCase()
    const pkg = pkgRaw && pkgRaw in PACKAGES ? (pkgRaw as PackageCode) : null

    toInsert.push({
      company_name: companyName,
      company_no: col(r, 'company_no') || null,
      contact_person: col(r, 'contact_person') || null,
      phone: col(r, 'phone') || null,
      whatsapp: col(r, 'whatsapp') || null,
      email: col(r, 'email') || null,
      region: normalizeRegion(col(r, 'region')),
      address: col(r, 'address') || null,
      notes: col(r, 'notes') || null,
      package: pkg,
      rate: pkg ? PACKAGES[pkg].rate : null,
      onboarded_by: user.id,
    })
  }

  let created = 0
  if (toInsert.length) {
    // ids generated here instead of left to the DB default, and rate/package
    // read back off this same local array rather than an INSERT...RETURNING
    // — cs has no SELECT on the dealers base table (0015), which makes
    // RETURNING come back empty for a cs session even though the insert
    // itself succeeds (same failure shape RLS-restricted RETURNING always
    // has). Avoiding it here means the import path needs no special-casing.
    const rows = toInsert.map((d) => ({ ...d, id: crypto.randomUUID() }))
    const { error } = await supabase.from('dealers').insert(rows)
    if (error) {
      redirect('/dealers?import_error=' + encodeURIComponent(friendlyDbError(error.message)))
    }
    created = rows.length

    // Same reasoning as onboard's createDealer: a CSV row with an initial
    // package has no prior transaction to derive it from, so seed the audit
    // trail directly instead of leaving the package/rate looking assigned
    // from nowhere. dealer_rate_history INSERT is RLS-restricted to
    // accountant/master, so cs (who this action also serves) goes through
    // the same narrow SECURITY DEFINER function onboarding uses, instead of
    // a direct .insert() that would silently drop the row for cs.
    await Promise.all(
      rows
        .filter((d) => d.package)
        .map((d) => supabase.rpc('seed_dealer_rate_history', { p_dealer_id: d.id, p_package: d.package, p_rate: d.rate }))
    )
  }

  revalidatePath('/dealers')
  redirect(`/dealers?imported=${created}&skipped_dup=${duplicates}&skipped_invalid=${invalid}`)
}

// Pin or unpin a dealer for the signed-in person only.
//
// Everyone who uses /dealers works the same 284-row list and a different
// twenty of them. Sorting by volume answers "who is biggest", never "who do I
// deal with", so this lets each person answer the second question for
// themselves. No role gate beyond being signed in: a pin grants nothing and
// reveals nothing, it only reorders one person's own view. RLS (0039) is what
// actually confines the write to that person's rows — this action cannot pin
// on someone else's behalf even if the id were forged, because user_id is
// taken from the session and never from the form.
export async function toggleDealerPin(formData: FormData) {
  const user = await requireUser()

  const dealerId = String(formData.get('dealer_id') ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(dealerId)) throw new Error('Not a dealer id.')

  const supabase = await createClient()

  // Read first rather than upsert-or-delete blind: the button has to be a
  // toggle, and the client's idea of the current state can be stale if the
  // same person has the page open twice.
  const { data: existing } = await supabase
    .from('dealer_pins')
    .select('dealer_id')
    .eq('user_id', user.id)
    .eq('dealer_id', dealerId)
    .maybeSingle()

  const { error } = existing
    ? await supabase.from('dealer_pins').delete().eq('user_id', user.id).eq('dealer_id', dealerId)
    : await supabase.from('dealer_pins').insert({ user_id: user.id, dealer_id: dealerId })

  if (error) throw new Error(friendlyDbError(error.message))

  // No redirect. Pinning is a change of view, not a step in a task — sending
  // the reader back to page 1 with their filters dropped would cost more than
  // the pin saves. revalidatePath re-renders the list in the same response.
  revalidatePath('/dealers')
}
