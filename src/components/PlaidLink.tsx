import React, { useState, useCallback, useEffect } from 'react';
import { usePlaidLink, PlaidLinkOnSuccessMetadata, PlaidLinkOnExitMetadata, PlaidLinkError } from 'react-plaid-link';
import { Loader2, Link as LinkIcon } from 'lucide-react';
import axios from 'axios';
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

  // Create link token
  const createLinkToken = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await axios.post<LinkTokenResponse>('http://localhost:3001/api/plaid/create-link-token');
      setLinkToken(response.data.link_token);
      // Store for OAuth callback recovery
      localStorage.setItem('plaid_link_token', response.data.link_token);
    } catch (error: unknown) {
      console.error('Failed to create link token:', error);

      const axiosError = error as PlaidApiError;
      if (axiosError.response?.data?.demo_mode) {
        // Show detailed setup instructions
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

  // Automatically create link token when component mounts
  useEffect(() => {
    createLinkToken();
  }, [createLinkToken]);

  const onPlaidSuccess = useCallback(async (public_token: string, metadata: PlaidLinkOnSuccessMetadata) => {
    setIsLoading(true);
    setError(null);
    try {
      // Exchange public token
      const exchangeResponse = await axios.post<ExchangeTokenResponse>('http://localhost:3001/api/plaid/exchange-public-token', {
        public_token
      });

      if (!exchangeResponse.data.success) {
        throw new Error('Failed to exchange token');
      }

      // Trigger sync
      await axios.post('http://localhost:3001/api/plaid/sync');

      // Show success message
      const accountCount = metadata.accounts.length;
      const accountText = accountCount === 1 ? 'account' : 'accounts';
      alert(`🎉 Successfully connected ${metadata.institution?.name || 'your account'}!

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

      // Handle specific error types
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

  // If no link token, show button to create one
  if (!linkToken) {
    return (
      <div className="space-y-3">
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-md">
            <div className="text-red-800 text-sm whitespace-pre-line">{error}</div>
          </div>
        )}
        <button
          onClick={createLinkToken}
          disabled={isLoading}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Initializing...
            </>
          ) : (
            <>
              <LinkIcon className="h-4 w-4 mr-2" />
              Connect Brokerage Account
            </>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md">
          <div className="text-red-800 text-sm whitespace-pre-line">{error}</div>
        </div>
      )}
      <button
        onClick={() => open()}
        disabled={!ready || isLoading}
        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
      >
        {!ready || isLoading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            {isLoading ? 'Connecting...' : 'Loading...'}
          </>
        ) : (
          <>
            <LinkIcon className="h-4 w-4 mr-2" />
            Connect Brokerage Account
          </>
        )}
      </button>
    </div>
  );
};

export default PlaidLink;