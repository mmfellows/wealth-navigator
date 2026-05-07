# Privacy Policy

**Effective**: 2026-05-06
**Version**: 1.0
**Operator**: Matt Fellows (`matt@tangiblevalue.com`)

This is the privacy policy for **wealth-navigator**, a personal financial dashboard at `https://[your-app].vercel.app`. It describes what data the application collects about you, how it is used, where it is stored, and how to exercise your rights over it.

This is also displayed in-app at `/privacy`.

---

## 1. Who operates this service

Wealth-navigator is operated by Matt Fellows as an individual (the **Operator**). It is not operated by a corporation, employs no staff, and engages no third-party processors other than the platform providers listed below. The Operator is the data controller for the purposes of this policy.

Contact: `matt@tangiblevalue.com`.

## 2. Scope of users

Registration is restricted to a small allow-list configured by the Operator (see `security/ACCESS_CONTROL.md §3`). At the time of this policy's effective date, that allow-list contains exactly one email address (the Operator's own). The application is not intended for general public sign-up. If you have an account, the Operator placed your address on the allow-list intentionally.

## 3. What data is collected

### 3.1 Account data

When you create an account, the application stores:

- Your email address
- A salted bcrypt hash of your password (the password itself is never stored)
- Account creation timestamp
- WebAuthn public credential metadata (one row per registered passkey: credential ID, public key, signature counter, device label, last-used timestamp)

### 3.2 Plaid-derived data

When you choose to connect a financial institution through Plaid Link, the application receives — via Plaid — and stores:

- The institution name and your `item_id`
- An encrypted `access_token` (encrypted with AES-256-CBC at the application layer before storage; see `security/ENCRYPTION.md §3`)
- Account-level data: account names, types, balances, last-four masks
- Transaction history: amount, date, merchant, Plaid-supplied category
- Investment holdings, when applicable: ticker, quantity, market value
- Liabilities, when applicable: outstanding balance, APR, minimum payment
- Synced timestamps and metadata

The Operator does not receive your bank credentials. Plaid handles the bank login and only returns derivative data to the application. Plaid's own privacy policy applies to that exchange and is available at <https://plaid.com/legal/#consumers>.

### 3.3 Application-generated data

The application stores data you create within it:

- Manually entered expenses, trades, investment ideas, bets, budgets
- Settings and preferences (e.g., target portfolio allocations)
- Activity logs of sync operations (`sync_logs`)

### 3.4 Data not collected

The application **does not** collect or use:

- Behavioral analytics (no Google Analytics, no Mixpanel, no Segment, etc.)
- Marketing identifiers
- Advertising IDs
- Cross-site tracking cookies
- Third-party scripts that would receive data about your browsing on this app

## 4. How the data is used

The data is used **only** to provide the in-app features you interact with: showing you your balances, transaction history, allocations, etc. It is not used for any other purpose.

The data is **not** used to:

- Train any machine-learning model
- Generate aggregate or "anonymized" statistics for resale
- Profile you for marketing
- Make automated decisions that have legal or similarly significant effects

## 5. Sharing & third-party processors

The Operator does not sell or share your data with marketers, advertisers, or data brokers under any circumstances.

The application is hosted and stored using two platform providers, both of whom act as processors on the Operator's behalf and apply their own security controls:

| Provider | Role | What they see |
|---|---|---|
| **Vercel** | Application hosting (serverless functions + static frontend) | Encrypted environment variables; the source bundle. Vercel does not have read access to your Firestore data. |
| **Google Cloud / Firebase / Firestore** | Database for all collections listed in §3 | All Firestore documents, encrypted at rest with Google-managed AES-256. |

The application also makes outbound calls to:

- **Plaid** — when you initiate a Plaid Link or trigger a sync, to retrieve the data described in §3.2.
- **Public financial-data APIs** (e.g., Alpha Vantage, IEX Cloud, Yahoo Finance) — to fetch market prices for tickers you've entered. These calls do not include your identity or any of your account data.
- **Optional AI research APIs** (OpenAI, Perplexity), if configured — to support a manual "research" feature. These calls send only the prompt content you compose, not your financial data.

The Operator does not use any sub-processor not listed above without first updating this policy.

## 6. Storage & security

All data described in §3 is stored in Firestore (Google Cloud), which encrypts data at rest with AES-256 using Google-managed keys. Plaid `access_token`s are additionally encrypted at the application layer (AES-256-CBC) before being written to Firestore, so an attacker would have to defeat both layers to use them.

Data in transit between your browser and the application — and between the application and any third-party API — is encrypted with TLS 1.2 or TLS 1.3.

For full details: see `security/ENCRYPTION.md` and `security/ACCESS_CONTROL.md` in the repository.

## 7. Retention & deletion

Data is retained only as long as it remains useful for the personal financial-tracking purpose described in §4, and is deleted on request. Specific retention periods and the deletion procedure are described in `security/DATA_RETENTION.md`.

To request deletion of your account and all associated data, email the Operator at `matt@tangiblevalue.com`. Deletion is performed within the SLA in that document.

## 8. Your rights

You may at any time:

- **Access** your data — the application's UI displays everything stored. On request, a machine-readable export can be provided by the Operator.
- **Correct** inaccurate data — most data is editable in the UI; Plaid-sourced data corrections require disconnecting and reconnecting the institution.
- **Delete** your data — see §7.
- **Withdraw consent** — disconnect the Plaid integration via the application UI, which causes the access token to be revoked with Plaid and removed from storage.

Depending on where you reside, you may have additional rights under local law (e.g., GDPR, CCPA, BC PIPA). The Operator will respond to any such request within 30 days of receipt.

## 9. Children

The service is not directed to and is not intended for children under 13 (or under the equivalent age of digital consent in your jurisdiction).

## 10. Changes to this policy

If this policy materially changes, the Operator will:

- Update the **Effective** date at the top.
- Increment the **Version**.
- Notify any users with active accounts by email at the address in their account record.

The current and historical versions are tracked in version control in the repository.

## 11. Contact

Questions, requests, or complaints: `matt@tangiblevalue.com`.

---

*This policy is the source of truth for how wealth-navigator handles your data. If practice diverges from policy, the policy is updated.*
