# Security Documentation

This folder is the security baseline for **wealth-navigator**. It exists so that:

1. There's a single, honest description of how this app treats security.
2. The Plaid Production Security Questionnaire can be answered with real artifacts (no fabrication).
3. Future-me has a checklist to keep up to date.

## Index

| File | Topic | Plaid Q# |
|---|---|---|
| `INFOSEC_POLICY.md` | Umbrella security policy + security contact | Q1, Q2 |
| `ACCESS_CONTROL.md` | Who can access what, MFA, account inventory | Q3, Q4, Q5 |
| `ENCRYPTION.md` | TLS in-transit + at-rest encryption posture | Q6, Q7 |
| `VULN_MGMT.md` | Vulnerability scanning, patching, EOL tracking | Q8 |
| `PRIVACY_POLICY.md` | Public-facing privacy policy (also published in-app) | Q9 |
| `CONSENT.md` | How user consent is captured before Plaid Link | Q10 |
| `DATA_RETENTION.md` | What data is kept, for how long, and how it's deleted | Q11 |
| `QUESTIONNAIRE_ANSWERS.md` | Mapping of each Plaid question to the answer + supporting artifact | — |

## How to use

- **Owner**: Matt Fellows (`matt@tangiblevalue.com`)
- **Review cadence**: every 12 months, or after any material change to architecture, dependencies, or scope.
- **Last reviewed**: 2026-05-06.

## Source-of-truth principle

Every claim in these documents must reflect what the system *actually does*. If you change architecture, update the doc in the same PR — or update the doc and open a follow-up issue. Don't let aspirational text drift into the policy.
