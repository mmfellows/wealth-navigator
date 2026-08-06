import React, { useState, useCallback, useEffect } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { RefreshCw } from 'lucide-react';
import axios from 'axios';
import { toast } from './ui';

interface PlaidUpdateLinkProps {
  itemId: string;
  institutionName: string;
  onSuccess: () => void;
}

// Opens Plaid Link in update mode for an existing item — used to add new
// product consent (investments / liabilities) to items that were originally
// linked with transactions only.
const PlaidUpdateLink: React.FC<PlaidUpdateLinkProps> = ({ itemId, institutionName, onSuccess }) => {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const onPlaidSuccess = useCallback(async () => {
    setIsLoading(true);
    try {
      // Update mode does not issue a public token. Refresh products from Plaid
      // (so plaid_items.products reflects the new consent), then trigger a sync.
      await axios.post('/api/plaid/refresh-item-products', { item_id: itemId });
      await axios.post('/api/plaid/sync');
      onSuccess();
    } catch (error) {
      console.error('Failed to finalize reconnect:', error);
      toast.error(`Reconnected to ${institutionName} but the follow-up sync failed. Try clicking Sync Now.`);
    } finally {
      setIsLoading(false);
      setLinkToken(null);
    }
  }, [itemId, institutionName, onSuccess]);

  const onPlaidExit = useCallback(() => {
    setLinkToken(null);
  }, []);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: onPlaidSuccess,
    onExit: onPlaidExit,
  });

  // Open Link as soon as we have a token and Plaid says it's ready
  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  const handleClick = async () => {
    setIsLoading(true);
    try {
      const { data } = await axios.post<{ link_token: string }>(
        '/api/plaid/create-update-token',
        { item_id: itemId }
      );
      setLinkToken(data.link_token);
    } catch (error) {
      console.error('Failed to create update token:', error);
      toast.error(`Couldn't start reconnect for ${institutionName}. Please try again.`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      className="px-3 py-1 rounded-md text-sm font-medium text-ever-orange border border-ever-line hover:bg-white/5 disabled:opacity-50 flex items-center"
    >
      <RefreshCw className={`h-3 w-3 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
      Reconnect
    </button>
  );
};

export default PlaidUpdateLink;
