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

  const supabase = await createClient()
  await supabase.from('dealers').update({ status }).eq('id', id)

  revalidatePath('/dealers')
  revalidatePath(`/dealers/${id}`)
}

export async function bulkSetDealerStatus(ids: string[], status: 'active' | 'inactive') {
  const user = await requireUser()
  assertCanManage(user.role)
  if (!ids.length) return

  const supabase = await createClient()
  await supabase.from('dealers').update({ status }).in('id', ids)

  revalidatePath('/dealers')
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
  const { data: existing } = await supabase.from('dealers').select('company_name')
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
    const { data: inserted, error } = await supabase.from('dealers').insert(toInsert).select('id, package, rate')
    if (error) {
      redirect('/dealers?import_error=' + encodeURIComponent(error.message))
    }
    created = inserted?.length ?? 0

    // Same reasoning as onboard's createDealer: a CSV row with an initial
    // package has no prior transaction to derive it from, so seed the audit
    // trail directly instead of leaving the package/rate looking assigned
    // from nowhere.
    const rateHistoryRows = (inserted ?? [])
      .filter((d) => d.package)
      .map((d) => ({
        dealer_id: d.id,
        old_package: null,
        old_rate: null,
        new_package: d.package,
        new_rate: d.rate,
        changed_by: user.id,
      }))
    if (rateHistoryRows.length) {
      await supabase.from('dealer_rate_history').insert(rateHistoryRows)
    }
  }

  revalidatePath('/dealers')
  redirect(`/dealers?imported=${created}&skipped_dup=${duplicates}&skipped_invalid=${invalid}`)
}
