'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { PACKAGES, type PackageCode } from '@/lib/packages'

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

  const { data: dealer, error } = await supabase
    .from('dealers')
    .insert({
      company_name: companyName,
      company_no: String(formData.get('company_no') ?? '').trim() || null,
      contact_person: String(formData.get('contact_person') ?? '').trim() || null,
      phone: String(formData.get('phone') ?? '').trim() || null,
      email: String(formData.get('email') ?? '').trim() || null,
      address: String(formData.get('address') ?? '').trim() || null,
      region: String(formData.get('region') ?? '').trim() || null,
      package: pkg,
      rate: pkg ? PACKAGES[pkg].rate : null,
      onboarded_by: user.id,
    })
    .select('id')
    .single()

  if (error || !dealer) {
    redirect('/onboard?error=' + encodeURIComponent(error?.message ?? 'Failed to create dealer.'))
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
    await supabase.rpc('seed_dealer_rate_history', { p_dealer_id: dealer.id, p_package: pkg, p_rate: PACKAGES[pkg].rate })
  }

  revalidatePath('/dealers')
  redirect('/dealers?onboarded=1')
}
