import { Link } from 'react-router-dom';

/**
 * Privacy Policy page. Public — accessible without authentication so users
 * can read it before connecting any financial institutions.
 *
 * The canonical text source is `security/PRIVACY_POLICY.md`. If you edit
 * one, edit the other in the same commit.
 */
export default function Privacy() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-6 py-4 flex justify-between items-center">
          <h1 className="text-xl font-semibold text-gray-900">Wealth Navigator</h1>
          <Link to="/login" className="text-sm text-blue-600 hover:text-blue-700">
            Sign in
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <article className="prose prose-sm sm:prose max-w-none text-gray-800">
          <h1 className="text-3xl font-semibold text-gray-900 mb-2">Privacy Policy</h1>
          <p className="text-sm text-gray-500 mb-8">
            Effective 2026-05-06 · Version 1.0 · Operator: Matt Fellows (
            <a className="text-blue-600 hover:underline" href="mailto:matt@tangiblevalue.com">
              matt@tangiblevalue.com
            </a>
            )
          </p>

          <p>
            This is the privacy policy for <strong>wealth-navigator</strong>, a personal financial
            dashboard. It describes what data the application collects about you, how it is used,
            where it is stored, and how to exercise your rights over it.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-2">1. Who operates this service</h2>
          <p>
            Wealth-navigator is operated by Matt Fellows as an individual (the <em>Operator</em>).
            It is not operated by a corporation, employs no staff, and engages no third-party
            processors other than the platform providers listed below. The Operator is the data
            controller for the purposes of this policy.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-2">2. Scope of users</h2>
          <p>
            Registration is restricted to a small allow-list configured by the Operator. At the
            time of this policy's effective date, that allow-list contains exactly one email
            address. The application is not intended for general public sign-up. If you have an
            account, the Operator placed your address on the allow-list intentionally.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-2">3. What data is collected</h2>
          <h3 className="text-base font-semibold mt-4 mb-1">3.1 Account data</h3>
          <ul className="list-disc list-inside space-y-1">
            <li>Your email address.</li>
            <li>A salted bcrypt hash of your password (the password itself is never stored).</li>
            <li>Account creation timestamp.</li>
            <li>
              WebAuthn passkey metadata for each registered passkey: credential ID, public key,
              signature counter, device label, last-used timestamp.
            </li>
          </ul>

          <h3 className="text-base font-semibold mt-4 mb-1">3.2 Plaid-derived data</h3>
          <p>
            When you connect a financial institution through Plaid Link, the application receives —
            via Plaid — and stores institution name, an encrypted Plaid access token (AES-256-CBC
            at the application layer before storage), account-level data (names, types, balances,
            last-four masks), transaction history, investment holdings, liabilities, and sync
            timestamps. The Operator does not receive your bank credentials. Plaid handles the
            bank login and only returns derivative data. Plaid's own privacy policy applies to
            that exchange and is available at{' '}
            <a className="text-blue-600 hover:underline" href="https://plaid.com/legal/#consumers" target="_blank" rel="noopener noreferrer">
              plaid.com/legal
            </a>
            .
          </p>

          <h3 className="text-base font-semibold mt-4 mb-1">3.3 Application-generated data</h3>
          <p>
            Manually entered expenses, trades, ideas, bets, budgets; settings and preferences;
            activity logs of sync operations.
          </p>

          <h3 className="text-base font-semibold mt-4 mb-1">3.4 Data not collected</h3>
          <p>
            No behavioral analytics, no marketing identifiers, no advertising IDs, no cross-site
            tracking cookies, no third-party scripts that receive data about your browsing.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-2">4. How the data is used</h2>
          <p>
            The data is used <strong>only</strong> to provide the in-app features you interact
            with. It is not used to train any machine-learning model, generate aggregate or
            "anonymized" statistics for resale, profile you for marketing, or make automated
            decisions with legal or similarly significant effects.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-2">5. Sharing & third-party processors</h2>
          <p>
            The Operator does not sell or share your data with marketers, advertisers, or data
            brokers under any circumstances.
          </p>
          <p>
            The application is hosted on <strong>Vercel</strong> (serverless functions + static
            frontend) and stores data in <strong>Google Cloud / Firestore</strong> (encrypted at
            rest with Google-managed AES-256). Outbound calls go to <strong>Plaid</strong> (when
            syncing), public financial-data APIs (for ticker prices), and the optional AI research
            assistant (Anthropic Claude API) if configured — research queries send the prompt you
            compose plus a summary of your portfolio (net worth, allocation, top holdings, and
            active bet theses) so answers can reference your actual positions. No account numbers,
            credentials, or transaction-level data are sent.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-2">6. Storage & security</h2>
          <p>
            All data is stored in Firestore, encrypted at rest with AES-256 (Google-managed keys).
            Plaid access tokens are additionally encrypted at the application layer (AES-256-CBC)
            before being written. Data in transit is encrypted with TLS 1.2 or TLS 1.3.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-2">7. Retention & deletion</h2>
          <p>
            Data is retained only as long as it remains useful for the personal financial-tracking
            purpose described in §4, and is deleted on request. To request deletion of your
            account and all associated data, email{' '}
            <a className="text-blue-600 hover:underline" href="mailto:matt@tangiblevalue.com">
              matt@tangiblevalue.com
            </a>
            .
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-2">8. Your rights</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>
              <strong>Access</strong> — the application's UI displays everything stored.
              Machine-readable export available on request.
            </li>
            <li>
              <strong>Correct</strong> — most data is editable in the UI.
            </li>
            <li>
              <strong>Delete</strong> — see §7.
            </li>
            <li>
              <strong>Withdraw consent</strong> — disconnect the Plaid integration via the UI; the
              access token is revoked with Plaid and removed from storage.
            </li>
          </ul>
          <p>
            Depending on where you reside, you may have additional rights under local law (e.g.,
            GDPR, CCPA, BC PIPA). Requests are responded to within 30 days of receipt.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-2">9. Children</h2>
          <p>
            The service is not directed to and is not intended for children under 13 (or under the
            equivalent age of digital consent in your jurisdiction).
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-2">10. Changes to this policy</h2>
          <p>
            If this policy materially changes, the Operator will update the Effective date and
            Version at the top, and notify any users with active accounts by email.
          </p>

          <h2 className="text-xl font-semibold mt-8 mb-2">11. Contact</h2>
          <p>
            Questions, requests, or complaints:{' '}
            <a className="text-blue-600 hover:underline" href="mailto:matt@tangiblevalue.com">
              matt@tangiblevalue.com
            </a>
            .
          </p>
        </article>
      </main>
    </div>
  );
}
