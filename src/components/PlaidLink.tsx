import React, { useState, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { usePlaidLink, PlaidLinkOnSuccessMetadata, PlaidLinkOnExitMetadata, PlaidLinkError } from 'react-plaid-link';
import { Loader2, Link as LinkIcon } from 'lucide-react';
import axios from 'axios';
import { CONSENT_TEXT, logPlaidLinkConsent } from '../lib/consent';
import { Button, toast } from './ui';
import type {
  PlaidApiError,
  LinkTokenResponse,
  ExchangeTokenResponse
} from '../types/plaid';

interface PlaidLinkProps {
  onSuccess: () => void;
}

const PlaidLink: React.FC<PlaidLinkProps> = ({ onSuccess }) => {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  // Create link token. We do NOT auto-fetch on mount; we only fetch after the
  // user has affirmatively acknowledged the consent statement and clicked
  // "Connect Bank Account". This keeps the affirmative-action layer real
  // (no consent = no link token = no Plaid Link).
  const createLinkTokenAndOpen = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Log the consent event before any Plaid API call. If the consent log
      // fails, refuse to proceed — we don't want to start data collection
      // without an audit row.
      await logPlaidLinkConsent();

      const response = await axios.post<LinkTokenResponse>('/api/plaid/create-link-token');
      setLinkToken(response.data.link_token);
      // Store for OAuth callback recovery
      localStorage.setItem('plaid_link_token', response.data.link_token);
    } catch (error: unknown) {
      console.error('Failed to create link token:', error);

      const axiosError = error as PlaidApiError;
      if (axiosError.response?.data?.demo_mode) {
        const instructions = axiosError.response.data.instructions;
        setError(`🔗 Plaid Setup Required

To connect real brokerage accounts:

1️⃣ ${instructions?.step1}
2️⃣ ${instructions?.step2}
3️⃣ ${instructions?.step3}
4️⃣ ${instructions?.step4}

Once configured, you'll be able to connect E*Trade, Schwab, Chase, and 12,000+ other institutions!`);
      } else {
        setError('Failed to initialize account connection. Please check your Plaid configuration.');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const onPlaidSuccess = useCallback(async (public_token: string, metadata: PlaidLinkOnSuccessMetadata) => {
    setIsLoading(true);
    setError(null);
    try {
      // Exchange public token
      const exchangeResponse = await axios.post<ExchangeTokenResponse>('/api/plaid/exchange-public-token', {
        public_token
      });

      if (!exchangeResponse.data.success) {
        throw new Error('Failed to exchange token');
      }

      // Trigger sync
      await axios.post('/api/plaid/sync');

      // Show success message
      const accountCount = metadata.accounts.length;
      const accountText = accountCount === 1 ? 'account' : 'accounts';
      toast.success(`🎉 Successfully connected ${metadata.institution?.name || 'your account'}!

📊 Found ${accountCount} ${accountText}
🔄 Your portfolio is being synced automatically

You can now view your holdings in the Portfolio section.`);

      onSuccess();
    } catch (error) {
      console.error('Failed to connect account:', error);
      setError(`Failed to connect ${metadata.institution?.name || 'your account'}. Please try again or contact support if the issue persists.`);
    } finally {
      setIsLoading(false);
    }
  }, [onSuccess]);

  const onPlaidExit = useCallback((err: PlaidLinkError | null, metadata: PlaidLinkOnExitMetadata) => {
    if (err) {
      console.error('Plaid Link error:', err);

      if (err.error_code === 'INVALID_CREDENTIALS') {
        setError('Invalid credentials. Please check your account information and try again.');
      } else if (err.error_code === 'INSTITUTION_DOWN') {
        setError(`${metadata.institution?.name || 'The financial institution'} is temporarily unavailable. Please try again later.`);
      } else if (err.error_code === 'INSTITUTION_NOT_RESPONDING') {
        setError(`${metadata.institution?.name || 'The financial institution'} is not responding. Please try again in a few minutes.`);
      } else if (err.display_message) {
        setError(err.display_message);
      } else {
        setError('Connection failed. Please try again.');
      }
    }
  }, []);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: onPlaidSuccess,
    onExit: onPlaidExit,
  });

  // Once a link token is fetched, open Plaid Link automatically.
  useEffect(() => {
    if (linkToken && ready) {
      open();
    }
  }, [linkToken, ready, open]);

  return (
    <div className="space-y-3">
      {error && (
        <div className="p-4 bg-white/5 border border-ever-line rounded-md">
          <div className="text-ever-neg text-sm whitespace-pre-line">{error}</div>
        </div>
      )}

      {/* Consent block — must be acknowledged before Connect is enabled. */}
      <div className="p-4 bg-white/5 border border-ever-line rounded-md text-sm text-ever-dim">
        <p className="mb-3">{CONSENT_TEXT}</p>
        <label className="flex items-start gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-1 accent-ever-lime"
          />
          <span>
            I have read and agree to the{' '}
            <Link to="/privacy" className="text-ever-lime hover:underline" target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </Link>
            .
          </span>
        </label>
      </div>

      <Button
        onClick={createLinkTokenAndOpen}
        disabled={!acknowledged || isLoading}
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Connecting…
          </>
        ) : (
          <>
            <LinkIcon className="h-4 w-4" />
            Connect Bank Account
          </>
        )}
      </Button>
    </div>
  );
};

export default PlaidLink;
