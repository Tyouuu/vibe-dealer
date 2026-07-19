'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { PACKAGES, type PackageCode } from '@/lib/packages'
import { normalizeRegion } from '@/lib/regions'
import { sanitizeSearchTerm } from '@/lib/search'

// dealers_directory (0015) is the cs-safe view — cs has no SELECT on the
// dealers base table, so this is the only way this lookup works for cs too,
// not just master/accountant. ilike with no wildcards is just a case-
// insensitive exact match, which is enough to catch "Ipoh Trading" vs.
// "ipoh trading" without pulling in unrelated partial matches.
// sanitizeSearchTerm strips %/_ (ilike wildcards) so a company name that
// happens to contain them (e.g. "100% Mobile Trading") is matched literally
// instead of as a pattern — previously this exact-match check was the one
// ilike call in the app that didn't go through it.
// excludeId lets the dealer-edit form reuse this same check without a save
// that doesn't change the name false-positiving against itself.
export async function checkDuplicateDealer(companyName: string, excludeId?: string): Promise<{ id: string; company_name: string } | null> {
  const user = await requireUser()
  if (user.role !== 'cs' && user.role !== 'master') return null

  const trimmed = sanitizeSearchTerm(companyName)
  if (!trimmed) return null

  const supabase = await createClient()
  let query = supabase.from('dealers_directory').select('id, company_name').ilike('company_name', trimmed)
  if (excludeId) query = query.neq('id', excludeId)
  const { data } = await query.maybeSingle()
  return data
}

export async function createDealer(formData: FormData) {
  const user = await requireUser()
  if (user.role !== 'cs' && user.role !== 'master') {
    redirect('/onboard?error=' + encodeURIComponent('You do not have permission to onboard dealers.'))
  }

  const companyName = String(formData.get('company_name') ?? '').trim()
  if (!companyName) {
    redirect('/onboard?error=' + encodeURIComponent('Company name is required.'))
  }

  const pkg = (formData.get('package') as PackageCode) || null
  if (pkg && !(pkg in PACKAGES)) {
    redirect('/onboard?error=' + encodeURIComponent('Invalid package selected.'))
  }

  const supabase = await createClient()

  // Defense in depth — OnboardForm already checks and asks the user to
  // confirm client-side, but that's only a UX nicety; this is the real
  // backstop against two staff independently onboarding the same dealer.
  const confirmedDuplicate = String(formData.get('confirm_duplicate') ?? '') === 'true'
  if (!confirmedDuplicate) {
    const safeCompanyName = sanitizeSearchTerm(companyName)
    const { data: existing } = await supabase
      .from('dealers_directory')
      .select('company_name')
      .ilike('company_name', safeCompanyName)
      .maybeSingle()
    if (existing) {
      redirect('/onboard?error=' + encodeURIComponent(`A dealer named "${existing.company_name}" already exists — resubmit to confirm this is a different dealer.`))
    }
  }

  // id generated here instead of left to the DB default, so nothing needs to
  // be read back via INSERT...RETURNING — cs has no SELECT on the dealers
  // base table (0015), which makes RETURNING come back empty for a cs
  // session even though the insert itself succeeds.
  const dealerId = crypto.randomUUID()
  const { error } = await supabase.from('dealers').insert({
    id: dealerId,
    company_name: companyName,
    company_no: String(formData.get('company_no') ?? '').trim() || null,
    contact_person: String(formData.get('contact_person') ?? '').trim() || null,
    phone: String(formData.get('phone') ?? '').trim() || null,
    email: String(formData.get('email') ?? '').trim() || null,
    address: String(formData.get('address') ?? '').trim() || null,
    region: normalizeRegion(formData.get('region') as string | null),
    notes: String(formData.get('notes') ?? '').trim() || null,
    package: pkg,
    rate: pkg ? PACKAGES[pkg].rate : null,
    onboarded_by: user.id,
  })

  if (error) {
    redirect('/onboard?error=' + encodeURIComponent(error.message))
  }

  // Onboarding can set an Initial Package directly on the new dealer row
  // (no prior transactions to derive it from, so recomputeDealerRate doesn't
  // apply here) — snapshot that first assignment so dealer_rate_history has
  // a starting point instead of the dealer's package/rate appearing from
  // nowhere. dealer_rate_history INSERT is RLS-restricted to accountant/
  // master, so cs (who onboards dealers) goes through this narrow SECURITY
  // DEFINER function instead of a direct .insert(), which would silently
  // drop the row for cs.
  if (pkg) {
    await supabase.rpc('seed_dealer_rate_history', { p_dealer_id: dealerId, p_package: pkg, p_rate: PACKAGES[pkg].rate })
  }

  revalidatePath('/dealers')
  redirect('/dealers?onboarded=1')
}
