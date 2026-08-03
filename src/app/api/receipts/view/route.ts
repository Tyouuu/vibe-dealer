import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'

// Receipts were write-only. entry-form uploaded the file, createTransaction
// saved the path on the transaction, and `receipt_url` was then read by
// nothing at all — not the records table, not the dealer page, not an export.
// The whole reason to attach a receipt is to pull it up when a dealer disputes
// a transaction, and that was the one thing the app could not do.
//
// Same shape as /api/sim-stock/invoice: `receipts` is a private bucket (0002),
// so the stored path is not a viewable URL. This mints a short-lived signed
// one and redirects to it rather than making the bucket public.
//
// Deliberately no ownership check on the path beyond the role gate. The
// bucket's own RLS policy (0002) already restricts SELECT to accountant and
// master, and every one of those can see every transaction anyway — a second
// check here would only be able to repeat what storage already enforces.
export async function GET(request: NextRequest) {
  const user = await requireUser()
  if (user.role !== 'accountant' && user.role !== 'master') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const path = request.nextUrl.searchParams.get('path')
  if (!path) {
    return NextResponse.json({ error: 'Missing path' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase.storage.from('receipts').createSignedUrl(path, 60)

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: 'That receipt could not be opened.' }, { status: 404 })
  }

  return NextResponse.redirect(data.signedUrl)
}
