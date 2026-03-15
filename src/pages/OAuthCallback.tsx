import React, { useEffect, useCallback, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import axios from 'axios';

const OAuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  // Retrieve the link token that was stored before the OAuth redirect
  const linkToken = localStorage.getItem('plaid_link_token');

  const onSuccess = useCallback(async (public_token: string) => {
    try {
      await axios.post('http://localhost:3001/api/plaid/exchange-public-token', {
        public_token,
      });
      localStorage.removeItem('plaid_link_token');
      navigate('/personal-finance-settings', { state: { plaidConnected: true } });
    } catch {
      setError('Failed to connect account. Please try again.');
    }
  }, [navigate]);

  const onExit = useCallback(() => {
    localStorage.removeItem('plaid_link_token');
    navigate('/personal-finance-settings');
  }, [navigate]);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit,
    receivedRedirectUri: window.location.href,
  });

  useEffect(() => {
    if (ready) {
      open();
    }
  }, [ready, open]);

  if (!linkToken) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-600 mb-4">OAuth session expired. Please try connecting again.</p>
          <button
            onClick={() => navigate('/personal-finance-settings')}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Back to Settings
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => navigate('/personal-finance-settings')}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Back to Settings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
        <p className="text-gray-600">Completing account connection...</p>
      </div>
    </div>
  );
};

export default OAuthCallback;
