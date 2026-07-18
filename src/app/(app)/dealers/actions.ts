'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { PACKAGES, type PackageCode } from '@/lib/packages'

function assertCanManage(role: string) {
  if (role !== 'cs' && role !== 'master') {
    throw new Error('Not authorized to change dealer status.')
  }
}

export async function setDealerStatus(id: string, status: 'active' | 'inactive') {
  const user = await requireUser()
  assertCanManage(user.role)

  // dealers UPDATE is RLS-restricted to accountant/master (0004) — cs (who
  // this action also serves) goes through this narrow SECURITY DEFINER
  // function instead of a direct .update(), which would silently no-op for cs.
  const supabase = await createClient()
  await supabase.rpc('set_dealer_status', { p_dealer_id: id, p_status: status })

  revalidatePath('/dealers')
  revalidatePath(`/dealers/${id}`)
}

export async function bulkSetDealerStatus(ids: string[], status: 'active' | 'inactive') {
  const user = await requireUser()
  assertCanManage(user.role)
  if (!ids.length) return

  const supabase = await createClient()
  await Promise.all(ids.map((id) => supabase.rpc('set_dealer_status', { p_dealer_id: id, p_status: status })))

  revalidatePath('/dealers')
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
    redirect(`/dealers/${id}?error=` + encodeURIComponent(error.message))
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

  const rows = parseCsv(await file.text())
  if (rows.length < 2) {
    redirect('/dealers?import_error=' + encodeURIComponent('CSV has no data rows.'))
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
    email: string | null
    region: string | null
    address: string | null
    package: PackageCode | null
    rate: number | null
    status: 'active' | 'inactive'
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
      email: col(r, 'email') || null,
      region: col(r, 'region') || null,
      address: col(r, 'address') || null,
      package: pkg,
      rate: pkg ? PACKAGES[pkg].rate : null,
      status: col(r, 'status').toLowerCase() === 'inactive' ? 'inactive' : 'active',
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
      redirect('/dealers?import_error=' + encodeURIComponent(error.message))
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
