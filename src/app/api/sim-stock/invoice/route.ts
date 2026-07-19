import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'

// sim-shipping-invoices (0024) is a private bucket — the stored path alone
// isn't a viewable URL, so this mints a short-lived signed URL and redirects
// to it rather than exposing the bucket publicly (same reasoning that made
// receipts private in the first place, 0002).
export async function GET(request: NextRequest) {
  const user = await requireUser()
  if (user.role !== 'cs' && user.role !== 'accountant' && user.role !== 'master') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const path = request.nextUrl.searchParams.get('path')
  if (!path) {
    return NextResponse.json({ error: 'Missing path' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase.storage.from('sim-shipping-invoices').createSignedUrl(path, 60)

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: error?.message ?? 'Could not create signed URL' }, { status: 404 })
  }

  return NextResponse.redirect(data.signedUrl)
}
