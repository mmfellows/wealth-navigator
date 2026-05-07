import axios from 'axios';

// IMPORTANT: must match the Version at the top of security/PRIVACY_POLICY.md.
// Bump in lockstep when the policy text changes materially.
export const PRIVACY_POLICY_VERSION = '1.0';

// IMPORTANT: must match the consent text in security/CONSENT.md §3 verbatim.
// The exact bytes here are SHA-256-hashed into every audit row, so a future
// reviewer can prove what was shown at the time of consent.
export const CONSENT_TEXT =
  'By connecting an account, you authorize wealth-navigator to retrieve and store transaction history, account balances, holdings, and (where applicable) liability details from this financial institution via Plaid, for the purpose of personal financial tracking. You can revoke this authorization at any time by disconnecting the account from the application, which will revoke the Plaid access token and remove stored institution data. See the Privacy Policy for full details on what is collected, how long it is retained, and how to request deletion.';

/**
 * Log a Plaid Link consent event. Call this immediately before opening
 * Plaid Link. Throws on failure — callers should surface the error and
 * NOT proceed with the Plaid Link flow if the consent log can't be written.
 */
export async function logPlaidLinkConsent(): Promise<void> {
  await axios.post('/api/plaid/consent', {
    privacy_policy_version: PRIVACY_POLICY_VERSION,
    consent_text: CONSENT_TEXT,
    app_version: import.meta.env.VITE_APP_VERSION || null,
  });
}
