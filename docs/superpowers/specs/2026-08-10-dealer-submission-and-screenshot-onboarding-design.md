# Two ways a dealer's own words get into the system

**Date:** 2026-08-10
**Status:** approved, in build

Today every fact in Vibe456 was typed by staff. A dealer WhatsApps "boss I want to top up
RM500", someone reads it, and types it. A new shop sends its company details, someone reads
them, and types them. The typing is the whole job, and the typo risk sits with the person who
did not send the message.

Two features move that. They are separate on purpose — different users, different mechanics,
no shared code beyond the forms they already end at.

| | Who does it | What it replaces |
|---|---|---|
| **A. Screenshot onboarding** | Staff (cs/master) | Retyping a new shop's details off WhatsApp |
| **B. Dealer link** | The dealer | Staff guessing what the dealer wants and asking back |

Neither feature changes a single ledger rule. Both end at forms that already exist
(`/onboard`, `/entry`), so append-only, maker-checker, the credit-balance hard block, the
period lock, and duplicate-name detection all apply unchanged, because they are the same code
path they always were.

---

## A. Screenshot → onboard form

### What happens

`/onboard` grows an upload box above the existing form. Choose up to four images of a WhatsApp
conversation; the fields below fill in; a human checks them and presses **Onboard dealer** the
same as today.

### Rules

1. **It fills, it never submits.** Success is a populated form, not a saved dealer.
2. **Missing means blank, not guessed.** A field not visible in the images comes back `null`
   and stays empty.
3. **Package and rate are never read from an image.** Those are a commercial decision, not a
   fact in a chat log. The AI does not get that field in its schema.
4. **Region snaps to the known list.** Output goes through `normalizeRegion` so "kedah" and
   "Kedah, Malaysia" cannot open two new buckets in the dashboard's region grouping.

### Why this is small

`src/app/api/reconcile/extract/route.ts` has been doing exactly this for the monthly statement:
role guard, hourly rate limit, size and MIME validation, a JSON-schema-constrained Haiku call,
and — importantly — a two-way error split so an unfunded API key says "ask your admin", not
"your photo is bad".

That plumbing moves to `src/lib/vision-extract.ts` and both routes use it. The new route
`src/app/api/onboard/extract/route.ts` is then just: who may call it, what to read, what shape
to return.

| | `/api/reconcile/extract` | `/api/onboard/extract` |
|---|---|---|
| Roles | accountant, master | **cs, master** — matches who may onboard |
| Images | 1 | **up to 4** — a chat rarely fits one screen |
| Returns | 2 numbers | company_name, company_no, contact_person, phone, whatsapp, email, address, region |
| Rate limit key | `ocr:<uid>` | `onboard-ocr:<uid>` — a separate hourly budget, so reading chats cannot starve month-end reconciliation |

Extracting the shared helper preserves reconcile's status codes and its error taxonomy exactly
— that taxonomy is the part most worth keeping, since it was written after a real incident where
every call was failing on a billing error and the screen blamed the user's photograph. Two
file-validation sentences did change, because the helper now serves a multi-image caller and
names the offending file rather than saying "Image is too large". That is an improvement at four
images and neutral at one.

---

## B. Dealer link → staff review → New Transaction

### The link

Every dealer gets one permanent URL: `https://cwc456.com/r/<token>`, sent over WhatsApp. The
token is 32 hex characters from `gen_random_uuid()`, stored in `dealers.submit_token`,
backfilled for all 284 existing dealers and defaulted for new ones.

Permanent, not per-request: a dealer tops up several times a month and must not need a fresh
link each time. The link identifies a dealer; it does not authenticate a person. That is
acceptable because **the link cannot move money** — it can only place a request in a queue that
a human must accept, after checking the bank, exactly as they do today.

`submit_token` is also added to the `dealers_directory` view, so cs can see and send it. cs is
the role that talks to dealers all day and the one most likely to be asked "how do I send my
order in". The token is a contact channel like the phone number beside it, and it is not a key
to anything cs cannot already reach: what a link can do is add a row to a queue only accountant
and master can read or act on.

### What the dealer sees

The page opens with their company name, so a wrong link is obvious immediately.

- **If they have a rate:** choose Top-up (enter RM) or Package. The points their money buys are
  shown, derived from their own rate.
- **If they have no rate** — which is 242 of 284 dealers today — top-up is not offered at all,
  because there is no rate to price it with. The page says a package has to be set up first and
  offers only package selection. This mirrors what `/entry` already refuses to do.
- Optional: a payment slip image, and a note.

Below the form: their own recent requests and each one's status. Same URL, no login, so a
dealer can always check "did they get it?" without messaging anyone.

### What staff see

A new page `/requests` (nav group *Transactions*, roles accountant + master — accepting one
creates a money row, so it is not a cs screen). Each pending request shows the dealer, what
they asked for, when, the note, and the slip.

- **Accept** → a link to `/entry?request=<id>` with dealer, type, and amount pre-filled. The
  staff member still checks the bank and still presses save. The request is marked accepted by
  the transaction landing, not by a button on this page.

  There is deliberately **no `acceptRequest` action**. A button here that flipped a status would
  be a second way to record money, alongside `/entry` and its balance check, period lock,
  duplicate warning and second-person sign-off. There is one front door; this is a link to it.
- **Reject** → with a reason, which the dealer sees on their link. The reason is required in the
  action *and* by a table constraint, because a rejection nobody explained is the one that starts
  a phone call.

A request is a claim, not a record. Nothing in it is trusted until a person accepts it.

---

## Data model

```
dealers
  + submit_token  text unique not null default replace(gen_random_uuid()::text,'-','')

topup_requests
  id              uuid pk
  dealer_id       uuid not null references dealers
  type            text not null check (type in ('topup','package'))
  money_rm        numeric        -- topup only
  package         text           -- package only
  note            text
  slip_url        text           -- receipts bucket, same as entry
  status          text not null default 'pending'
                                 check (status in ('pending','accepted','rejected'))
  reject_reason   text
  transaction_id  uuid references transactions   -- set on accept
  decided_by      uuid references profiles
  decided_at      timestamptz
  created_at      timestamptz default now()
```

`transaction_id` is what makes the chain auditable end to end: a verified transaction can be
traced back to the exact words the dealer submitted, months later.

---

## Security decisions, and why

**The public page never touches PostgREST.** `/r/<token>` renders server-side and submits
through a Server Action that uses the service client. `topup_requests` therefore has **no anon
policy at all** — the anon key cannot read or write it directly.

The alternative was a `SECURITY DEFINER` RPC callable by anon. That is the pattern this codebase
normally reaches for, but here it is worse: it widens the PostgREST surface, which is precisely
where 0038 and 0041 both found real holes. A route that renders on the server and writes with
the service role exposes nothing to a curious anon key.

**RLS for staff** is normal: accountant and master select and update; cs has no policy, matching
every other money table.

**Abuse limits on the public path** — the endpoint is unauthenticated, so:
- `check_rate_limit` keyed `submit:<token>`, 10 per hour — on the token rather than an IP,
  because one mobile carrier's NAT is shared by every dealer behind it and the thing worth
  limiting is one link
- at most 5 open pending requests per dealer, so a stuck dealer cannot bury the inbox. Enforced
  by a `before insert` trigger, not only in the action — the form is a courtesy, the constraint
  is the rule (the same split `createDealer` uses for duplicate names)
- slip uploads reuse the existing `receipts` bucket and its size and MIME limits (0002, 0019),
  so a slip is served through the existing signed-URL route and nothing becomes publicly
  readable

**Middleware** needs `/r/` public, and needs it to be a *different kind* of public from
`/login`. `PUBLIC_ROUTES` today also redirects signed-in users away — correct for the login
page, wrong here, since staff must be able to open a dealer's link to see what the dealer sees.
So: exempt from the sign-in requirement, exempt from the signed-in redirect.

**A leaked link** lets someone submit a false request in a dealer's name. It cannot read the
dealer's history beyond their own requests, cannot see rates other than that dealer's own, and
cannot create a transaction. The staff bank check catches it, and the request row records
exactly what was claimed. Rotating a token is a column update if it is ever needed.

---

## Not in this build

- **Sending the links.** `dealers.whatsapp` is filled for 0 of 284 rows, so there is nowhere to
  send them yet. That backfill is tracked separately and is a prerequisite for rollout, not for
  the build.
- **Dealer-visible statements or balances.** The link shows a dealer only what they themselves
  submitted.
- **Any WhatsApp API.** Links are pasted by hand; `wa.me` click-to-chat is the only integration.
- **cs access to requests.** cs sees no money. Unchanged.
- **Screenshot reading on `/entry`.** Feature A is onboarding only. `/entry` gets the dealer
  link instead.

---

## Testing — what actually ran

**Vitest** — `src/lib/dealer-extract.test.ts`, 17 new cases (144 total, all passing). Malaysian
phone normalisation across the five shapes one number arrives in, region snapping, dropping a
WhatsApp number identical to the phone, refusing an email the field could never accept, reading
a model that answered "unknown" as empty, and three structural assertions on the schema itself —
that it never asks for a package or rate, that every field may be null, and that every property
is required.

**Playwright** — `qa-demo-requests.mjs`, driven against the demo. 37 checks, all green:

- a dealer submits from a phone-sized viewport with no cookies; the request lands as pending,
  with their note, and **nothing reaches `transactions`**
- returning to the same link shows the status
- a rate-less dealer is offered no top-up and no amount field
- an invented token gets "this link isn't active", with no hint whether it was real
- staff see it, accept it, land on a pre-filled `/entry`, save, and the request closes itself and
  links to the row it became
- turning one down with a reason, and the dealer reading that reason on their own link
- the sixth pending request for one dealer is refused **by the database**
- the anon key cannot address `topup_requests` (401); a cs session reads nothing from it; cs can
  still see the dealer's link, and Dealer Requests stays off the cs nav
- the onboarding upload, run twice — once against the real model, once against a stubbed
  response so the wiring stays covered on a day the AI service is down

Three findings in the first two runs were the harness, not the app: two checks read the page
before a soft navigation finished, one matched the words "Dealer Requests" in the link card's own
copy rather than in the nav, and two more were answered by the previous run's data. The script now
waits on the new page, asserts against `nav`, and uses a different amount each run.

One finding was real and is fixed: the onboarding summary counted filled fields inside a
`setValues` updater, which does not run until React re-renders — so it always said "nothing
changed" while the fields filled in correctly.

**design-audit.mjs**, before and after, at 1440 and 390:

| | before | after |
|---|---|---|
| `/onboard` (cs) | clean | clean |
| `/entry` | clean | clean |
| `/requests` | — | clean |
| `/dealers/[id]` | 3 problems | the same 3 problems |

The dealer page's three (row heights 41/59, one element under the 12px floor, eight font sizes)
are byte-identical before and after — pre-existing, and not touched by this change. Two new
elements of mine that sat at 11px were raised to 12 anyway.

`/r/<token>` is not measurable by the audit, which looks for the app shell it deliberately does
not have. It was reviewed by screenshot at 390 instead.

**Migration 0042** applied to the demo (34 dealers, 34 distinct tokens) and to production
(284 dealers, 284 distinct 32-character tokens, 0 malformed, 2 policies, view column present).
The anon key gets 401 on `topup_requests` in production.

`vitest 144 / tsc 0 / eslint 0 / next build ✓`

### Known, and not a defect in this work

The `ANTHROPIC_API_KEY` in `.env.local` is out of credit — every call returns
*"Your credit balance is too low to access the Anthropic API."* Both extract routes classify
that correctly and tell the operator to ask their admin rather than blaming their photograph,
which is the behaviour the taxonomy exists for. But it also means **the existing reconciliation
OCR cannot work today either**, wherever that key is in use. Worth checking the Vercel value
before relying on either feature.
