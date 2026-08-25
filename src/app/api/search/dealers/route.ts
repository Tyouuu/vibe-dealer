import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/dal'
import { createClient } from '@/lib/supabase/server'

// The roster, once, for the command palette to filter in the browser.
//
// 551 dealers is about 30KB of name/region/package — small enough to hand
// over in one request and then answer every keystroke with zero latency,
// which is the whole point of a palette. A round trip per character would
// make it slower than the /dealers search it exists to replace.
//
// Fetched when the palette is first opened rather than in the layout: most
// page loads never open it, and putting it in the layout would add a
// 551-row read to every single navigation.
//
// rate is deliberately not selected. package is (cs already sees it on
// /dealers), rate is a commission figure and cs may not — reading through
// dealers_directory keeps that boundary in the database rather than here.
export async function GET() {
  await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('dealers_directory')
    .select('id, company_name, region, package, status')
    .order('company_name', { ascending: true })

  if (error) {
    console.error('[search/dealers] failed:', error.message)
    return NextResponse.json({ dealers: [] }, { status: 502 })
  }
  return NextResponse.json({ dealers: data ?? [] })
}
