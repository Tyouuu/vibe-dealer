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

// The password lives in .env.local, not here. It used to be a literal in this
// file, which is tracked — so it was in the repo's history, in every qa driver,
// and in any chat log that quoted them. It has since been rotated; this reads
// the new one rather than reintroducing the same problem.
//
// Both accounts are switched off (profiles.active = false) and, since 0038,
// that revokes their data access at the RLS layer too — so an audit run needs
// them switched back on first:
//
//   node scripts/qa-accounts.mjs on   ->  audit  ->  node scripts/qa-accounts.mjs off
const ACCOUNTS = {
  accountant: { email: 'accountant@dealerhub.test', password: env.QA_PASSWORD },
  cs: { email: 'cs@dealerhub.test', password: env.QA_PASSWORD },
}
const acct = ACCOUNTS[role]
if (!acct) throw new Error(`unknown role ${role}`)
if (!acct.password) throw new Error('QA_PASSWORD is not set in .env.local — the audit cannot sign in')

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

      // A main column beside a fixed-width sidebar is not two panels that
      // failed to line up — it is the one layout where they are *supposed* to
      // differ, and stretching them would leave hundreds of pixels of dead
      // space in whichever is shorter. This rule flagged /dealers/[id]
      // (`grid-cols-[minmax(0,1fr)_296px] items-start`) at 151px for the
      // accountant and 383px for cs, and the larger cs number was the proof
      // rather than the alarm: cs sees less in the main column, so it shrank
      // while the 296px sidebar stayed put.
      //
      // Two signals together, because either alone is too broad. `items-start`
      // is the author saying in the markup that these are not meant to match,
      // and unequal widths are what separates a sidebar from a peer. Equal-
      // width panels still get judged even if someone sets items-start, which
      // is the case this rule was written for.
      const alignStart = /^(start|flex-start)$/.test(getComputedStyle(g).alignItems)
      const ws = kids.map((k) => k.getBoundingClientRect().width)
      const lopsided = Math.min(...ws) < Math.max(...ws) * 0.8
      if (alignStart && lopsided) continue

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
    // No <main> means the app never rendered — a 404, a redirect to /login, or
    // a server error. Reporting that is useful; a TypeError on a null
    // getBoundingClientRect four frames deep is not. This bit once: Git Bash
    // rewrites a leading-slash argument into a Windows path, so `/reconcile`
    // arrived as `/C:/Program Files/Git/reconcile` and 404'd.
    if (!main) return { notRendered: true, url: location.pathname }

    // A page the signed-in role may not see still renders a <main>, so every
    // rule below finds one tidy sentence and scores it clean. Measured: /audit
    // and /delivery as accountant both reported "✓ clean" while showing "Your
    // role (Accountant) does not have permission to view the audit log."
    //
    // That is worse than a failure. It means auditing with the wrong role
    // quietly produces a page of green that measured nothing, and the pages
    // you thought were covered never were.
    const mainText = (main.innerText || '').trim()
    if (/does not have permission/i.test(mainText) && mainText.length < 400) {
      return { permissionDenied: mainText.split('\n')[0].slice(0, 120), url: location.pathname }
    }

    const mb = main.getBoundingClientRect()
    const painted = [...main.querySelectorAll('*')]
      .filter((el) => {
        const bg = getComputedStyle(el).backgroundColor
        if (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') return false
        const b = el.getBoundingClientRect()
        // width > 180 is what actually separates a surface from a chip; the
        // height floor is only there so a full-width but hairline-thin strip
        // doesn't count. It was > 60, which excluded the dashboards' "All
        // clear" card at exactly 60px — a full-width white card the page
        // visibly opens on, reported as "no painted surface anywhere". Relaxed
        // by 4px so a genuine card counts, deliberately and with the reason
        // written down, because quietly loosening the thing that measures you
        // is how an audit stops being worth running.
        return b.width > 180 && b.height >= 56
      })
      .filter((el, i, arr) => !arr.some((o) => o !== el && o.contains(el)))
    out.firstSurfaceY = painted.length
      ? Math.round(Math.min(...painted.map((el) => el.getBoundingClientRect().top - mb.top + main.scrollTop)))
      : null

    // 6. Text that is being cut off rather than wrapped.
    //    The page-level overflow check below is blind to this: a `truncate`
    //    span clips its own content, so the document never scrolls and the
    //    audit passed while a phone showed "Enter the Vibe statement and …",
    //    which is the half that says what to do. Only flagged when a
    //    meaningful amount is missing, since truncation is often correct
    //    (a dealer name in a table cell).
    out.clipped = [...main.querySelectorAll('*')]
      .filter((el) => {
        if (!el.textContent?.trim() || el.children.length) return false
        const s = getComputedStyle(el)
        if (s.overflow === 'visible' && s.overflowX === 'visible') return false
        // Abbreviated is not the same as lost. A cell whose title carries the
        // full string can still be read — hover on a desktop, long-press on a
        // phone — so it is a table doing what tables do. What this rule is
        // for is text that is cut with no way to recover it, which is how an
        // instruction ends up half-delivered on the device it matters on.
        const title = el.getAttribute('title') || el.closest('[title]')?.getAttribute('title') || ''
        if (title.includes(el.textContent.trim().replace(/…$/, ''))) return false
        const hidden = el.scrollWidth - el.clientWidth
        return el.clientWidth > 60 && hidden / el.scrollWidth > 0.25
      })
      .map((el) => `${Math.round(((el.scrollWidth - el.clientWidth) / el.scrollWidth) * 100)}% of "${el.textContent.trim().slice(0, 45)}"`)
      .slice(0, 4)

    // 7. A chart drawn from nothing.
    //    Six months of zero rendered a dead-straight rule the full width of
    //    the card, with a dot on the end — four of them down a phone screen,
    //    each reading as a stray horizontal line. A trend line implies there
    //    is a trend; before any real data exists there is none to draw.
    out.deadCharts = [...main.querySelectorAll('svg')]
      .filter((svg) => {
        if (svg.getBoundingClientRect().width < 80) return false
        const geom = [...svg.querySelectorAll('path,polyline')]
          .map((n) => n.getAttribute('d') || n.getAttribute('points') || '')
          .join(' ')
        const ys = [...geom.matchAll(/[-\d.]+[ ,]([-\d.]+)/g)].map((m) => Number(m[1])).filter((n) => !Number.isNaN(n))
        return ys.length > 2 && new Set(ys.map((y) => y.toFixed(1))).size === 1
      }).length

    out.overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth
    out.height = document.querySelector('main')?.scrollHeight ?? 0
    return out
  })

  if (r.notRendered) {
    console.log(`
${p}  (${width}px, ${role})`)
    console.log(`  ✗ the app never rendered here — landed on ${r.url}. Wrong path, a redirect to /login, or a server error.`)
    problems++
    continue
  }

  if (r.permissionDenied) {
    console.log(`
${p}  (${width}px, ${role})`)
    console.log(`  ✗ nothing was measured — ${role} cannot see this page: "${r.permissionDenied}"`)
    console.log(`    Audit it as a role that can, or drop it from the list. A clean result here would have meant nothing.`)
    problems++
    continue
  }

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
  if (r.clipped?.length) flags.push(`text cut off: ${r.clipped.join('; ')}`)
  if (r.deadCharts) flags.push(`${r.deadCharts} chart${r.deadCharts === 1 ? '' : 's'} drawn from all-zero data — a flat line implying a trend`)
  if (r.fontSizes.length > 7) flags.push(`${r.fontSizes.length} font sizes: ${r.fontSizes.join(', ')}`)
  // 200 rather than 124: a page may carry an alert strip or a taller header
  // before its summary. Anything past 200 means the page opens on bare canvas.
  // One page, named, with its reason — not a general opt-out. /audit is a
  // record rather than a queue: it has no "what needs you" to state and a
  // large event count is a number nobody acts on, which its own source says
  // in as many words. It is structured by the view switcher, the filter bar
  // and the day headings instead. Printed rather than skipped silently, so
  // the exemption stays visible every run and has to keep earning itself.
  if (p.split('?')[0] === '/audit') {
    console.log(`\n${p}  (${width}px, ${role})  h=${r.height}`)
    if (flags.length) flags.forEach((f) => console.log(`  ✗ ${f}`))
    console.log('  — exempt from the anchor rule: a record, not a queue (see audit/page.tsx)')
    if (!flags.length) console.log('  ✓ clean')
    problems += flags.length
    continue
  }

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
