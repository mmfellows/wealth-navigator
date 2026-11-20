# Parked — 2026-11-20 12:27 on main

## Last session, in short
- Reworked the personal-finance side end to end: the Dashboard opens on the current month (pace, categories, clean-up, planned costs, last 20 transactions with inline recategorizing); Expenses shows spending only, defaults to This Year, and has a chart that follows the filters with a weekly/monthly/quarterly/yearly toggle.
- Added three new layers: **Trips** (`/trips`, date ranges on top of categories, own "Trips & Travel" budget bucket), **Year Plan** (`/year-plan`, budget lines per plan year, planned income, frozen copy, charts, "what this plan may be missing" checklist, Budget lines tab), and **planned costs** (one-off expenses pinned to a month).
- Added budget-vs-actual recommendations and a hover "…" row menu / "+" on headers to the Budgets table.
- Added emailed reports through Gmail (check-in on the 8th and 22nd, monthly on the 2nd, quarterly, annual) with preview / send-now / last-sent status in Personal Finance Settings.
- Added "Ask", a Claude side panel on every page (web search + the user's data; can create a trip or special expense only when asked).
- Data work in production Firestore: removed 141 duplicate Chase-PDF rows, created 11 trips for 2025–26, recategorized Wix, reset start dates on 2027 draft lines. Backups are in `backend/backups/` (gitignored).

## Where things stand
- Deployed: `f3bb792` on Vercel production (auto-deploy from `main`) — verified by build status Ready, new endpoints answering 401 (auth required) on the live site, and local screenshots against real data for Year Plan, Budgets tab, Expenses and the Ask panel.
- Uncommitted: nothing.
- Blocked on: nothing.

## Open issues & ideas (carried forward)
- **Ask panel is untested end to end.** No Anthropic API key exists locally, so the model call (Claude Opus 5.5, web search, fallback option) has only run in production if the user tried it. If it errors, read `vercel logs` for `/api/assistant/query`; the likely suspects are the `fallbacks` beta option and the old SDK (`@anthropic-ai/sdk` 0.113; latest is 1.x).
- **Project lives in iCloud Drive** and ~15,000 files in `node_modules` are evicted placeholders that read as empty. Local dev will fail until they download or deps are reinstalled. Lasting fix: move the repo out of `~/Documents`. Verification this session was done in a fresh GitHub clone in the session scratchpad (now gone).
- First scheduled email is the Nov 22 check-in. Confirm it arrives; Settings shows "Last sent … (scheduled)" when it does.
- 2027 plan gaps the user has not closed: travel budget far below last year's actual; several budget lines have no transactions because merchants are filed under other subcategories (vehicle insurance, gym, rideshares, tools & education).
- Trips have no advance bookings attached (flights, hotels paid ahead), so trip totals understate real cost.
- "Keep the budget" on a recommendation is not remembered; the alert stays until the numbers converge.
- A trip cannot be attached from the Expenses page, only from the trip itself.
- No yearly travel allowance that trips draw down; offered, not requested.
- Taxes are deliberately left out of the Year Plan (user will retain tax in the business account). Savings chart therefore excludes taxes.
- Tax payments still show on the Expenses page in their own tile; user was offered to hide them, no answer yet.
- Colour classes with opacity on theme variables (e.g. `border-ever-orange/30`) do not render a tint; banners using them show a plain border. Cosmetic.
- `firestore.indexes.json` indexes are not deployed to Firebase; two queries were moved to in-memory filtering to avoid them. Other composite-index queries may fail the same way.
- Pre-existing log noise: express-rate-limit warns about `X-Forwarded-For` because `trust proxy` is not set.
- Vercel CLI is old (56.x vs 66.x).

## Next steps
1. Ask the user whether the Ask panel works; if not, pull the production logs and fix.
2. Check the Nov 22 check-in email went out.
3. Get the repo out of iCloud (or reinstall dependencies) so local dev works again.
4. Help close the 2027 plan gaps: add 2027 trips with budgets, recategorize the mismatched merchants.
5. Consider upgrading `@anthropic-ai/sdk` and letting the Ask panel resume long research turns.

## Resume
`/park resume` — or just ask for the recap.
