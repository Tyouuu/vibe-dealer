# UI/UX backlog

Sourced from two research passes against Stripe, Linear and Vercel (values
pulled from their shipped CSS and published design systems, not from opinion),
plus the client's own reactions. Ordered so the cheapest visible wins come
first.

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done

---

## Client's own complaints — all three addressed

Kept here with the original diagnosis so the reasoning survives. What was
actually changed is noted under each.

### `[x]` Reconciliation — "the page I dislike most, feels like a different platform"

Diagnosis from reading the page against the rest of the app:

- The "No statement yet" headline renders in the **mono** face at ~28px. Mono
  is used nowhere else for prose in this app — it's reserved for figures. That
  single choice is most of why the page reads as imported from somewhere else.
- `Mark Reconciled ✓` is a **full-width grey button with a literal ✓ character**
  in the label. Every other primary action in the app is a near-black
  `.btn-primary` sized to its content, and no other button embeds a glyph.
- The purple `Your 2% Due` strip is a one-off treatment — a full-bleed tinted
  bar exists on no other page.
- Three different container styles stack inside one card: a dashed-border
  info box, a tinted strip, and a bordered verdict panel.
- The right-hand "Enter Vibe Statement" card is short and floats against a
  tall left column, so the two columns don't relate.

**Done.** Rebuilt around one verdict, stated once, using only existing
components: an icon + headline + one-line explanation + a `.pill` for the
state, then the same three figures (your system / Vibe's / your 2%) in every
state so nothing moves as the verdict changes. Mono prose, the dashed info
box and the purple strip are all gone; the button is content-width with no
glyph. Also fixed the ISO date leaking into the title, and a real clipping
bug — `lg:grid-cols-[1.55fr_1fr]` let the right column's min-content push it
past `main`, cutting the card off. Now `minmax(0,…)`, applied to all such
grids in the app.

**Second pass — "still don't like it, I think it's the overall structure."**
The first pass fixed the styling; the client's follow-up said the *structure*
was the problem, so this pass was driven by how QuickBooks, Xero, NetSuite,
GOV.UK and Stripe actually build a reconcile screen rather than by taste:

- **One column, state-driven.** The two-column layout showed an entry form and
  a verdict side by side, so both were half-answered at all times. There are
  really two states. Before a statement exists the form *is* the page — no
  verdict placeholders showing `—`, because `Difference = statement − cleared`
  genuinely cannot exist yet; that's why QuickBooks gates its whole reconcile
  screen behind entering the ending balance. Once it exists, the form collapses
  to a read-only summary line with a `Change` link (GOV.UK check-answers) and
  the verdict takes the space.
- **Difference is the hero.** It's now a 34px figure with a one-line plain
  reading of it. The old layout showed your total and Vibe's total side by side
  and left the reader to subtract them — the page's entire output was the one
  number it never displayed.
- **Month moved into the header**, beside an `Open`/`Closed` pill, rather than
  being the first control inside the content.
- **Evidence folded away**, opening automatically when the difference isn't
  zero — at that point the task changes from confirming to investigating.
- **Closing got its own block** with visible preconditions, and the button now
  reads `Close July 2026`, matching the heading above it, instead of
  `Mark reconciled`. It locks the month in the database (migration 0031), so
  it's named for what it does.
- **Full width, left-aligned.** The rebuild initially centred a `max-w-3xl`
  column, which reproduced *both* of the client's earlier complaints at once —
  content "squeezed into the middle" (Notifications) and a dead right-hand
  gutter (Onboard Dealer). The research asked for a single column, not a narrow
  one. Field widths are capped inside the form instead, where a narrow box is
  correct and a 1100px points input is not.

Verified in all three states (no statement / matched / mismatch) at 1440,
820 and 390px: axe-core clean, no horizontal document scroll.

### `[x]` Credit Purchases — "something's odd, can't say what"

- `CASH MARGIN VS 2%` shows `RM -19,512` with `Expected RM 769.98` underneath.
  A large negative number with no explanation of why it's negative reads as an
  error. It's negative because stock was bought up-front and hasn't been resold
  yet — the tile never says so.
- Four tiles where only two are decisions ("how much can I still sell", "am I
  ahead or behind"). Total Bought and Total Cost Paid are reference figures,
  not KPIs.
- Same 4-equal-tiles problem as the dashboard.

**Done (partly).** The tile now says why it's negative: "Normal while stock
is unsold — 21,501 pts still to sell. Settles toward RM 769.98", in brass
rather than alarming red. Four tiles in the 1.4fr column also gave each ~140px,
which truncated labels to "TOTAL BO…" and broke "-RM 19,512.00" across two
lines with the minus stranded on its own — now two across, figures
`whitespace-nowrap`. Still open: demoting Total Bought / Total Cost Paid,
which are reference figures rather than decisions.

### `[x]` Onboard Dealer — "right side too empty"

The AnnotatedSection gives description-left / fields-right, but the fields
are capped at `max-w-xl`, leaving a third of the row empty on the right. Either
widen the field column, move to a single centred column for this page, or put
something useful in the gap (duplicate-check result, a live preview of the
dealer card).

**Done.** The field grids were capped at `max-w-xl` inside a ~780px column.
Cap removed; measured gutter went from ~200px to 0.

---

## Batch 1 — cheap, visible, do first

- `[x]` **Sticky table headers.** Needed a real fix, not just `position:
  sticky` — see the note in `scroll-fade.tsx`. CSS won't let a box scroll on
  one axis and stay visible on the other, so the `overflow-x-auto` wrapper was
  turning itself into the sticky containing block and the header scrolled away
  with the rows (measured: top 343px → −257px on a 600px scroll). The wrapper
  now only takes `overflow-x-auto` when the table genuinely doesn't fit.
- `[x]` **`—` in empty cells.** Already done throughout — 58 sites. The
  research assumed otherwise; checked before changing anything.
- `[x]` **Back link on dealer detail.** Already existed; only needed sentence
  case (`← Back to dealers`).
- `[x]` **Pagination copy** → `Previous` / `Next` across all six paginated
  tables. Dropped the arrows-inside-labels.
- `[x]` **Split empty states**, via a shared `EmptyState` with three variants:
  `empty` (offer the action), `filtered` (offer Clear filters, never the
  create action), `cleared` (no action — a CTA on finished work reads as a
  chore). Verified in the browser that a no-match search offers Clear filters
  and does NOT offer "Onboard dealer".
- `[x]` **Empty state rendered outside the table.** Records was rendering it
  in a `colSpan={10}` cell inside `<tbody>`.
- `[x]` **`aria-live="polite"`** — built into `EmptyState`.
- `[ ]` **Scroll restoration on browser Back.** NOT done, and it's more than a
  quick win: the browser only restores the *document* scroller, but this app
  scrolls `<main>` (`lg:overflow-y-auto` inside an `lg:overflow-hidden`
  shell), so there is nothing for it to restore. Fixing it properly means
  either moving the scroll to the document or saving/restoring
  `main.scrollTop` across navigations. Same root cause as the sticky-header
  problem: the app has a nested scroll container instead of a page scroll.

## Batch 2 — worth it, more work

- `[x]` **Active-filter chips** with per-chip removal and `Clear all`. Each
  chip links to the current URL minus itself, so removing Month keeps Status
  and Search. Records' bespoke dealer pill (its own markup and a ✕ glyph) is
  folded into the same component, so there's one way to see and remove a
  filter instead of two. `Clear all` only appears with 2+ chips.
- `[ ]` **Validate on blur, focus the first error on submit, keep submit
  enabled.** Geist Input is explicit that validation should not fire per
  keystroke and that a pristine form's submit shouldn't be disabled.
- `[ ]` **Dirty-form guard** on Onboard Dealer, New Transaction and the dealer
  edit modal — warn before navigating away, and block outside-click/Esc
  dismissal on the modal while dirty.
- `[ ]` **Oversell block as a persistent inline `Note`**, not a toast. Geist:
  a problem the user must fix belongs next to the field, and must persist.
- `[ ]` **Confirm-modal copy discipline.** Title = Title Case statement, never
  a question. Primary button = Verb + Noun matching the title. Cancel is
  always literally `Cancel`.
- `[ ]` **Toast copy discipline.** Success = past participle, never the word
  "successfully". Error = two sentences ending in the recovery step. One
  terminal toast per flow, never a narration.
- `[ ]` **Real Undo where a real undo exists** — SIM Delivery bulk mark-sent
  and Verify/Flag are status flips and are genuinely reversible. 5–10s
  snackbar, label always literally `Undo`.
- `[ ]` **`Reverse transaction` on the ledger — never labelled Undo.** Posting
  a contra entry is the accounting-standard answer (SAP/Oracle/QuickBooks all
  work this way) and the app already has the mechanism; this is naming and UI.
- `[ ]` **Optimistic for status flips, pessimistic for anything touching
  money.** An optimistic ledger row that later fails is worse than a 400ms wait.
- `[ ]` **Per-row `•••` overflow menu** on Transactions instead of three
  always-visible buttons across 50 rows.

## Batch 3 — bigger, genuinely valuable

- `[ ]` **⌘K command palette.** 249 dealers + 11 pages + ~8 actions. Grouped,
  recents shown before typing, imperative labels. Loudest single "this is a
  real product" signal available.
- `[ ]` **Global search in the topbar.** The desktop header is a full-width
  sticky bar holding one widget — and renders completely empty for `cs`.
- `[ ]` **`?` shortcuts overlay** once there are shortcuts worth listing.
- `[x]` **Dashboard restructure.** Done 2026-07-31. Two corrections to what
  this entry originally claimed, both found by looking at the running page
  before changing it:
  - The 44-series trend chart was **already** a single line with an
    "All Regions" picker. That part of the entry was stale.
  - The fourth "KPI" tile was never a metric — it was Reconciliation status
    with an *Action needed* pill, i.e. already doing alert duty inside a
    metric's shell.

  The real defect was narrower and worse: `buildNotifications` computes **five**
  kinds of alert (pending review, low balance, SIM deliveries, month not
  reconciled, dealers gone quiet) and the dashboard surfaced exactly **one**.
  Nothing on the page could tell you three transactions were waiting or that
  the balance was about to block a sale — you had to know to open the bell.

  Shipped: four equal tiles → one `HeroCard` (headline figure, trailing
  6-month sparkline, three supporting stats) + one `NeedsAttention` card
  fed by the same `buildNotifications` the bell and /notifications use.
  **Four blocks became two, so density went down, not up** — which is the
  constraint that matters here, because a denser dashboard was explicitly
  rejected once before (see the design-system note). Applied to all three
  roles, each with its own headline: master → commission, accountant →
  top-up volume, cs → SIM deliveries pending.

  Grounding: Stripe's dashboard home opens with one primary volume figure
  plus a trailing chart rather than a row of peers; NN/g's visual-hierarchy
  guidance is that scale is the signal for importance, and their eighth
  guideline for complex applications is to make important information
  salient *or remove what isn't essential*. Verified across master /
  accountant / cs at 1440 and 390px: axe-core clean, no horizontal scroll.
  Also removed three `text-paper-dim/70` opacity modifiers in `growth-map`
  that were failing contrast at 2.92:1 — same class of bug as the token fix
  that took the app to zero contrast failures.
- `[ ]` **Saved views** replacing the three hardcoded Dealers tabs.
- `[ ]` **Sentence case sweep.** Atlassian and Polaris both specify sentence
  case for every heading, label, menu item and button. The app is Title Case
  throughout.

### `[~]` Growth-by-Region map — removed 2026-07-31, rebuild only with full data

Removed from the dashboard. The concept was the client's own and it's a good
one ("click Penang and zoom into that area to see which dealers sell best") —
what failed was coverage, not design.

Measured before removing: the app has **44 distinct regions and the map could
plot 6**. Of 249 dealers, **109 (44%) appeared on it and 140 (56%) did not** —
including Hutan Melintang (12), Cameron Highlands (11), Parit Buntar (10),
Kuala Kangsar (8), Seri Manjung (8). A map reads as "here is where my dealers
are", so one that omits more than half the business misinforms rather than
informs. It was also the tallest element on the page, which stretched its grid
row and left a ~400px void inside the chart card beside it (the client spotted
that void). The region list next to it already answers the same question over
*all* regions, with rank and share.

**What a rebuild needs — the blocker is data, not design.** Reference designs
are not the hard part: proportional-symbol maps (Datawrapper's symbol map,
Observable Plot's `dot` with an `r` scale) are the standard form for "one
value per place", and the conventions are well documented. What's missing is a
coordinate for each of the 44 town names the `dealers.region` column actually
contains — `Ipoh`, `Kamunting`, `Gerik`, `Hutan Melintang` and so on are towns,
while the open datasets (DOSM, geoBoundaries) are published at district level,
so the names have to be geocoded and mapped onto districts first. Until every
region resolves to a point, any map repeats the same defect.

The removed SVG district paths are recoverable from git history — see
`src/app/(app)/dashboard/districts.ts` at the commit that deleted it. Some
geo source files were also downloaded into the scratchpad during earlier
research (`mys-adm2.geojson`, `dosm-districts.geojson`, `osm_perak.json`).

## Explicitly NOT doing

Recorded so it doesn't get re-litigated. Each of these is real in Linear or
Stripe and wrong for a three-person internal tool:

`j`/`k` list navigation · `x` to select · `g`-then-key nav · Space-to-peek /
split view · nested AND/OR filter builder · Stripe's typed query syntax
(`amount:>149.99`) · AI natural-language filters · density toggle · Redo ·
local-first sync engine · inline editing in the ledger (the append-only
invariant is the product) · user-configurable shortcuts · customisable
dashboard widgets · onboarding tours · changelog page.

The calibration argument: **Vercel could ship Linear's entire keyboard system
tomorrow and deliberately ships one shortcut (`⌘K`).** Three users at forty
minutes a day are not triagers.

## Settled — do not change back

- IBM Plex Sans stays. PostHog and Amplitude ship it, and Stripe's dashboard
  uses the plain OS system stack. The typeface was never the problem.
- 14px body at ~49px rows stays. Linear and Mercury both run *larger* (15px).
- Five status hues stay. Stripe ships exactly five.
- Tinted (not pure-black) shadow stays — that one was already right.
- Near-black primary button with purple as accent-only stays.
