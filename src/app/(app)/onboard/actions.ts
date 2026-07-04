'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'
import { PACKAGES, type PackageCode } from '@/lib/packages'

export async function createDealer(formData: FormData) {
  const user = await requireUser()
  if (user.role !== 'cs' && user.role !== 'master') {
    redirect('/onboard?error=' + encodeURIComponent('没有权限开户。'))
  }

  const companyName = String(formData.get('company_name') ?? '').trim()
  if (!companyName) {
    redirect('/onboard?error=' + encodeURIComponent('公司名字不能空。'))
  }

  const pkg = (formData.get('package') as PackageCode) || null
  const supabase = await createClient()

  const { error } = await supabase.from('dealers').insert({
    company_name: companyName,
    company_no: String(formData.get('company_no') ?? '').trim() || null,
    contact_person: String(formData.get('contact_person') ?? '').trim() || null,
    phone: String(formData.get('phone') ?? '').trim() || null,
    email: String(formData.get('email') ?? '').trim() || null,
    address: String(formData.get('address') ?? '').trim() || null,
    region: String(formData.get('region') ?? '').trim() || null,
    package: pkg,
    rate: pkg ? PACKAGES[pkg].rate : null,
  })

  if (error) {
    redirect('/onboard?error=' + encodeURIComponent(error.message))
  }

  revalidatePath('/dealers')
  redirect('/dealers?onboarded=1')
}
