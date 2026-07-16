import type { Metadata } from 'next'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { requireUser } from '@/lib/auth/dal'

export const metadata: Metadata = {
  title: 'Help — DealerHub',
}

// Renders the project handoff spec for logged-in staff. Deliberately not a
// static file under public/ — it documents internal Supabase/business details
// that shouldn't be reachable without a session. Headers get real heading
// styling; everything else (tables, code blocks) is shown as literal
// pre-formatted text rather than pulling in a markdown-parser dependency for
// a single reference page.
export default async function HelpPage() {
  await requireUser()

  const raw = await readFile(path.join(process.cwd(), 'PROJECT_SPEC.md'), 'utf-8')
  const lines = raw.split('\n')

  return (
    <div className="app-card">
      <h1 className="mb-4 text-[26px] font-extrabold tracking-tight text-paper">Getting Started Guide</h1>
      <div className="flex flex-col gap-1 text-sm text-paper-dim">
        {lines.map((line, i) => {
          const h1 = line.match(/^#\s+(.*)/)
          const h2 = line.match(/^##\s+(.*)/)
          const h3 = line.match(/^###\s+(.*)/)
          if (h1) return <h2 key={i} className="mt-5 text-lg font-extrabold text-paper first:mt-0">{h1[1]}</h2>
          if (h2) return <h3 key={i} className="mt-4 text-base font-bold text-paper">{h2[1]}</h3>
          if (h3) return <h4 key={i} className="mt-3 text-sm font-bold text-paper">{h3[1]}</h4>
          if (line.trim() === '---') return <hr key={i} className="my-3 border-ink-800" />
          if (line.trim() === '') return null
          return (
            <pre key={i} className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-paper-dim">
              {line}
            </pre>
          )
        })}
      </div>
    </div>
  )
}
