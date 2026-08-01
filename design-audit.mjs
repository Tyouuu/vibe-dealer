// Step 4 of the redesign workflow, as a command.
//
// This exists because of a specific, repeated failure. The workflow has four
// steps; the ones with a command to run (tsc, eslint, vitest, next build,
// axe) were run before every single commit, and the two that required
// remembering to read something — impeccable's detector and the
// taste-redesign checklist — were run once and never again. That is not a
// coincidence. An unenforced step does not survive a long piece of work.
//
// So the checks that were being skipped now have a command, and the ones a
// machine cannot judge are printed as a list you have to answer, with the
// page's own measurements next to them.
//
//   node design-audit.mjs <role> <width> <path...>
//
// It does not pass or fail on taste. It measures the things the client has
// actually complained about — uneven row heights, one column eating the
// table's slack, side-by-side panels whose heights don't match, mixed status
// treatments, type-scale spread — and prints them so they cannot be missed.
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => {
    const i = l.indexOf('=')
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
  }),
)

const BASE = process.env.BASE_URL || 'http://localhost:3213'
const [, , role = 'accountant', widthArg = '1440', ...rest] = process.argv
const width = Number(widthArg)
const paths = rest.map((p) => (p.startsWith('/') ? p : `/${p}`))

const ACCOUNTS = {
  accountant: { email: 'accountant@dealerhub.test', password: 'QaTemp!2026' },
  cs: { email: 'cs@dealerhub.test', password: 'QaTemp!2026' },
}
const acct = ACCOUNTS[role]
if (!acct) throw new Error(`unknown role ${role}`)

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
await admin.from('rate_limit_hits').delete().eq('key', `login:${acct.email}`)

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 2 })).newPage()
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await page.fill('input[type="email"]', acct.email)
await page.fill('input[type="password"]', acct.password)
await page.click('button[type="submit"]')
await page.waitForURL(/\/(dashboard|records|dealers)/, { timeout: 20000 })

const axeSrc = fs.readFileSync(path.join('node_modules', 'axe-core', 'axe.min.js'), 'utf8')
let problems = 0

for (const p of paths) {
  await page.goto(`${BASE}${p}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  await page.addScriptTag({ content: axeSrc })

  const r = await page.evaluate(async () => {
    const out = {}

    // 1. Row rhythm. Two row heights in one table is the defect the client
    //    described as "not clean, not tidy".
    out.tables = [...document.querySelectorAll('table')].map((t) => {
      const rows = [...t.querySelectorAll('tbody tr')].filter((r) => r.querySelector('td:nth-child(2)'))
      const heights = [...new Set(rows.map((r) => Math.round(r.getBoundingClientRect().height)))]
      const cols = [...t.querySelectorAll('col')].map((c) => Math.round(c.getBoundingClientRect().width))
      // 2. Slack pooling: one column far wider than the rest eats the table's
      //    spare width, which reads as "cramped here, empty there".
      const widest = cols.length ? Math.max(...cols) : 0
      const median = cols.length ? [...cols].sort((a, b) => a - b)[Math.floor(cols.length / 2)] : 0
      return { rowHeights: heights, colWidths: cols, slackRatio: median ? +(widest / median).toFixed(1) : null }
    })

    // 3. Side-by-side panels whose heights don't match — taste-redesign's
    //    "inconsistent vertical rhythm in side-by-side elements".
    out.unevenRows = []
    for (const g of document.querySelectorAll('.grid')) {
      const kids = [...g.children].filter((k) => k.getBoundingClientRect().height > 40)
      if (kids.length < 2) continue
      const tops = new Set(kids.map((k) => Math.round(k.getBoundingClientRect().top)))
      if (tops.size !== 1) continue // not actually a row
      const hs = kids.map((k) => Math.round(k.getBoundingClientRect().height))
      const diff = Math.max(...hs) - Math.min(...hs)
      if (diff > 120) out.unevenRows.push({ heights: hs, diff })
    }

    // 4. One status treatment per page.
    out.statusShapes = [
      ...new Set(
        [...document.querySelectorAll('.pill-jade,.pill-brass,.pill-clay,.pill-slate,.status-dot-row')].map((e) =>
          e.classList.contains('pill') ? 'chip' : 'dot',
        ),
      ),
    ]

    // 5. Type scale spread, and the 12px floor.
    const sizes = new Set()
    let tiny = 0
    for (const el of document.querySelectorAll('*')) {
      if (!el.textContent?.trim() || el.children.length) continue
      const fs = parseFloat(getComputedStyle(el).fontSize)
      if (!fs) continue
      sizes.add(fs)
      if (fs < 12) tiny++
    }
    out.fontSizes = [...sizes].sort((a, b) => a - b)
    out.belowFloor = tiny

    // 6. Weights above the documented 600 ceiling.
    out.overweight = [...document.querySelectorAll('*')].filter(
      (el) => el.textContent?.trim() && !el.children.length && Number(getComputedStyle(el).fontWeight) > 600,
    ).length

    const axe = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })
    out.axe = axe.violations.map((v) => v.id)
    // 7. Where the page's first painted surface sits.
    //
    //    This is the check that came out of measuring six pages against the
    //    client's own verdict on them. The four he called finished all paint
    //    their first surface at y=104-124, directly under the title. The two
    //    he called unfinished opened at y=384 and y=768 — several hundred
    //    pixels of bare canvas with nothing on it but text, and no anchor for
    //    the eye to land on.
    //
    //    Total painted area predicts nothing: Dealers is 5% painted and reads
    //    as finished, SIM Card Stock was 35% and did not. What predicts it is
    //    whether the page opens with something to land on.
    const main = document.querySelector('main')
    const mb = main.getBoundingClientRect()
    const painted = [...main.querySelectorAll('*')]
      .filter((el) => {
        const bg = getComputedStyle(el).backgroundColor
        if (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') return false
        const b = el.getBoundingClientRect()
        return b.width > 180 && b.height > 60
      })
      .filter((el, i, arr) => !arr.some((o) => o !== el && o.contains(el)))
    out.firstSurfaceY = painted.length
      ? Math.round(Math.min(...painted.map((el) => el.getBoundingClientRect().top - mb.top + main.scrollTop)))
      : null

    out.overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth
    out.height = document.querySelector('main')?.scrollHeight ?? 0
    return out
  })

  const flags = []
  for (const t of r.tables) {
    if (t.rowHeights.length > 1) flags.push(`row heights ${t.rowHeights.join('/')} — should be one value`)
    if (t.slackRatio && t.slackRatio > 3) flags.push(`one column ${t.slackRatio}x the median — slack is pooling`)
  }
  for (const u of r.unevenRows) flags.push(`side-by-side panels differ by ${u.diff}px (${u.heights.join(' vs ')})`)
  if (r.statusShapes.length > 1) flags.push(`${r.statusShapes.length} status treatments: ${r.statusShapes.join(' + ')}`)
  if (r.belowFloor) flags.push(`${r.belowFloor} elements below the 12px floor`)
  if (r.overweight) flags.push(`${r.overweight} elements above the 600 weight ceiling`)
  if (r.axe.length) flags.push(`axe: ${r.axe.join(', ')}`)
  if (r.overflow) flags.push(`horizontal overflow ${r.overflow}px`)
  if (r.fontSizes.length > 7) flags.push(`${r.fontSizes.length} font sizes: ${r.fontSizes.join(', ')}`)
  // 200 rather than 124: a page may carry an alert strip or a taller header
  // before its summary. Anything past 200 means the page opens on bare canvas.
  if (r.firstSurfaceY == null) flags.push('no painted surface anywhere — the page has no anchor')
  else if (r.firstSurfaceY > 200) flags.push(`first surface at y=${r.firstSurfaceY} — the page opens on ${r.firstSurfaceY}px of bare canvas`)

  problems += flags.length
  console.log(`\n${p}  (${width}px, ${role})  h=${r.height}`)
  if (flags.length) flags.forEach((f) => console.log(`  ✗ ${f}`))
  else console.log('  ✓ clean')
}

await browser.close()
console.log(`\n${problems} problem${problems === 1 ? '' : 's'} across ${paths.length} page${paths.length === 1 ? '' : 's'}.`)
process.exit(problems ? 1 : 0)
