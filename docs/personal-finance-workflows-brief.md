# Personal Finance Workflows — Feature Brief

**Date:** 2026-08-26
**Goal:** Turn the personal-finance side of Wealth Navigator from a passive ledger into a guided operating rhythm: every transaction categorized with minimal manual effort, spending visible against plan at three cadences, and an AI chat that can reason over the whole financial picture (personal finance + investing).

## The cadence model

| Cadence | Mode | Device | Purpose |
|---|---|---|---|
| **Weekly** | Glance (2 min) | **Mobile** | Pacing: how am I tracking against this month's budget, quarter-of-month by quarter-of-month? Any new costs on the radar? Quick-tag anything obvious. |
| **Monthly** | Close (20 min) | Desktop | "Close the books": sync, AI-categorize everything, answer the AI's questions about ambiguous transactions, review the month, formally close it. |
| **Quarterly** | Plan (1–2 hrs) | Desktop | Deep-dive every category: what am I actually spending, where do I cut or grow, set next quarter's discretionary plan. |

The high-level questions the app must answer at all times: **what is my burn, what is my regular income, and am I spending more than I make?**

## What exists today (grounding)

- Plaid sync (`backend/services/plaidService.js`) every 6h via Vercel cron → `expenses` in Firestore. Rule-based auto-categorization (`backend/services/categoryMapper.js`) with precedence Income → Taxes → CC-payment → transfer → Plaid-category mapping; unmapped rows stay uncategorized. Manual categorization always wins.
- Review surface: `src/pages/Expenses.tsx` (inline + bulk categorize, `uncategorizedOnly` toggle, weekly spending chart). No review queue, no confirm step, no "needs review" flag.
- Budgets are **line items** (`budget_items`: name, category, monthly/annual amount, `monthlyExpectedSpend`) — not category envelopes. Category totals are aggregated client-side in `Budgets.tsx`.
- "Month closed" exists only as a `localStorage` set in `Reports.tsx` (Annual Spend Pacing).
- Claude integration exists for investing research: `backend/services/aiResearchService.js` + `backend/routes/research.js` + `src/pages/Research.tsx`. Non-streaming, no tool use, model env-driven (`ANTHROPIC_MODEL` default `claude-opus-4-8`), context = portfolio snapshot + bets.
- Taxes are already split out of burn in `/api/expenses/stats/summary`.
- **No recurring-cost or new-merchant detection anywhere.** Income detection is sign-based only.
- **Mobile: effectively none.** `Layout.tsx` has zero responsive classes; no manifest/service worker (PWA icons exist in `public/`).

---

## Features

### F1. AI categorization engine + review queue (the foundation)

**Goal:** After every sync, every transaction ends up either confidently categorized or sitting in a small "needs review" queue with a specific question attached. The user should almost never free-form categorize; they answer questions.

**Categorization precedence (highest wins):**
1. **Manual** — user set it; never overwrite.
2. **Merchant rule** — learned mapping from past answers (new `merchant_rules` collection: normalized merchant key → category/subcategory). Created automatically whenever the user answers a review question or manually categorizes; consulted at sync time so the same merchant is never asked twice.
3. **Plaid rule** — existing `categoryMapper.js` special buckets (Income/Taxes/CC-payment/transfer) and detailed/primary mappings.
4. **AI** — new `backend/services/aiCategorizationService.js`.

**AI pass (batch, on demand + post-sync):**
- Input: all uncategorized transactions, the live taxonomy from `budget_categories`, and recent examples of how this user categorized similar merchants.
- One structured-output call (Anthropic SDK, `output_config.format` / `client.messages.parse()`, model `claude-opus-5`, env-overridable like the research service). Per transaction returns `{category, subcategory, confidence, question?, suggestions[]}` where `suggestions` are 2–3 candidate categories.
- `confidence >= 0.8` → apply, stamp `categorization_source: 'ai'`, `ai_confidence`.
- Below threshold → leave uncategorized, set `needs_review: true`, store `ai_question` (e.g. "AplPay TST BRDWY 447 — is this restaurants, or something else?") and `ai_suggestions`.

**Data model additions on `expenses`:** `categorization_source` (`manual` | `merchant_rule` | `plaid_rule` | `ai`), `ai_confidence`, `needs_review`, `ai_question`, `ai_suggestions`. (The orphaned `auto_categorized` flag from the d0b7c7f backfill is superseded by `categorization_source`.)

**Review queue API:** `GET /api/expenses/review-queue` (needs_review or uncategorized), `POST /api/expenses/:id/resolve-review` (answer → set category, create/update merchant rule, clear flags), plus `POST /api/expenses/categorize` to trigger an AI pass.

**Review UI:** one card per transaction — date, merchant, amount, account, the AI's question, suggestion buttons (tap to accept), type-ahead fallback for anything else, "it's a transfer" and "skip" actions. Used inside the monthly close (F2) and reachable standalone; must work on mobile for opportunistic weekly tagging.

### F2. Monthly close workflow

**Goal:** A guided wizard, like closing the month in a business. Finishing it means: every transaction categorized, anomalies acknowledged, month formally closed server-side.

**Route `/close` — steps:**
1. **Sync** — trigger `sync-transactions` per item, show data freshness per institution.
2. **Auto-categorize** — run the AI pass; show "142 auto-categorized, 9 need your input."
3. **Answer questions** — the F1 review queue, filtered to the month being closed. Cannot proceed to close with unresolved rows (skip = explicit "leave uncategorized" acknowledgment).
4. **Anomalies** — new merchants (F5), unusually large transactions vs category history, suspected duplicates.
5. **Summary & close** — income vs spend, burn ex-taxes, category vs budget envelope table, delta vs trailing 3-month average → **Close month** button.

**Backend:** new `month_closes` collection `{month: '2026-08', closed_at, stats: {...frozen summary}}` with `GET/POST /api/month-closes`. `Reports.tsx` Annual Spend Pacing switches from `localStorage` to this (one-time: UI offers to import the localStorage set).

### F3. Weekly pacing check (mobile-first)

**Goal:** A 2-minute glance on the phone: am I pacing to plan this month?

**Route `/pacing`:**
- **Month progress header:** day-of-month progress bar split into 4 week-quarters, with total spend-to-date vs pro-rated monthly budget.
- **Per-category pacing bars:** MTD actual vs monthly envelope (see cross-cutting: envelopes are derived by summing active `budget_items.monthlyExpectedSpend` per category). Color state: under / on pace / hot (>time-elapsed share, the "90% of restaurants budget in week 1" case) / blown. Tap a category → its transactions.
- **Radar strip:** new costs since last check (F5), review-queue count with one-tap jump to quick-tagging.
- Discretionary categories sorted first — that's where week-to-week action is possible.

**Mobile scope (explicit):** make `Layout.tsx` responsive (hamburger/drawer below `md:`), build `/pacing` and the review-queue cards mobile-first, add a PWA manifest (icons already exist) so it pins to the home screen. Desktop-only pages (Budgets, Settings, Reports) are *not* retrofitted in this effort.

### F4. Burn vs. income overview

**Goal:** The always-visible top-level answer: burn, income, net.

- A summary strip on `/reports` (and reused on `/pacing`): trailing 3/6/12-month average monthly burn (ex-taxes, ex-transfers — the split already exists in `stats/summary`), average monthly income, net monthly surplus/deficit, and savings rate. Taxes shown as its own line, consistent with the existing convention.
- Backend: extend `/api/expenses/stats/summary` with trailing-window aggregates (avoid another full-collection scan client-side).

### F5. New-cost radar (+ recurring detection)

**Goal:** When a new cost appears, it lands on the radar instead of hiding in a category.

- **Sync-time flag:** normalize merchant name (strip store numbers, payment-processor prefixes); if the merchant hasn't appeared in the prior 6 months, stamp `is_new_merchant: true`.
- **Recurring detection (phase 2 of this feature):** identify merchants with regular cadence and stable amounts → a recurring-costs list (subscriptions, bills). A *new recurring* cost is the highest-priority alert. Consider Plaid `/transactions/recurring/get` as an alternative to home-grown cadence detection — decide at implementation time based on what the current Plaid products/consent allow.
- **Surfacing:** radar strip on `/pacing`, anomalies step in `/close`, and a dismissible "acknowledged" state so items leave the radar once seen.

### F6. Quarterly deep-dive & spending plan

**Goal:** Once a quarter, walk every category, decide grow/hold/cut, and produce next quarter's plan.

**Route `/quarterly` — per main category, then subcategory:**
- Quarter spend vs prior 3 quarters (trend), top merchants, matching `budget_items` with expected-vs-actual variance.
- A decision prompt per category: **keep / cut / grow** with a target amount and a free-text note. Decisions write through to `budget_items` (adjust amounts, archive dead items, add missing ones) so the weekly pacing view (F3) immediately reflects the new plan.
- Output: a next-quarter plan summary, persisted in a new `quarter_reviews` collection `{quarter, decisions[], notes, completed_at}`.

### F7. Personal-finance AI chat

**Goal:** Chat with Claude about the whole financial picture — cost-cutting, tax implications, "can I afford X" — with live access to both personal-finance and investing data.

**Approach:** reuse the research seam (`aiResearchService.js` / `research.js` / `Research.tsx` are the template), but this is a new domain, not a system-prompt swap:
- New route `POST /api/finance-chat/query` + history endpoint; persist turns like `research_queries` (either same collection with a `domain` field or a sibling collection).
- **Static context** injected per conversation: `computeSnapshot()` (net worth, cash, liabilities, allocation), trailing 12-month spend by category, budget envelopes, income summary, recurring costs (F5), active bets summary.
- **Tool use** via the SDK Tool Runner (`client.beta.messages.toolRunner` + `betaZodTool`) so the model can drill in rather than receive everything up front: `query_transactions(filters)`, `get_category_stats(period)`, `get_budgets()`, `get_snapshot()`, `get_bets()`, `get_recurring_costs()`. Tools call the same service functions the REST routes use, scoped to the authed user.
- Model `claude-opus-5` (bump the shared default from `claude-opus-4-8`; keep `ANTHROPIC_MODEL` override). Adaptive thinking as today. **Streaming** (SSE) — tool-use turns plus long answers will not reliably fit the current non-streaming call inside Vercel's window; raise `maxDuration` for this function toward 300s. Streaming works on Vercel's Node runtime with no special config.
- UI: new chat page patterned on `Research.tsx` but using `authedFetch`/the shared `api` instance (Research's bare-axios auth pattern is a known wart — don't copy it), rendering streamed tokens, mobile-friendly.
- System prompt: personal-finance analyst framing, the same not-a-licensed-advisor and training-cutoff caveats as the research prompt, and awareness that tax questions get directional guidance, not filings.

---

## Cross-cutting decisions

- **Category envelopes are derived, not new state:** monthly budget per category = Σ active `budget_items.monthlyExpectedSpend` for that category, computed in one shared backend util used by F2/F3/F4/F6. No parallel budget system.
- **Merchant normalization** is one shared util (used by dedup context, merchant rules, new-cost radar).
- **Fold-in fixes while touching these files:**
  - Category routes in `backend/routes/settings.js` (lines ~230–494) have **no auth middleware** — add `optionalAuth`.
  - New pages use `authedFetch`; don't propagate the bare-axios pattern.
- **Known caveat, explicitly deferred:** `expenses`/`budget_items`/`carrots` docs are not user-scoped (single-user app in practice). New collections (`merchant_rules`, `month_closes`, `quarter_reviews`) should carry `user_id` from day one; backfilling old collections is out of scope.
- **Firestore indexes:** new queries (needs_review, is_new_merchant, month_closes by month) need entries in `firestore.indexes.json`.
- **Defaults chosen** (revisit only if they feel wrong in use): AI confidence threshold 0.8; new-merchant lookback 6 months; weekly page is the personal-finance nav home on mobile.

## Phasing (loop checklist)

Each phase is independently shippable and verified with `npm run build` + a reasoned self-review before checking it off.

- [x] **P1 — Foundations:** *(done 2026-08-26 — merchant rules apply to the plain-spending path at sync, special buckets stay structural; `is_new_merchant` sync-time flagging deferred to P6 as phased)* expense fields (`categorization_source`, `needs_review`, `ai_confidence`, `ai_question`, `ai_suggestions`, `is_new_merchant`), `merchant_rules` collection + merchant-normalization util, category-envelope util, `month_closes` API, auth fix on category routes, Firestore indexes.
- [x] **P2 — AI categorization + review queue:** *(done 2026-08-26 — structured-output batch pass on claude-opus-5, post-sync hook in syncUser, `/review` page with tap-to-accept cards; skip sets `review_acknowledged` so items leave the queue and the AI pass for good)* `aiCategorizationService.js`, post-sync hook + on-demand endpoint, review-queue API, review-card UI (mobile-friendly).
- [x] **P3 — Monthly close wizard** (`/close`, five steps, server-side month close, Reports pacing switched off localStorage). *(done 2026-08-26 — anomalies computed on the fly at `/api/expenses/anomalies`; Reports offers one-time import of the legacy localStorage set and locks the in-progress month)*
- [x] **P4 — Mobile + weekly pacing:** *(done 2026-08-26 — hamburger drawer below md, `/pacing` with week-quarter progress + under/on/hot/blown category bars + tap-to-expand transactions, PWA manifest with start_url /pacing, BurnStrip with 3/6/12-mo windows on /reports and /pacing, `/api/expenses/stats/trailing` over complete months only)* responsive `Layout.tsx`, `/pacing` page, PWA manifest, burn-vs-income strip (F4) on `/reports` + `/pacing`, trailing aggregates in stats endpoint.
- [x] **P5 — Finance chat** (route + tool-runner service + streaming + chat UI). *(done 2026-08-26 — SSE streaming via toolRunner with 5 JSON-schema tools, `finance_chats` sibling collection + index, `/chat` page shows live tool activity; `get_recurring_costs` tool lands with P6; research default model bumped to claude-opus-5; maxDuration 300)*
- [x] **P6 — New-cost radar:** sync-time flagging, radar UI on `/pacing` + `/close`, acknowledged state; then recurring detection (own or Plaid recurring endpoint). *(done 2026-08-26 — chose own detection (≥3 distinct months in 6, MAD/median ≤ 0.25, no extra Plaid consent); new recurring = red alert on /pacing; dismissible new-merchant list; `get_recurring_costs` chat tool added)*
- [x] **P7 — Quarterly review** (`/quarterly` walkthrough, decisions write to `budget_items`, `quarter_reviews` persistence). *(done 2026-08-26 — 4-quarter trend + top merchants + subcategory drill-down per category; cut/grow targets rescale the category's active budget items proportionally with priceHistory entries; reviews revisable per quarter; variance shown at category level, line-item detail stays on /budgets)*

**All phases complete (2026-08-26).**

## Out of scope

Notifications/email digests, retrofitting all desktop pages for mobile, user-scoping historical personal-finance data, automatic carrot-milestone evaluation, multi-user support.
