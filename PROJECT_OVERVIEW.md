# Wealth Navigator — Project Overview

## What this is

A single-user personal finance and investment management app. Built for **Matt Fellows** (`matt@tangiblevalue.com`) to be the operating system for everything money-related: transactions, budgets, net worth, portfolio, investment research, options trades, and the strategy that ties them together.

Sister app: **Life OS** (separate repo at `mmfellows/life-os`) handles habits, planning, goals, and relationships. The two stay separate for now; integration is deferred until Wealth Navigator's features and goals are dialed in. When the time comes, the most likely first integration is shared Firebase auth + cross-linking from Life OS's side nav.

## How the app is organized

The app splits cleanly into two top-level sections, with a few cross-cutting dashboards on top.

```
Wealth Navigator
├── Personal Finance      — money in, money out, net worth, budgets
└── Investments           — research, entries, holdings, strategy, options
```

### Section: Personal Finance

The Mint/Monarch Money side of the app. Pulls transactions from spending accounts, lets me tag them, and turns the tagged stream into insights. Visuals matter — most of what I want to see should be a chart, a sparkline, or a category bar, not a wall of text.

**Core features:**

- **Account sync** — Plaid pulls transactions from checking, credit cards, and other spending accounts on a regular cron cadence so data stays fresh without manual refreshes.
- **Transaction review + tagging** — review the inbox of new transactions, assign categories from the personal taxonomy (see `Personal Finance Categories.csv`), bulk-tag, override Plaid's defaults.
- **Reporting dashboard** — visual insights: spending by category over time, month-over-month deltas, trend lines, comparison to prior periods. Charts first, tables second.
- **Budgeting** — set monthly budgets per category, track actual against budget, surface category overruns.
- **Tax planning** — placeholder for now. The intent (estimate liability, track deductions, surface tax-relevant transactions year over year) can be sharpened later; not a near-term build priority.
- **Carrots** — a list of things I want to buy at specific financial milestones (e.g. "new lens at $X net worth"). Acts as a motivational layer on top of the budgeting / savings flow.

### Section: Investments

The active management side. I research equities, identify entry points, and track each thesis. I want to know not just "how is my portfolio doing" but "why did I enter this position, was the thesis right, and am I on plan."

**Core features:**

- **Research** — AI research assistant (Anthropic Claude API via `backend/services/aiResearchService.js`) that answers with the user's live portfolio (snapshot, top holdings, active bet theses) as context; conversational follow-ups; queries persist to `research_queries`. Requires `ANTHROPIC_API_KEY` in `backend/.env`.
- **Ideas** — backlog of investments I'm watching for entry. Includes target price, conviction level, why it's interesting.
- **Bets** — when I actually take a position. Records entry date, entry price, position size, thesis, expected outcome, and ongoing performance vs. that thesis. The "trade journal" view of investing.
- **Trade Journal** — chronological log of trades (open + close) with notes on what happened.
- **Portfolio** — overall view of all holdings: which accounts, how much in each, asset allocation, performance over time. Same data, multiple lenses.
- **Account Snapshot** — point-in-time view of a specific account's positions and balance.
- **IPS (Investment Policy Statement)** — high-level strategy targets: total invested vs. cash, diversification mix (sectors, asset classes, geographies), rebalancing rules. The dashboard compares actuals against this plan so I can see drift.
- **Options trading** — covered calls and cash-secured puts. `Options.tsx` has a trade planner (live premium/breakeven/annualized-return math, coverage checks against actual shares held and free brokerage cash) and tracks trades planned → open → closed (expired / assigned / bought back) with realized premium P&L. Backend: `backend/routes/options.js`, Firestore collection `option_trades`.
- **Investing Settings** — broker connections (E*TRADE OAuth is already wired), investment-specific preferences.

### Cross-cutting (lives in Personal Finance)

- **Net worth dashboard** — sum of all accounts (assets minus liabilities) with trend over time. The "all accounts" view that ties the two sections together. This is what I'd open most often.

## Visual / UX principles

- **Charts over tables.** Default to visualization. Tables are an "expand for details" affordance, not the primary view.
- **Trend over snapshot.** Most numbers want to be paired with "vs. last period" or a sparkline showing direction.
- **Comparison views.** Plan vs. actual is everywhere — IPS targets vs. holdings, budget vs. spend, savings goal vs. progress, net-worth target vs. current.
- **One-pane glances.** Each section's main page should answer the most common question in under 2 seconds without scrolling.

## Data freshness

Plaid is the data source for spending accounts and account balances. Brokerage data comes from broker APIs (E*TRADE OAuth wired today; more brokers possible).

Data freshness is maintained via **scheduled cron jobs**:

- Daily transaction pull from Plaid for active accounts.
- Daily price refresh for tracked tickers.
- Weekly portfolio snapshot (for the trend-over-time view).
- Monthly account-balance snapshot (for the net-worth trend).

Cron jobs live in the backend (`backend/`) and are idempotent — running them twice the same day shouldn't double-count anything.

## Tech stack

Frontend (`src/`):
- React 18 + TypeScript + Vite
- React Router for navigation
- React Query (`@tanstack/react-query`) for data fetching and cache
- Tailwind CSS for styling
- Recharts for charts
- Lucide for icons
- `react-plaid-link` for Plaid embed
- `@simplewebauthn/browser` for passkey auth
- `@dnd-kit` for drag-and-drop in lists/categorization

Backend (`backend/`):
- Node + Express
- SQLite for primary storage (file at `backend/database.sqlite`)
- Firebase Admin for auth verification
- Plaid SDK
- E*TRADE OAuth (`oauth-1.0a`)
- JWT for session tokens
- Helmet + express-rate-limit for hardening

Hosting:
- Vercel for the frontend (`vercel.json` configured)
- **Backend deployment: TBD.** Vercel can't host the long-running Express server + SQLite as-is. Candidates when we decide: Fly.io, Railway, Render, or refactor into Vercel serverless functions (which would mean swapping SQLite for a hosted Postgres/Turso/Neon). Picking the host is a near-term decision since cron jobs need somewhere to run.

## Pages built so far

(For orientation; see `src/pages/` for the source.)

| Page | Section | Purpose |
|---|---|---|
| `Dashboard.tsx` | Cross-cutting | Top-level "open the app" landing view |
| `Accounts.tsx` | Personal Finance | All accounts, balances, link/unlink |
| `AccountSnapshot.tsx` | Either | Point-in-time account view |
| `Expenses.tsx` | Personal Finance | Transaction review + tagging |
| `Budgets.tsx` | Personal Finance | Budget setup + tracking |
| `Carrots.tsx` | Personal Finance | Aspirational purchases tied to milestones |
| `Reports.tsx` | Personal Finance | Visual reporting dashboard |
| `Portfolio.tsx` | Investments | All holdings overview |
| `Bets.tsx` | Investments | Active investment theses |
| `Options.tsx` | Investments | Covered call / CSP planner + tracker |
| `Holdings.tsx` | Investments | Flat/grouped positions table with % exposure |
| `TradeJournal.tsx` | Investments | Chronological trade log |
| `Ideas.tsx` | Investments | Watchlist / pre-trade ideas |
| `Research.tsx` | Investments | Per-ticker research notes |
| `IPS.tsx` | Investments | Investment Policy Statement |
| `PersonalFinanceSettings.tsx` | Settings | PF-specific preferences |
| `InvestingSettings.tsx` | Settings | Investing-specific preferences |
| `Settings.tsx` | Settings | Top-level settings |
| `Login.tsx` / `OAuthCallback.tsx` | Auth | WebAuthn + OAuth flow |
| `Privacy.tsx` / `Security.tsx` | Compliance | In-app privacy + security info |
| `TestPage.tsx` | Dev | Internal testing surface (`ApiTesting.tsx` removed 2026-07) |

Backend routes live in `backend/routes/`: auth, bets, budgets, carrots, etrade, expenses, ideas, internal, investments, ips, plaid, portfolio, research, settings, snapshot, stocks, trades.

## What's not built yet (from the intent)

- **Tax planning module** — no dedicated page yet beyond what's in Personal Finance settings.
- **IPS-vs-actuals diff visualization** — `IPS.tsx` exists (free-text); structured targets with a side-by-side comparison to actual portfolio isn't yet built. The Dashboard's Top Holdings concentration panel and the Holdings "% Inv" column cover per-ticker exposure, but sector-level analysis is still missing.
- **Options: multi-leg strategies** — v1 covers covered calls and cash-secured puts only (short premium); spreads/rolls would extend `option_trades`.

## Compliance posture

See `security/` for the full set of policies (access control, encryption, vulnerability management, retention, consent, privacy). The compliance bar is set so that the **Plaid Production Security Questionnaire** can be answered with real artifacts. Treat the `security/` docs as the source of truth for what the app actually does — update them in the same PR as architectural changes.

## Future: integration with Life OS

Deferred. When Wealth Navigator's features feel solid and the data model has stabilized, candidate integration points:

- **Shared Firebase Auth** so the same login works for both apps.
- **Cross-link in Life OS side nav** ("Wealth Navigator" entry that opens this app).
- **Goals reference financial targets** — e.g., a Life Goal in Life OS like "Achieve Financial Freedom" reads from a Wealth Navigator API for "% to net worth target."
- **Habits feed savings/investing data** — e.g., a daily habit "review portfolio" or a weekly habit "log spending" might push to or read from Wealth Navigator.

Until then, treat the two as independent products.
