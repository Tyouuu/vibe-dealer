# Corrections-to-Committed-Financial-Records: Research Findings

Researched 2026-07-18. How established financial/transaction-tracking systems (accounting standards, QuickBooks/Xero/Wave, POS systems, ERP tier, and dealer/channel-management platforms) handle corrections to already-recorded transactions, for comparison against this app's own pending→verified / pending→flagged model (no edit, no delete, ever).

**Note on how this was produced:** run via a multi-agent deep-research workflow (108 subagents: search, source-fetch, claim-extraction, and adversarial fact-checking where each claim needed independent verification to survive). The workflow's final auto-synthesis step failed and returned a placeholder instead of a real report, so this document was manually reconstructed from the raw verification journal by a follow-up agent. Confidence tags below reflect that verification, not just search-result plausibility.

**Tags used:**
- **[VERIFIED]** — adversarially checked, claim holds as stated
- **[VERIFIED — CORRECTED]** — adversarially checked, the broad claim overreached; the surviving narrow fact and the specific error are both stated
- **[SEARCH-TIER, not adversarially verified]** — a real source with a real URL, but not run through the adversarial-verification sub-phase — directionally reliable (mostly official vendor docs) but not independently fact-checked here

---

## 1. Standard double-entry accounting practice (GAAP / IFRS)

**[VERIFIED, high confidence — checked twice independently]** Under IFRS **IAS 8**, material prior-period errors must be corrected **retrospectively** — restating comparative amounts for the period(s) the error occurred in — not via a simple current-period adjusting entry, unless impracticable. The IASB deliberately removed the older option of dumping fundamental-error corrections into current-period P&L. Source: [IFRS Foundation, IAS 8](https://www.ifrs.org/issued-standards/list-of-standards/ias-8-accounting-policies-changes-in-accounting-estimates-and-errors/). Malaysia's MFRS is IFRS-converged, so this is arguably the most directly-applicable authoritative validation of the app's own "never silently overwrite" philosophy.

**[VERIFIED — CORRECTED, high confidence, caught independently 3 times]** Several claims reached for "reversing entries" as the textbook precedent for forward-only correction — this overreaches. Reversing entries are a narrow bookkeeping convenience for undoing period-start accrual estimates so a real transaction posts cleanly next period; AccountingTools states they are explicitly **"not for correcting errors."** The correct term for fixing a mistaken entry is a **"correcting entry"** — every source checked (AccountingCoach, Patriot Software, CliffsNotes) distinguishes it from reversing entries. Source: [AccountingTools](https://www.accountingtools.com/articles/what-is-a-reversing-entry.html). Worth flagging: the *instinct* (new entry, not edited-in-place) is right, the *label* several claims reached for was wrong.

**[VERIFIED, high confidence — checked 3 times]** Oracle Receivables corrects a posted invoice via a **credit memo** that automatically posts new, separately-dated offsetting reversal entries — the original invoice's ledger lines are never touched. Source: [Oracle Receivables Help](https://docs.oracle.com/cd/A60725_05/html/comnls/us/ar/cmessay.htm) (1998 doc; verifiers cross-checked current 2025-2026 Oracle Fusion Cloud docs and found near-identical language — mechanism still current despite the stale citation).

**[SEARCH-TIER]** AccountingCoach: seller books a new "Sales Returns and Allowances" entry, buyer books a mirrored new entry, neither touches the original invoice ([source](https://www.accountingcoach.com/blog/what-is-a-credit-memo)). Stripe: a credit memo is "how a business corrects the financial record of a sale without erasing the original transaction," booked through a separate contra account so gross revenue stays visible ([source](https://stripe.com/resources/more/credit-memos)).

---

## 2. Small-business accounting software (QuickBooks, Xero, Wave)

The clearest real-world contrast with this app's own design.

### QuickBooks Online
**[VERIFIED, high confidence]** QBO's model is genuinely **edit-in-place plus an audit log**, not append-only. A user *can* directly edit a transaction already inside a completed bank reconciliation — only a dismissable warning, never a hard block. Closed periods use just a "closing-date password" any admin can override. Transactions can be permanently deleted outright. Practitioner commentary criticizes the audit log as an unreliable forensic record for exactly this reason. Source: [Intuit QBO Audit Log](https://quickbooks.intuit.com/learn-support/en-us/help-article/audit-log/use-audit-log-quickbooks-online/L2WoVnW6I_US_en_US). The audit log does keep a genuine before/after diff per version — richer than a status-flag-plus-reason-string ([source](https://quickbooks.intuit.com/learn-support/en-us/help-article/audit-log/view-transaction-changes-audit-history/L7obVhic2_US_en_US)).

**[VERIFIED — CORRECTED, high confidence, caught 3 times]** "QBO labels a direct edit to a reconciled transaction as an 'indirect edit'" is a misread — "indirect edit" means a transaction changed as a *side effect* of a different action elsewhere, not a deliberate direct edit. Also: reconciliation itself isn't what locks a transaction — "Close the books" is a separate, independently-configured feature.

**[VERIFIED — CORRECTED, high/medium confidence, caught 3 times]** "QBO has no built-in undo/restore, period" overreaches — **QuickBooks Online Advanced** (paid tier) has native whole-company point-in-time backup/restore. The narrower point survives: it's a whole-company rollback, not a surgical single-transaction undo, and it's paywalled — on a standard plan, manual re-entry from the audit log is the only path. Source: [Intuit](https://quickbooks.intuit.com/learn-support/en-us/help-article/back-data/back-restore-quickbooks-online-advanced-company/L9sTCQn9P_US_en_US).

**[SEARCH-TIER]** Audit-log entries expire after 2 years; the log is account-wide (not just financial transactions), can't be disabled, is admin-gated.

### Wave
**[VERIFIED, high confidence — corroborated ~7 independent passes]** Wave allows **direct in-place editing of a transaction's core financial fields, including total Amount**, with no reversing entry, approval step, or separate correction record. Editing inside a reconciled period triggers only a dismissable warning; the period just flips to "unreconciled." A 2020 Wave community feature request ("lock all transactions before a given date," still unresolved) confirms Wave has **no hard period lock of any kind**. Source: [Wave Help Center](https://support.waveapps.com/hc/en-us/articles/41357148807700-Edit-a-transaction). One genuine hard exception: transactions Wave itself auto-generates (Stripe payments, payroll) can't be edited — immutability keyed to *provenance*, not time or status.

**[SEARCH-TIER]** Wave has no true field-level audit trail/version history per third-party comparison (Capterra) — only source/creation/last-modified metadata, weaker than QuickBooks.

### Xero
**[SEARCH-TIER]** **Lock dates**: once set, ordinary users can't add/edit/approve any transaction dated on or before it; only the Adviser role can move/remove the lock. Source: [Xero Central](https://central.xero.com/s/article/Set-up-and-work-with-lock-dates). The hardest lock of the three mainstream tools — closer to this app's own philosophy than QuickBooks or Wave — not independently fact-checked in this run.

---

## 3. POS/retail systems (Square, Shopify POS, Toast)

Most heavily verified category (Toast alone drew ~25 verification passes) — and the source of the most useful "even real production systems don't do a clean binary" nuance.

### Toast
**[VERIFIED, high confidence — confirmed ~8 times]** **Void** = same-business-day, pre-settlement (before ~9:30pm ET daily batch close) — cancels entirely, no fees. **Refund** = required once settled (same-day batch already closed, or a prior-day charge). Sources: [Void vs. Refund](https://support.toasttab.com/en/article/Understand-when-to-void-vs-refund), [Voiding Items, Payments, and Checks](https://support.toasttab.com/en/article/Voiding-Items-Payments-and-Checks). Maps almost exactly onto this app's pending→verified vs. pending→flagged split.

**[VERIFIED, high confidence]** Voided records are never deleted — permanently visible in dedicated Toast Web reports. **[VERIFIED — CORRECTED]** But there are really only **two** report destinations (Voided Payments, Voided Orders), not three — "Voided Items" is a tab inside Voided Orders, not its own report (the closest-to-fabrication finding in this whole run).

**[VERIFIED — CORRECTED, high confidence, caught 5 times]** "Toast's void/refund split is purely timing-based, no edit-vs-delete distinction underneath" — refuted on two counts: (a) *payment type* independently overrides timing (house accounts/gift cards must always be voided, never refunded, regardless of age); (b) Toast's own stated rationale for the cutoff *is* an edit/delete distinction — pre-settlement a charge can be cancelled outright, post-settlement the record is immutable and only a forward reversing transaction is allowed.

**[VERIFIED — CORRECTED, high/medium confidence, found 3 times — one of the most useful findings in this report]** "No edit option exists post-capture" is false. Toast has a **"Tip Adjustment"** action letting staff directly edit (increase) the tip on an already-captured, closed check up to **14 days** later, capped at $250, plus a separate pre-capture "Adjust Credit Card Payment" action. **Even a real production POS has a bounded, capped, time-windowed direct amount-edit path for one narrow field on already-settled transactions** — a concrete "time-windowed edit lock" instance, not a pure void/refund binary.

**[VERIFIED — CORRECTED, high confidence, refuted 3 times]** Toast's "void reversal" (undo an accidental void — self-service within 24h, Customer Care only after) was mislabeled "maker-checker-like." It isn't — one employee acts alone within the window; Customer Care alone acts after. Time-gated escalation to vendor support, not dual-party authorization.

**[VERIFIED — CORRECTED, high confidence, refuted 3 times]** "Void/refund are mutually exclusive on the same check, breaking reporting integrity" is overstated — Toast's actual language is a hedged "can cause problems"; its docs describe a supported workflow where non-voided items are refunded while voided items are handled separately on the same check.

### Square
**[VERIFIED, high confidence — checked against the live API object model, not just help-center prose]** Square splits corrections into **"linked refunds"** (tied to an original Square payment) vs. **"unlinked refunds"** (no connection to any prior Square payment). Both are always newly-created Refund objects with their own ID/status/timestamp; neither mutates the original Payment. Every refund captures reason, amount, date/time, and cashier identity. Sources: [Square Help](https://squareup.com/help/us/en/article/6350-process-a-return-or-exchange-with-square-for-retail), [Refunds API](https://developer.squareup.com/docs/refunds-api/unlinked-refunds). Square treats unlinked refunds as a heightened fraud risk the *merchant* must control.

**[SEARCH-TIER]** Exchanges don't flow through to Square's own Transfer Summary or connected accounting software — a reconciliation gap between POS-level correction and the books.

### Shopify POS
**[SEARCH-TIER — source is a 2023 community thread, possibly stale]** No void/cancel once a card transaction has processed; official guidance for a wrong-amount sale is refund-and-re-enter. Shopify was piloting a limited 15-minute post-authorization cancellation window (pre-settlement) — another real-world time-windowed edit lock. Source: [Shopify Community](https://community.shopify.com/c/shopify-discussions/how-do-i-void-a-credit-card-transaction-and-sale-in-shopify-pos/td-p/2158435).

---

## 4. ERP-tier systems (SAP, NetSuite/Oracle)

The richest "sounds authoritative but overreaches" corrections in the whole run.

### NetSuite
**[VERIFIED, high confidence — checked via direct HTML fetch]** Once a posting period is closed, no one can make GL-impacting changes to *posting* transactions in it — applies to edits and deletes alike. Non-posting transactions (sales orders, POs, estimates) stay freely editable regardless; even on posting transactions, non-GL fields (memos) stay editable when closed. The lock is scoped to G/L impact, not a blanket freeze. Sources: [Transaction Edits in Closed Periods](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_4334084139.html), [Reopening a Closed Period](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_N1457543.html).

**[VERIFIED — CORRECTED, high confidence, caught 3 times]** "Reopen the period and post a book-specific adjustment journal entry" is not NetSuite's *general* correction path — it's scoped to an optional, paid, professional-services-installed add-on (Multi-Book Accounting, OneWorld only), for companies keeping parallel books (GAAP vs. tax vs. IFRS). Standard single-book NetSuite blocks closed-period GL edits too, via a simpler mechanism.

**[VERIFIED — CORRECTED, high confidence — arguably the single most important ERP finding for this app's own design question]** "The sanctioned fix for a closed-period transaction is reopen-and-post-new-entry, never edit the original" is contradicted by NetSuite's own docs. Reopening is described as a costly last resort with a cascading side effect (reopening period N reopens *every later closed period too*) — and once reopened, **standard NetSuite allows direct in-place edits to the original posting transaction.** That's correction-by-mutation, the opposite of forward-only. The more commonly *recommended* pattern is actually a plain reversing journal entry in the currently-open period (genuinely forward-moving, no reopening needed) — simpler than what several claims described. **Even at true ERP scale, "unlock and directly edit the historical record" is a real, sanctioned (if discouraged) option — something this app has deliberately foreclosed entirely.**

**[VERIFIED — CORRECTED, high confidence, refuted 3 times, all in agreement]** NetSuite's "Manage Accounting Periods" permission gate was mislabeled "maker-checker/four-eyes-like." It's ordinary single-actor role-based access control — one person holding the permission reopens unilaterally. Audit sources flag this exact permission as a **segregation-of-duties risk** (the Controller/CFO often holds both period-reopen and journal-approval rights). True maker-checker requires separately configuring SuiteFlow/SuiteApprovals.

### SAP S/4HANA
**[VERIFIED, medium-high confidence]** A reversing FI document (FB08) normally needs the original document's period open; if closed, the user can override the posting date into a currently-open period instead. Source: [SAP Help](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/651d8af3ea974ad1a4d74449122c620e/99a6f42c861d4f85b047cce702a8d7cd.html). **[CORRECTED]**: gated by a config flag on the specific reversal-reason code; if off, the system just refuses. Practitioners more commonly temporarily reopen the period (OB52), post on the original date, then re-close. Cleared items must have clearing reset before reversal; a reversal reason code is always mandatory.

**[VERIFIED — CORRECTED, medium confidence]** SAP does have two named mechanisms preserving the original document — "standard reversal" (posts the inverse) and "negative posting" (resets figures to pre-error state) — but the specific claimed mechanics of negative posting ("posts the debit as a credit") don't hold against SAP's config docs, which indicate it does *not* flip debit/credit. Sourcing weakness noted honestly: SAP Help Portal resisted every direct-fetch attempt (JS-rendered SPA).

---

## 5. Dealer Management Systems (Tekion, CDK, Reynolds & Reynolds, DealerSocket, PBS, Dominion)

No DMS vendor publishes internal transaction-correction logic publicly — nothing here was adversarially verified, all search-tier only.

**[SEARCH-TIER]** Dealer-industry commission corrections use a named pattern: **"chargeback"** — when a deal is cancelled, an F&I product is cancelled, a cooling-off return happens, an OEM incentive is later rejected, or a booking error is found, the commission already paid is clawed back as a **forward-moving deduction against a future paycheck** — explicitly including cases where the pay period already closed and the employee was already paid. Some pay plans pool chargebacks across multiple future periods. Source: [Nimble Compensation](https://www.nimblecompensation.com/resources/what-is-a-chargeback) (commission-automation vendor for CDK/Reynolds/Tekion-class DMS platforms, 2025).

**[SEARCH-TIER]** A trade piece calls "unwinding a deal" (voiding an already-completed, already-commissioned sale) "an accounting nightmare" even at mature dealerships — commissions charged back even after month-close and payout, requiring physical DMV paperwork retrieval, bank payoff refund, title return if a trade-in was involved. Reversal authority informally restricted to GM/owner. Source: [F&I and Showroom](https://www.fi-magazine.com/blogposts/unwinding-a-deal) (2012, dated).

Read together: even mature dealer operations don't have a clean edit mechanism for this problem — they live with the same forward-only chargeback friction this app already has. That's a reassuring signal even unverified: the closest real industry analog suggests this app's existing flag-forward model isn't a naive simplification, it's already aligned with how the DMS-adjacent industry actually copes.

---

## 6. General named patterns

**[SEARCH-TIER]** **Compensating transaction / append-only ledger** (engineering framing): Formance (open-source ledger infra) recommends revoking UPDATE/DELETE privileges on the postings table entirely, so corrections can *only* happen via a new "compensating posting" — enforced at the DB-privilege level — plus hash-chaining each posting and deriving balances by replaying the log. Source: [Formance](https://www.formance.com/blog/engineering/double-entry-accounting-for-engineers-building-financial-products). Independently corroborated by [AxonOps "Ledger Pattern"](https://axonops.com/docs/data-platforms/cassandra/application-development/patterns/ledger/), which also flags the tradeoff of denormalized balances needing consistency maintenance.

**[SEARCH-TIER]** Purpose-built ledger databases (e.g. Amazon QLDB) are argued to be a genuinely stronger tier than "just don't run UPDATE/DELETE in Postgres" — an ordinary app avoiding those statements can't *prove* immutability the way a cryptographically hash-chained ledger database can. Source: [Architecture Weekly](https://www.architecture-weekly.com/p/building-your-own-ledger-database).

**Maker-checker / four-eyes** — defined ([Wikipedia](https://en.wikipedia.org/wiki/Maker-checker): "at least two individuals necessary... one creates, the other confirms"), but its applicability to post-commit correction specifically was never established anywhere in this research. Every verification pass that checked whether some real system's permission-gated action actually *was* maker-checker came back refuted — NetSuite's period-reopen permission (×3) and Toast's void-reversal escalation (×2), six independent high-confidence checks, all in agreement. **What real systems label as elevated permissions for sensitive actions is almost always single-actor role-based access control, not genuine two-person dual authorization.** Not found implemented in any specific vendor system checked here — treat it as a banking-pattern-by-reputation, not something these vendors apply to their own period-lock or void-reversal flows.

**Time-windowed edit lock** — the pattern with the most real, cross-vendor corroboration, but every vendor picked a different window: Toast void (same business day/pre-batch-close), Toast void-reversal (24h), Toast Tip Adjustment (14 days), Shopify pilot cancellation (15 min, search-tier), Toast refund eligibility (90 days, search-tier) — versus Wave/QBO's *no* window by default, and Xero's indefinite lock-date. Real and well-established, but a spectrum (minutes to indefinite), not a single recipe.

**[SEARCH-TIER]** **Bi-temporality** — separately recording when an event happened vs. when it was entered into the system — named by Formance as adjacent to, but distinct from, a time-windowed edit lock.

---

## Comparison table

| Approach | Problem it solves vs. pure void-only flag | New risk/complexity it adds | Typical user |
|---|---|---|---|
| **Reversing/correcting journal entry** (new forward-dated entry) | Corrects an *amount* without voiding and re-entering the whole record | Needs a data model linking the correction to what it corrects; risk of correction-chains if undisciplined | Universal — GAAP/IFRS baseline, solo bookkeeper through SAP |
| **Credit memo / contra entry** (linked new record) | Same, plus a counterparty-facing document and gross-vs-net visibility | Second record type + required link field; allocation logic if partial | Small biz through enterprise, especially with external counterparties |
| **Time-windowed edit lock** (direct edit allowed only within N minutes/hours/days of entry) | Removes friction for the overwhelmingly common case (a typo caught seconds later) without weakening the permanent record for anything older | The cutoff becomes a dispute surface; every vendor picked a different value; still need a fallback once the window closes | Universal in POS (Toast, Square, Shopify); rarer in accounting SaaS |
| **Period lock with role-gated reopen + reversal** | Formal monthly-close protection; reopening possible but deliberately expensive/logged | NetSuite's own case shows reopening can silently become "directly edit the original" unless deliberately designed otherwise; cascading reopen risk | Mid-market to enterprise (NetSuite, SAP); heavy machinery for a single-entity shop |
| **Maker-checker / dual approval** | A genuine second person catches fraud/error a single-actor permission gate cannot | Needs a second qualified staff member always available; adds latency to every action | Banking by reputation — **not actually found implemented for correction workflows in any specific commercial system checked here** |
| **Append-only ledger w/ DB-level UPDATE/DELETE revocation + hash-chaining** | Makes "no silent edit" a database-enforced guarantee, not just an absent UI button | Real engineering lift: replay-computed balances, hash-chain verification tooling, migration discipline | Fintech infrastructure vendors, purpose-built ledger DBs |
| **Soft warning only, no real lock** (Wave; QBO outside its paid "Close the books" toggle) | Nothing — this is the baseline to avoid | Silent loss of the "permanent record" guarantee; the audit log becomes the only defense | Very small / solo-bookkeeper software — this app is already stricter than this |
| **Chargeback against future settlement** | Corrects commission/incentive payouts after the fact without touching the original paid record | Needs a future settlement to attach the deduction to; doesn't map to a same-transaction correction | Auto-dealership F&I / commission specifically |

---

## Recommendation

The current design can **void** (flag) but cannot **correct an amount** — there's no way to say "this was RM50, should have been RM45" without voiding the whole transaction and creating an unlinked new one. That single gap is the #1 problem nearly every real system surveyed above (Oracle credit memos, SAP reversal documents, Formance compensating postings, dealer chargebacks) exists to solve. Given a single master dealer, ~3 staff roles, and low transaction volume:

**Worth adopting:**
1. **A narrow compensating/correcting-entry type** — a new transaction subtype that references (FK) the original transaction it corrects, carries its own amount/points delta, and requires the same who/reason metadata already captured for flags. Low-cost (one nullable FK + one new subtype), matches the GAAP/IFRS baseline and every serious vendor's actual practice, purely additive — doesn't touch the existing no-edit-no-delete guarantee at all. Highest value, lowest cost of anything in this research.
2. **A short, bounded self-edit window for the entering user only** (modeled on Toast's pre-capture void / Shopify's 15-minute pilot) — let the creator fix amount/points within a few minutes of entry, before the row has been seen or acted on by anyone else, fully logged even if self-directed. Targets the overwhelmingly common real failure mode (a typo caught seconds later) without weakening the permanent-record guarantee for anything that's had time to matter.
3. **A lighter maker-checker: gate the pending→verified transition, not corrections.** Real vendors do *not* actually implement dual-approval on post-commit corrections — building that would mean out-engineering QuickBooks, Wave, NetSuite, and Toast for a 3-person shop. If a second pair of eyes matters anywhere, the highest-value place is a one-time check that the person verifying a transaction isn't the same person who entered it.

**Overkill for this app:**
- **NetSuite/SAP-style period-close-and-reopen governance** — requires a dedicated permission tier and mandatory justification workflow, and per the ERP findings above, NetSuite's own reopen mechanism doesn't even guarantee forward-only correction by default. The app's existing pending→verified lock already achieves the outcome more simply and more strictly (it never allows reopening at all).
- **True dual-person maker-checker on corrections, and DB-level append-only enforcement** (hash-chaining, revoked UPDATE/DELETE grants, replay-computed balances) — both real and credible, but the first isn't even what benchmark systems actually do, and the second solves a threat model (a rogue insider with direct DB access) disproportionate to a single master-dealer's own Supabase project. Worth revisiting only if the app scales to multiple independent dealer organizations sharing infrastructure, or a regulator specifically demands tamper-evidence.
