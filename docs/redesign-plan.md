# Full redesign plan — every page to Reconciliation's standard

The client's position, stated plainly: Reconciliation is the only page they are
satisfied with, they do not want small changes, and a full redesign of every
page is acceptable. Stripe, Linear and Vercel stay the reference for what
"premium" means here; researching how other real products solve a given screen
is encouraged, but the answer comes back to those three.

This document is the plan. Nothing here is built yet except the pages marked
DONE.

---

## Part 1 — What we actually take from each reference

Not a mood board. These are the specific, checkable rules the redesign is
measured against.

### Vercel — Geist and the Web Interface Guidelines

Vercel publishes the most concrete guidance of the three
(`vercel.com/design/guidelines`, `vercel.com/geist`). The rules that bind us:

**States**
- "All states designed" — empty, sparse, dense, and error. Not just the happy
  path with data in it.
- Empty states come in distinct kinds: blank slate (nothing created yet),
  no-results (a filter matched nothing), informational. "Empty states vanish
  when the list populates; persistent warnings belong in Note or the page
  header."
- Loading: "show a loading indicator & keep the original label", with a
  show-delay of ~150–300ms and a minimum visible time of ~300–500ms so
  spinners don't flicker.
- Skeletons "mirror final content exactly to avoid layout shift".

**Forms**
- "Every control has a `<label>` or is associated with a label" and "clicking a
  `<label>` focuses the associated control". **We currently fail this app-wide.**
- Keep submit enabled until submission starts; don't pre-disable it to force a
  complete form. Disable during the request, with a spinner.
- "Show errors beside fields; focus first error on submit."
- "Use the right `type` & `inputmode`"; set `autocomplete`; disable spellcheck
  on emails/codes; `<input>` font-size ≥ 16px on mobile so iOS doesn't zoom.
- Warn before navigating away from unsaved changes.
- Placeholders end with an ellipsis and give an example value.

**Tables**
- Sortable headers are buttons; the label stays Title Case and the arrow
  announces the *next* sort state.
- "Apply `tabular-nums` (or Geist Mono) to numeric columns so digits align
  across rows."
- Column headers are Title Case nouns: `Last Used`, `Requests (7d)`, `Status`.

**Copy**
- Active voice, second person, as few words as possible.
- "Don't just state what went wrong — tell the user how to fix it."
- Positive framing over blame.
- Numerals for counts ("8 deployments", not "eight").
- Currency with a consistent 0 or 2 decimals, never mixed.
- Real ellipsis `…`, curly quotes, non-breaking space between number and unit.

**Interaction**
- "Persist state in the URL so share, refresh, Back/Forward work" — filters,
  tabs, pagination, expanded panels.
- "Back/Forward restores prior scroll." (We currently fail this; see backlog.)
- Hit targets ≥ 24px, ≥ 44px on mobile.
- Visible `:focus-visible` ring on everything focusable.
- Don't rely on colour alone for status; include a text label.

### Stripe — how a money screen opens and how a report is built

- The dashboard home opens with **one primary figure and a trailing chart**,
  not a row of equal peers. Supporting counts sit beneath it.
- A report is **summary, then breakdown, and the breakdown carries its own
  totals**. The summary earns its place by holding the comparison the table
  can't.
- Five status hues, no more. We already match this.
- Badges mark *unresolved* things (disputes), never totals.

### Linear — density and restraint

Values taken from their shipped CSS in the earlier research pass:
- `--font-weight-semibold: 590` on all nine title tokens — heading weight is a
  half-step, not a jump to 700.
- `--border-hairline` resolves to `.5px` at `min-resolution: 192dpi`.
- 15px body text at comfortable row heights; density comes from restraint in
  chrome, not from shrinking type.
- Filters render as chips with per-chip removal plus a clear-all.
- Badges mean "this needs you", never "this is how many exist".

**The calibration argument, recorded so it doesn't get re-litigated:** Vercel
could ship Linear's entire keyboard system tomorrow and deliberately ships one
shortcut (⌘K). Three users at forty minutes a day are not triagers. We borrow
Linear's *restraint*, not its power-user surface.

---

## Part 2 — The page contract

Every page in this app will obey the same five rules. This is what actually
made Reconciliation land, generalised.

1. **The page states its answer.** Find the one question the page exists to
   answer and make that the largest thing on it. Reconciliation's answer was
   the difference — the number the old layout made the reader compute
   themselves. Every page has an equivalent.
2. **States are designed, not defaulted.** Before data exists, the entry form
   *is* the page — no `—` placeholders standing in for a verdict that cannot
   exist yet. After it exists, the input collapses to a summary with a Change
   affordance.
3. **Explanation sits beside the thing it explains.** Never a permanent banner
   above everything. Unit economics belong next to the margin; delivery rules
   belong in the subtitle.
4. **Actions are named for what they do**, and the label matches the heading
   above it. `Mark reconciled` became `Close July 2026` because the button
   locks the month at the database level.
5. **Detail folds away.** Supporting evidence opens automatically only when the
   verdict says something is wrong.

Plus two layout rules learned the hard way:
- **Full width, left-aligned, like every other page.** A centred narrow column
  reproduces both complaints the client has already made — content squeezed
  into the middle, and a dead right-hand gutter. Cap *fields*, not pages.
- **Rows of cards don't stretch.** `lg:items-start` where two cards of
  different natural heights sit side by side, or the shorter one grows a void.

---

## Part 3 — Per-page plan

Measured at 1440×1000 as master. "Blank" is unused viewport below the content.

### DONE

| Page | Was | Is now |
|---|---|---|
| Reconciliation | two columns, both half-answered | one column, state-driven, Difference is the hero |
| Dashboard | 4 equal tiles, 1 of 5 alerts shown | hero + sparkline + Needs attention (all 5) |
| Monthly Report | purple rail, 3 of 4 figures duplicated below | header-level month picker, Your 2% leads |
| Credit Purchases | 4 equal tiles, 2 of them reference | Credit balance leads, margin in `caution` brass |
| SIM Card Stock | 10 equal figures, 2 explanation blocks, 1780px | hero + 3 pools with sub-lines, economics in subtitle |
| SIM Delivery | 485px blank, answer buried in grey subtitle | hero states the queue and the worst wait |

### TO DO

**Notifications** — 422px content, **499px blank**, no hero.
The page's answer is "what needs you, and how urgent". It already has the data
(`buildNotifications`, five categories, each with a `staleDays`). Plan: hero
states the count and the oldest unresolved item; group by category rather than
one flat list; each row keeps its action label. Empty state uses the `cleared`
variant — no CTA on finished work. Reference: Linear's inbox (grouped, aged),
Geist's rule that persistent warnings belong in the header, not as a banner.

**Dealers** — **3025px**, one card, no hero, no summary at all.
This is the resource index. Polaris's prescription — "use the resource type as
page title", filtering and multi-select at the top of the index itself,
primary action top-right — plus Geist's table rules. Plan: header states the
population and what's actionable in it (how many active, how many gone quiet,
how many with no region). Saved views replace the three hardcoded tabs. Filter
chips with per-chip removal (already built, needs wiring here). `tabular-nums`
on every numeric column. Sortable headers become buttons announcing next sort
state.

**Dealer detail** — needs the same treatment as a record page: identity and
status at the top, the money answer next, history folded below.

**Transactions** — 1694px, no summary.
The ledger. Its answer is "what's waiting on me" — pending count and the
oldest. Plan: hero states pending/verified/flagged split for the current
filter; per-row `•••` overflow menu instead of three always-visible buttons
across 50 rows; `Reverse transaction` named correctly (never "Undo" — posting
a contra entry is the accounting-standard answer and the app already has the
mechanism).

**New Transaction** — 997px, one explanation strip.
A form page. Plan: Polaris annotated layout (description left, fields right) so
the page reads at full width without a dead gutter; the oversell block becomes
a persistent inline `Note` beside the field, not a toast, because it's a
problem the user must fix; validate on blur, keep submit enabled, focus the
first error on submit; dirty-form guard.

**Onboard Dealer** — 792px, 129px blank.
Already uses AnnotatedSection. Remaining: the same form discipline as above,
plus a duplicate-check result in the right column so the space earns itself.

**Account Settings** — 1216px.
Settings archetype: annotated sections, each with its own save, sentence-case
headings, no page-level save button.

**Audit Log** — 2300px, one strip.
Deliberately left alone so far and it holds up. Revisit last, only to check it
still reads as part of the same product once everything around it changes.
Two things noted: the filter row mixes two mechanisms (three selects plus an
apply button, alongside tabs that apply on click), and the explanatory banner
is permanent.

**Login / Forgot password** — outside the shell, never audited. Check they
carry the same type scale and button treatment.

---

## Part 4 — Cross-cutting work

These are single fixes that improve every page at once. Worth doing before the
per-page work, because each page inherits them.

1. **A shared `Field` component** generating ids with React's `useId`, so every
   label is associated with its control. Currently every form writes the label
   as a plain sibling; axe only catches the subset that also lack a
   placeholder, which is why this has surfaced two or three at a time instead
   of all at once. Fixes Geist's most basic form rule app-wide and stops it
   recurring.
2. **Loading discipline** — show-delay 150–300ms, minimum visible 300–500ms,
   skeletons that mirror the final layout so nothing shifts.
3. **Scroll restoration on Back.** The browser restores the *document*
   scroller, but this app scrolls `<main>`. Nothing to restore, so Back always
   lands at the top. Geist lists this as a rule; we fail it on every page.
4. **`tabular-nums` audit** across every numeric column.
5. **Copy sweep** to Geist's rules: numerals for counts, consistent currency
   decimals, real ellipsis, errors that say how to fix, no "successfully".
6. **URL as state** — every filter, tab and expanded panel deep-linkable.

---

## Part 5 — Order

Cross-cutting items 1 and 2 first, since every page inherits them. Then pages
worst-first by measured defect:

1. `Field` component + loading discipline
2. Notifications (499px blank, no hero)
3. Dealers (3025px, no summary, the app's biggest page)
4. Transactions (the ledger)
5. New Transaction + Onboard Dealer (forms, together)
6. Dealer detail
7. Account Settings
8. Login / Forgot password
9. Audit Log — last, as a consistency check rather than a rebuild

Each page ships on its own commit, verified at 1440 and 390px with axe-core
clean and no horizontal scroll, with a screenshot for the client before moving
on.
