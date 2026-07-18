# Security & Feature Gap Audit

Run 2026-07-18. Two parallel efforts: (1) five independent agents doing a direct, from-scratch read of the actual codebase across auth/session, database access control, API routes/business logic, secrets/dependencies, and every Server Action; (2) external deep research comparing vibe-dealer against real prepaid-distribution/DMS platforms and security-standard bodies (OWASP ASVS, SOC 2). Findings below are deduplicated and cross-referenced — several were independently caught by two different agents from different angles, which is noted where it happened since it increases confidence.

**Read this first:** the single most important finding is #1 below — a real, live gap in exactly the rule this session already tried to fix once (CS should have zero financial visibility). It was patched in application code earlier but the actual database permission was never closed. That's the clearest illustration of why this audit was worth doing.

---

## Critical

### 1. `cs` role can read `dealers.rate` directly — the app-layer fix from earlier this session never closed the real hole
Found independently by both the RLS audit and the Server Action sweep.

`dealers_select_staff` (`supabase/migrations/0001_profiles_and_rls.sql:63-65`) grants **full-row** SELECT on `dealers` to `master`, `accountant`, **and `cs`** — including `rate`, the commission figure `PROJECT_SPEC.md` explicitly says cs must never see ("CS 看不到财务"). Migration `0004` tightened the UPDATE policy to accountant/master only but never touched SELECT.

What actually happened earlier this session: `dealers/page.tsx`, `dealers/[id]/page.tsx`, and `/api/dealers/export` were all edited to strip `rate` from what's *rendered* to a cs user. That's real, and it closes the UI. But it doesn't close the database — a cs session's own already-issued Supabase credentials can call `supabase.from('dealers').select('rate')` (or hit PostgREST directly) and get every dealer's real rate back, completely bypassing the app. This is exactly the "app code remembered to hide it in two places, RLS was supposed to be the real backstop and wasn't" pattern this session has otherwise been careful about (`mark_delivered`, `delivery_queue`).

Current practical exposure is smaller than it sounds because rate has been flat 6% for every dealer since migration 0010 — so today this "leaks" a number cs could already infer from the (legitimately visible) package tier. But it's a live, real gap in the stated access-control model, and it stops being harmless the moment rates are ever differentiated again — with nothing to catch the regression.

**Fix:** mirror the pattern already proven for `transactions` → `delivery_queue`: add a `dealers_staff_view` excluding `rate`, point cs-facing reads at the view, and restrict `dealers` base-table SELECT to accountant/master only.

### 2. Credit-balance hard-block has a real race condition — concurrent transactions can together oversell
The balance check (`src/lib/credit-balance.ts`) and the insert that follows it (`entry/actions.ts:70-91`, `records/actions.ts:107-127`) are two separate network round-trips with nothing tying them together at the database level — no lock, no constraint, no transaction spanning both. Confirmed this is a real risk on the actual stack (Supabase/PostgREST + Next Server Actions on Vercel, not a single held-open connection), not just a textbook concern:

Two accountants (or one accountant with two tabs, or a retried request) submitting large transactions within the same ~50-100ms window can both read the same "available" balance, both pass the check, both commit — oversold past what was actually paid for to Vibe Mobile. Example worked through in detail: a true balance of 400 pts, two concurrent 400-pt submissions, both pass, 800 committed against 400 real stock — on the order of RM 450-550 oversold in one collision, scaling with whatever the real balance is at the time and with however many requests happen to collide (not capped at 2).

**Fix (concrete, fits this stack):** a `BEFORE INSERT` trigger on `transactions` using `pg_advisory_xact_lock` to serialize concurrent inserts, then re-checking the real balance server-side inside the same transaction as the write — so the loser of a race gets a Postgres error instead of silently succeeding. Full SQL drafted during the audit, ready to turn into a migration. Needs zero application code changes; the existing app-layer check stays as the friendly fast-path message.

A second, narrower version of the same root cause: two concurrent `adjustTransaction` calls correcting the *same* original transaction both read the same pre-correction baseline and both apply independently instead of the second accounting for the first. Fix is smaller — a partial unique index (`on transactions (adjusts_id) where type='adjustment' and status='pending'`) so the second racing correction fails cleanly instead of double-applying.

---

## High

### 3. No brute-force protection on login
No rate-limiting, lockout, or CAPTCHA anywhere in the codebase — confirmed by an explicit grep, zero hits. Whatever protection exists is entirely Supabase's own opaque platform-level API limits, not something this app controls. Staff emails are plausibly guessable; this is a real-money app going live. Recommend enabling Supabase Auth's CAPTCHA integration (Turnstile/hCaptcha, Dashboard-configurable) as the cheapest real fix.

### 4. Session cookie can't be `httpOnly` because sign-in happens client-side
`login-form.tsx` calls `supabase.auth.signInWithPassword()` from the **browser** client. `@supabase/ssr`'s browser storage adapter writes the session cookie via `document.cookie`, which structurally cannot carry `HttpOnly` (a browser platform restriction, not a config option) — confirmed by reading the library's actual default (`httpOnly: false`). Any future XSS (none found today, but there's also no CSP to compensate — see #6) could read the cookie and steal a live session, including a master's. Real fix is moving `signInWithPassword` into a server action so the `Set-Cookie` response header can be `httpOnly: true` — an architecture change to the login flow, not a one-liner.

### 5. Balance calculation pulls every row instead of aggregating — silently wrong once the table grows
`getAvailablePointsBalance` (`src/lib/credit-balance.ts:28-38`) pulls every `credit_purchases`/`transactions` row and sums in JavaScript, with no `.limit()`. Supabase/PostgREST caps rows returned per request (1000 by default); once `transactions` crosses that, the sum silently under-counts `totalCommitted` — which makes `available` look *bigger* than reality, the unsafe direction, with zero error signal. This needs no race, no attacker, just ordinary growth. Fix: a server-side `sum()` aggregate (RPC or view) instead of pull-and-reduce — same fix location as the race-condition trigger in #2, worth doing together.

---

## Medium

6. **No security headers anywhere** (`next.config.ts` is the bare default) — no CSP, no `X-Content-Type-Options`, no `Referrer-Policy`, no `X-Frame-Options`. Cheap, real hardening; compounds #4.
7. **Cookies never set `secure: true` explicitly** — both the Supabase session cookie and the app's own `preview_role` cookie (`preview-role-actions.ts:19-24`). Low real risk if the deployment is HTTPS-only end to end (it is, on Vercel), but a zero-cost fix.
8. **Password policy is enforced only client-side** (`account/change-password-form.tsx`, an 8-char `minLength` — trivially bypassed by calling the Auth API directly). Whether the actual Supabase project enforces anything stronger is a Dashboard setting, not visible from code — worth checking manually, along with enabling leaked-password protection (a known open item from earlier this session, still open).
9. **A brand-new instance of a bug this session already fixed once, in code from today** — `setNotificationsMasterEnabled` (`account/actions.ts:8-16`, part of the account-settings feature) writes to `profiles` directly, but `profiles`'s only UPDATE policy is still master-only. For accountant/cs, the toggle flips in the UI and silently reverts on reload — every time — because the RLS write is silently rejected and never checked. Same failure class as the dealer-status bug fixed via `set_dealer_status` earlier this session. Fix the same way: a narrow SECURITY DEFINER RPC scoped to just that one column — explicitly **not** a broader self-update policy, which would let a user also rewrite their own `role` column.
10. **`seed_dealer_rate_history` trusts its input parameters with no validation** — correctly re-checks *who* is calling, never checks *what* they're claiming (an arbitrary rate, no duplicate-seed guard). Low blast radius (only reachable by already-trusted cs/master) but muddies a table whose whole purpose is being a trustworthy audit trail.
11. **The correcting-entry feature built today (migration 0013) has no database-layer enforcement** — `transactions_update_accountant` still allows a direct `UPDATE` on an already-verified transaction's `money_rm`/`points` with no restriction. The entire point of today's adjustment feature is "never edit a verified transaction in place" — that's true through the app's own UI, but a direct API call can still do exactly the thing the feature exists to prevent, with no audit trail (unlike `dealer_rate_history`/`company_statement_revisions`, which both capture before/after). Fix: a trigger rejecting changes to `money_rm`/`points`/`rate` on rows where `status='verified'`.
12. **Receipt uploads have no size/MIME enforcement** (`entry-form.tsx:107-119`) — goes straight from browser to Storage, bypassing every check `reconcile/extract`'s OCR route already has for the same class of file. Inconsistent, and unlike the OCR route, nothing on the bucket itself enforces a limit either.
13. **No rate limiting on the OCR extract route** — every call is real, billed Anthropic spend with no throttle on repeated calls.
14. **Unescaped dealer name in the daily-report cron email** — a `cs`-onboarded dealer name (free text) lands raw in HTML sent to every master. Realistic impact is a phishing link or tracking pixel inside a trusted-looking internal email, not in-app XSS. Simple `escapeHtml()` fix.
15. **`dealer_last_verified_activity` view has no role check at all** (unlike its sibling `delivery_queue`, which does) — any authenticated Supabase user, even one with no `profiles` row, can query it directly. No money involved, but inconsistent and easy to close.

---

## Low / Info

- Duplicated PostgREST search-sanitizer regex (`q.replace(/[,()%]/g, '')`) copy-pasted across 4 files — correct today, same "drifts apart over time" risk `csvCell` had before today's consolidation.
- `audit/export` (100/50/50-row caps) and `records/export` (2000-row cap) can silently truncate with no signal — a real risk specifically because "export" implies "the whole record" for dispute/compliance purposes.
- `signOutOtherSessions` (`account/actions.ts:47-51`) has no auth check — low impact today since nothing in it is attacker-controllable, but inconsistent with every other action.
- Error messages occasionally echo raw Supabase error text into redirect URLs — only ever seen by the already-trusted staff member who triggered it, but worth genericizing.
- `login_events` has no master-cross-visibility — arguably a missed product opportunity (a master might want to notice a teammate signing in somewhere odd), not a bug.
- Two Supabase packages use caret version ranges instead of exact pins (mitigated today by the committed lockfile).
- `npm audit`: exactly 2 moderate advisories, both inside a copy of `postcss` vendored *inside Next.js's own build tooling* (not the project's own postcss), both build-time-only with no reachable runtime path in this app, and the only available "fix" is a semver-major downgrade of Next itself that would break the app. Correctly left as tracked/accepted risk rather than blindly running `npm audit fix --force` — re-check after future Next version bumps.
- Supabase org is owned by a personal Gmail account (documented in `PROJECT_SPEC.md` itself) — not a code issue, but a real business-continuity single-point-of-failure worth a deliberate decision before this scales past one person.

## Confirmed solid (worth knowing what's *not* broken)

- The master-only "preview role" mechanism, re-derived from first principles by two separate agents: cannot be forged by a non-master, cannot escalate (can only narrow a master's own view), independently re-checked on both the write and read side, and irrelevant to real RLS decisions either way.
- `getUser()` (which revalidates against Supabase's Auth server) is used everywhere trust matters; `getSession()` (which Supabase's own docs warn is unsafe to trust server-side) is never used at all.
- Logout performs real server-side session revocation, not just a client cookie clear, and there's already a "sign out my other sessions" feature.
- Every Server Action (20 found across the whole app, full inventory checked) calls its own auth/role check independently rather than trusting UI visibility — including files from today's and last session's newer features.
- Bulk actions (CSV import, bulk status/delivery updates) re-validate every single row through the same guarded path as the single-row version — a crafted CSV can't smuggle an unauthorized change.
- No secret has ever been committed to git, in any of 70 commits, past or present — checked the full history, not just the current tree. The one service-role key in the codebase is correctly isolated to a `server-only`-guarded module with a single, correctly-gated consumer.
- CSV/formula-injection handling is fully consolidated and tested (today's `csvCell` work) across all 4 export routes.
- No shell/eval/`dangerouslySetInnerHTML` surface anywhere in the app.
- Every table has RLS enabled; every table the app queries traces back to a migration; no orphan/unprotected table exists.

---

## External research: how this compares to real platforms

Ran a second, independent deep-research pass specifically comparing vibe-dealer against real prepaid-airtime-distribution platforms, Dealer Management Systems, and security-standard bodies (OWASP ASVS, SOC 2). Being direct about the outcome: **this pass produced much thinner, more honestly-caveated results than the internal audit above.** Of 6 original research angles, 3 came back with zero claims that survived adversarial re-verification — Supabase-specific hardening patterns, authentication/session-security norms, and financial-endpoint rate-limiting all remain genuinely unanswered by web research (not "found to be fine," just **not addressed** — a real gap in what this pass could establish, separate from the actual product gaps above). And a large majority of the specific feature-parity claims that were attempted for prepaid-distribution/DMS platforms — multi-tier hierarchy depth, real-time commission engines, per-dealer credit limits, dealer-visible audit trails, fraud detection, dispute/chargeback workflows, KYC onboarding, RLS-equivalent data-layer authorization as a category norm — were all rejected on reverification. Vendor marketing pages claiming a feature turned out not to be strong enough evidence that it's an actual category baseline once checked adversarially; that's the research process working correctly, not a failure, but it means this angle mostly couldn't answer the question it was asked.

What did hold up:

- **Automated low-balance alerting** is a real, standard feature across independent prepaid-distribution platforms (confirmed 3-0, corroborated by an operator's own support docs, not just vendor marketing) — vibe-dealer already has a version of this (the "Running low" warning on `/purchases`, keyed off `LOW_BALANCE_THRESHOLD`), so this is a confirmed-adequate item, not a gap.
- **Production DMS platforms are built as one integrated database spanning the full business lifecycle**, not siloed bookkeeping tools (confirmed against PBS Systems, an automotive DMS — directionally relevant, not a like-for-like telecom match). vibe-dealer's own design (CRM + transactions + reconciliation + audit trail in one app) already matches this direction.
- **OWASP ASVS** is confirmed as a real, currently-maintained (v5.0, May 2025), self-administrable checklist standard — a legitimate thing to informally test this app against without needing an auditor. Worth treating as a reference framework for future hardening passes, not something requiring formal certification.
- **Formal SOC 2 is explicitly not expected for an operator at this stage** (confirmed 3-0, and corroborated by other compliance vendors — notably including one telling prospects *not* to buy their own more expensive product yet, which cuts against its own commercial incentive) — but the underlying controls are still the right target at a small-operator tier: **commodity-tool MFA** (not enterprise IAM), **role-based least-privilege access with periodic review**, **mandatory second-person review before deploying changes**, and **a written incident-response plan that's actually tabletop-tested**, not left theoretical. This directly validates the calibration this whole project has already been using — match real small-business practice, don't gold-plate to enterprise standards — rather than suggesting a change of direction.

The full external research trace (all sources, confirmed and refuted claims, open questions) is preserved in the workflow journal if a future pass wants to pick up where this one left off — the three unanswered areas (Supabase-specific hardening, auth/session norms, rate-limiting norms) are exactly the ones worth a second, more targeted attempt, ideally against better sources than this pass found (independent industry surveys or direct operator interviews rather than vendor marketing pages).

---

## Prioritized punch list

1. **Critical** — Close `dealers.rate` exposure to `cs` at the RLS layer (view-based fix, same pattern as `delivery_queue`).
2. **Critical** — Close the credit-balance race condition with an advisory-lock trigger; fix the unbounded-row-pull aggregation in the same pass; add the partial unique index for concurrent same-transaction adjustments.
3. **High** — Add login brute-force protection (Supabase CAPTCHA integration is the cheapest real fix).
4. **High** — Move sign-in to a server action so the session cookie can be `httpOnly` (paired with adding a baseline CSP — items 4 and 6 are worth doing together).
5. **Medium** — Fix `setNotificationsMasterEnabled` via a scoped RPC (same fix shape as an earlier session bug — don't broaden the `profiles` UPDATE policy).
6. **Medium** — Add a DB-layer guard against direct-editing a verified transaction, closing the gap in today's own adjustment feature.
7. **Medium** — Mirror the OCR route's size/MIME checks onto the receipt-upload path; add rate limiting to the OCR route.
8. **Medium** — Escape the dealer name in the daily-report email; add the missing role check to `dealer_last_verified_activity`; add validation/reuse-guard to `seed_dealer_rate_history`.
9. **Low** — Security headers, explicit `secure` cookie flags, consolidate the duplicated search-sanitizer regex, surface export truncation, genericize error messages in redirects.
10. **Not code** — Verify/raise the Supabase Dashboard password policy and enable leaked-password protection (still-open item from earlier this session); consider moving the Supabase org off a personal Gmail account.

Nothing here needs to be tackled all at once — items 1-2 are the ones worth prioritizing given they're live gaps in stated invariants (cs financial isolation, no-oversell), the rest is genuine hardening at a pace that fits a 3-person operation.
