import React, { useState, useEffect } from 'react';
import { Save, AlertCircle, RefreshCw, Trash2, CheckCircle, Clock, Plus, Minus, Key, Eye, EyeOff, Target, Landmark } from 'lucide-react';
import PlaidLink from '../components/PlaidLink';
import PlaidUpdateLink from '../components/PlaidUpdateLink';
import { Card, Button } from '../components/ui';
import axios from 'axios';

const REQUIRED_PRODUCTS = ['investments', 'liabilities'] as const;
// A product only counts as missing if the institution actually supports it
// (Plaid's available_products). A brokerage with no liabilities support
// should never show a reconnect warning it can't satisfy.
const missingProducts = (granted?: string[], available?: string[]) => {
  const have = new Set(granted || []);
  const supportable = new Set(available || []);
  return REQUIRED_PRODUCTS.filter(p => !have.has(p) && supportable.has(p));
};

type Tab = 'allocations' | 'accounts' | 'api';

const TABS: Array<{ id: Tab; label: string; icon: typeof Target }> = [
  { id: 'accounts', label: 'Connected Accounts', icon: Landmark },
  { id: 'allocations', label: 'Allocations', icon: Target },
  { id: 'api', label: 'Broker APIs', icon: Key },
];

const InvestingSettings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>(() =>
    (localStorage.getItem('investing_settings_tab') as Tab) || 'accounts'
  );
  const selectTab = (t: Tab) => {
    setActiveTab(t);
    localStorage.setItem('investing_settings_tab', t);
  };

  const [targetAllocations, setTargetAllocations] = useState({
    lowRisk: 30,
    growth: 60,
    speculative: 10
  });

  const [hasChanges, setHasChanges] = useState(false);
  const [connectedAccounts, setConnectedAccounts] = useState<any[]>([]);
  const [syncHistory, setSyncHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  // ETrade API Settings
  const [etradeKeys, setEtradeKeys] = useState({
    consumerKey: '',
    consumerSecret: '',
    sandboxMode: false
  });
  const [showSecret, setShowSecret] = useState(false);
  const [etradeKeysSaved, setEtradeKeysSaved] = useState(false);

  const currentAllocations = {
    lowRisk: 20.0,
    growth: 67.1,
    speculative: 12.9
  };

  const handleAllocationChange = (category: string, value: number) => {
    const clampedValue = Math.max(0, Math.min(100, value));

    setTargetAllocations(prev => {
      const newAllocations = { ...prev, [category]: clampedValue };

      // Auto-balance the other categories to maintain 100% total
      const categories = Object.keys(newAllocations).filter(key => key !== category);
      const remainingTotal = 100 - clampedValue;
      const currentOtherTotal = categories.reduce((sum, key) => sum + prev[key as keyof typeof prev], 0);

      if (currentOtherTotal > 0 && remainingTotal >= 0) {
        // Proportionally adjust other categories
        categories.forEach(key => {
          const proportion = prev[key as keyof typeof prev] / currentOtherTotal;
          newAllocations[key as keyof typeof newAllocations] = Math.round(remainingTotal * proportion);
        });

        // Handle rounding errors by adjusting the largest category
        const actualTotal = Object.values(newAllocations).reduce((sum, val) => sum + val, 0);
        if (actualTotal !== 100) {
          const largestCategory = categories.reduce((max, key) =>
            newAllocations[key as keyof typeof newAllocations] > newAllocations[max as keyof typeof newAllocations] ? key : max
          );
          newAllocations[largestCategory as keyof typeof newAllocations] += (100 - actualTotal);
        }
      } else if (remainingTotal < 0) {
        // If the new value would exceed 100%, cap it and zero out others
        newAllocations[category as keyof typeof newAllocations] = 100;
        categories.forEach(key => {
          newAllocations[key as keyof typeof newAllocations] = 0;
        });
      }

      return newAllocations;
    });
    setHasChanges(true);
  };

  const adjustAllocation = (category: string, delta: number) => {
    const currentValue = targetAllocations[category as keyof typeof targetAllocations];
    handleAllocationChange(category, currentValue + delta);
  };

  // Load target allocations, connected accounts, and sync history
  useEffect(() => {
    axios.get('/api/settings')
      .then(res => {
        if (res.data.targetAllocations) {
          setTargetAllocations(res.data.targetAllocations);
        }
      })
      .catch(console.error);
    loadConnectedAccounts();
    loadSyncHistory();
    loadEtradeKeys();
  }, []);

  const loadConnectedAccounts = async () => {
    try {
      const response = await axios.get('/api/plaid/accounts');
      setConnectedAccounts(response.data.institutions);
    } catch (error) {
      console.error('Failed to load connected accounts:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadSyncHistory = async () => {
    try {
      const response = await axios.get('/api/plaid/sync-history?limit=10');
      setSyncHistory(response.data.logs);
    } catch (error) {
      console.error('Failed to load sync history:', error);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const response = await axios.post('/api/plaid/sync');
      alert(response.data.message);
      loadSyncHistory(); // Refresh history
      // Optionally refresh portfolio data
      window.location.reload();
    } catch (error) {
      console.error('Sync failed:', error);
      alert('Portfolio sync failed. Please try again.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRemoveAccount = async (itemId: string, institutionName: string) => {
    if (window.confirm(`Are you sure you want to remove ${institutionName}? This will delete all associated portfolio data.`)) {
      try {
        await axios.delete(`/api/plaid/accounts/${itemId}`);
        alert('Account removed successfully');
        loadConnectedAccounts();
        loadSyncHistory();
      } catch (error) {
        console.error('Failed to remove account:', error);
        alert('Failed to remove account. Please try again.');
      }
    }
  };

  const handleSave = async () => {
    try {
      await axios.put('/api/settings', { targetAllocations });
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to save target allocations:', error);
      alert('Failed to save settings. Please try again.');
    }
  };

  const handleEtradeKeyChange = (field: string, value: string | boolean) => {
    setEtradeKeys(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const saveEtradeKeys = async () => {
    try {
      const response = await axios.post('/api/settings/etrade-keys', etradeKeys);
      if (response.data.success) {
        setEtradeKeysSaved(true);
        setTimeout(() => setEtradeKeysSaved(false), 3000);
      }
    } catch (error) {
      console.error('Failed to save ETrade keys:', error);
      alert('Failed to save ETrade API keys. Please try again.');
    }
  };

  const loadEtradeKeys = async () => {
    try {
      const response = await axios.get('/api/settings/etrade-keys');
      if (response.data.keys) {
        setEtradeKeys({
          consumerKey: response.data.keys.consumerKey || '',
          consumerSecret: response.data.keys.consumerSecret || '',
          sandboxMode: response.data.keys.sandboxMode !== false
        });
      }
    } catch (error) {
      console.error('Failed to load ETrade keys:', error);
    }
  };

  const totalTarget = Object.values(targetAllocations).reduce((sum, val) => sum + val, 0);
  const isValidTotal = totalTarget === 100;

  const getAllocationStatus = (category: string) => {
    const current = currentAllocations[category as keyof typeof currentAllocations];
    const target = targetAllocations[category as keyof typeof targetAllocations];
    const difference = Math.abs(current - target);

    if (difference <= 2) return { status: 'on-target', color: 'text-ever-pos' };
    if (difference <= 5) return { status: 'close', color: 'text-ever-orange' };
    return { status: 'off-target', color: 'text-ever-neg' };
  };

  const renderAllocationsTab = () => (
    <Card className="p-6">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="text-xl font-semibold text-ever-ink">Target Investment Allocations</h2>
          <p className="text-ever-dim mt-1">
            Set your target percentages for each investment category. These will be used in the dashboard
            to show how your actual allocation compares to your goals.
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={!hasChanges || !isValidTotal}
          className="flex-shrink-0 ml-4"
        >
          <Save className="h-4 w-4" />
          {hasChanges ? 'Save Changes' : 'Saved'}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
        {Object.entries(targetAllocations).map(([category, value]) => {
          const status = getAllocationStatus(category);
          const currentValue = currentAllocations[category as keyof typeof currentAllocations];

          return (
            <div key={category} className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-ever-ink capitalize">
                  {category.replace(/([A-Z])/g, ' $1').trim()}
                </h3>
                <span className={`text-sm font-medium ${status.color}`}>
                  {status.status === 'on-target' && '✓ On Target'}
                  {status.status === 'close' && '⚠ Close'}
                  {status.status === 'off-target' && '⚠ Off Target'}
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center space-x-4">
                  <label className="text-sm text-ever-dim w-16">Target:</label>
                  <div className="flex-1 flex items-center space-x-2">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={value}
                      onChange={(e) => handleAllocationChange(category, parseInt(e.target.value))}
                      className="flex-1 accent-ever-lime"
                    />
                    <div className="flex items-center space-x-1 bg-white/5 rounded-md p-1">
                      <button
                        onClick={() => adjustAllocation(category, -1)}
                        disabled={value <= 0}
                        className="p-1 rounded text-ever-dim hover:bg-white/10 hover:text-ever-ink disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Decrease by 1%"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="text-sm font-medium text-ever-ink w-12 text-center">{value}%</span>
                      <button
                        onClick={() => adjustAllocation(category, 1)}
                        disabled={value >= 100}
                        className="p-1 rounded text-ever-dim hover:bg-white/10 hover:text-ever-ink disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Increase by 1%"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-4">
                  <label className="text-sm text-ever-dim w-16">Current:</label>
                  <div className="flex-1">
                    <div className="bg-ever-track rounded-full h-2">
                      <div
                        className="bg-ever-lime rounded-full h-2"
                        style={{ width: `${currentValue}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-sm font-medium text-ever-ink w-12">{currentValue}%</span>
                </div>

                <div className="text-xs text-ever-dim">
                  Difference: {Math.abs(currentValue - value).toFixed(1)}%
                  {currentValue > value ? ' over' : ' under'} target
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 p-4 bg-white/5 rounded-md">
        <h4 className="text-sm font-medium text-ever-ink mb-2">Category Descriptions:</h4>
        <div className="text-xs text-ever-dim space-y-1">
          <p><strong>Low Risk:</strong> Conservative investments like bonds, dividend stocks, and CDs</p>
          <p><strong>Growth:</strong> Established companies with steady growth potential</p>
          <p><strong>Speculative:</strong> High-risk, high-reward investments like growth stocks and emerging sectors</p>
        </div>
      </div>
    </Card>
  );

  const renderAccountsTab = () => (
    <div className="space-y-6">
      {/* Connected institutions */}
      <Card className="p-6">
        <div className="flex justify-between items-center mb-1">
          <h2 className="text-xl font-semibold text-ever-ink">Connected Brokerage Accounts</h2>
          <Button
            variant="ghost"
            onClick={handleSync}
            disabled={isSyncing}
            className="flex-shrink-0"
          >
            <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Syncing…' : 'Sync Now'}
          </Button>
        </div>
        <p className="text-ever-dim mb-6">
          Institutions currently syncing portfolio data into the app.
        </p>

        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-ever-dim">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" />
            <span>Loading connected accounts…</span>
          </div>
        ) : connectedAccounts.length === 0 ? (
          <div className="text-center py-8 bg-white/5 rounded-md">
            <p className="text-ever-dim">No brokerage accounts connected yet.</p>
            <p className="text-sm text-ever-dim mt-2">
              Connect your first account below to start automatic portfolio syncing.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {connectedAccounts.map((account) => {
              const missing = missingProducts(account.products, account.available_products);
              return (
                <div key={account.item_id} className="p-4 border border-ever-line rounded-lg">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${missing.length ? 'bg-ever-orange' : 'bg-ever-pos'}`} />
                      <div className="min-w-0">
                        <h3 className="text-sm font-medium text-ever-ink truncate">{account.institution_name}</h3>
                        <p className="text-xs text-ever-dim">
                          Connected {new Date(account.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {missing.length > 0 && (
                        <PlaidUpdateLink
                          itemId={account.item_id}
                          institutionName={account.institution_name}
                          onSuccess={() => { loadConnectedAccounts(); loadSyncHistory(); }}
                        />
                      )}
                      <button
                        onClick={() => handleRemoveAccount(account.item_id, account.institution_name)}
                        className="px-3 py-1.5 rounded-md text-sm font-medium text-ever-neg border border-ever-line hover:bg-white/5 flex items-center"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                        Remove
                      </button>
                    </div>
                  </div>
                  {missing.length > 0 && (
                    <div className="mt-3 px-3 py-2 bg-white/5 border border-ever-line rounded text-xs text-ever-orange">
                      Reconnect to enable: <strong>{missing.join(', ')}</strong>. Required for holdings, balances, and net-worth tracking.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Connect a new institution — the Plaid consent block gets its own room */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-ever-ink mb-1">Connect a New Account</h2>
        <p className="text-ever-dim mb-4">
          Supports E*Trade, Schwab, Chase, Fidelity, and 12,000+ other institutions via Plaid.
        </p>
        <PlaidLink onSuccess={loadConnectedAccounts} />
      </Card>

      {/* Sync history */}
      {syncHistory.length > 0 && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-ever-ink mb-3">Recent Sync Activity</h2>
          <div className="space-y-2">
            {syncHistory.slice(0, 5).map((log, index) => (
              <div key={index} className="flex items-center space-x-3 text-sm">
                {log.status === 'completed' && <CheckCircle className="h-4 w-4 text-ever-pos flex-shrink-0" />}
                {log.status === 'error' && <AlertCircle className="h-4 w-4 text-ever-neg flex-shrink-0" />}
                {log.status === 'in_progress' && <Clock className="h-4 w-4 text-ever-lime flex-shrink-0" />}
                <span className="text-ever-dim truncate">{log.message}</span>
                <span className="text-ever-faint text-xs flex-shrink-0">
                  {new Date(log.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );

  const renderApiTab = () => (
    <Card className="p-6">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center">
          <Key className="h-5 w-5 text-ever-lime mr-2" />
          <h2 className="text-xl font-semibold text-ever-ink">ETrade API Configuration</h2>
        </div>
        <Button
          onClick={saveEtradeKeys}
          disabled={!etradeKeys.consumerKey || !etradeKeys.consumerSecret}
        >
          <Save className="h-4 w-4" />
          <span>{etradeKeysSaved ? 'Saved!' : 'Save Keys'}</span>
        </Button>
      </div>

      <p className="text-ever-dim mb-6">
        Configure your ETrade API credentials for advanced portfolio management and automated trading features.
        Visit the <a href="https://developer.etrade.com" target="_blank" rel="noopener noreferrer" className="text-ever-lime hover:underline">ETrade Developer Portal</a> to obtain your API keys.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-ever-dim mb-2">
            Consumer Key
          </label>
          <input
            type="text"
            value={etradeKeys.consumerKey}
            onChange={(e) => handleEtradeKeyChange('consumerKey', e.target.value)}
            placeholder="Enter your ETrade consumer key"
            className="w-full px-3 py-2 bg-ever-bg border border-ever-line text-ever-ink placeholder-ever-faint rounded-lg focus:outline-none focus:border-ever-lime"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-ever-dim mb-2">
            Consumer Secret
          </label>
          <div className="relative">
            <input
              type={showSecret ? "text" : "password"}
              value={etradeKeys.consumerSecret}
              onChange={(e) => handleEtradeKeyChange('consumerSecret', e.target.value)}
              placeholder="Enter your ETrade consumer secret"
              className="w-full px-3 py-2 pr-10 bg-ever-bg border border-ever-line text-ever-ink placeholder-ever-faint rounded-lg focus:outline-none focus:border-ever-lime"
            />
            <button
              type="button"
              onClick={() => setShowSecret(!showSecret)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
            >
              {showSecret ? (
                <EyeOff className="h-4 w-4 text-ever-faint" />
              ) : (
                <Eye className="h-4 w-4 text-ever-faint" />
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 p-3 bg-white/5 rounded-md border border-ever-line">
        <div className="flex items-center">
          <CheckCircle className="h-4 w-4 text-ever-pos mr-2" />
          <span className="text-sm text-ever-pos font-medium">
            Production Mode Enabled - Live trading data and real portfolio information
          </span>
        </div>
      </div>

      <div className="mt-6 p-4 bg-white/5 rounded-md border border-ever-line">
        <h4 className="text-sm font-medium text-ever-ink mb-2">Security Note:</h4>
        <p className="text-xs text-ever-dim">
          Your API keys are stored securely and encrypted. They are only used for authorized API calls to ETrade.
          You can revoke access at any time through your ETrade developer account.
        </p>
      </div>

      {(etradeKeys.consumerKey || etradeKeys.consumerSecret) && (
        <div className="mt-4 p-3 bg-white/5 rounded-md border border-ever-line">
          <div className="flex items-center">
            <CheckCircle className="h-4 w-4 text-ever-pos mr-2" />
            <span className="text-sm text-ever-pos">
              API keys configured.
            </span>
          </div>
        </div>
      )}
    </Card>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ever-ink md:text-[26px]">Investing Settings</h1>
        <p className="text-ever-dim mt-2">
          Configure your investment allocations, connected accounts, and API settings
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-ever-line">
        <nav className="flex gap-6 -mb-px" aria-label="Settings sections">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => selectTab(tab.id)}
                className={`inline-flex items-center gap-2 px-1 py-3 border-b-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-ever-lime text-ever-lime'
                    : 'border-transparent text-ever-dim hover:text-ever-ink hover:border-ever-line'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                {tab.id === 'allocations' && hasChanges && (
                  <span className="w-1.5 h-1.5 rounded-full bg-ever-lime" title="Unsaved changes" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {activeTab === 'allocations' && renderAllocationsTab()}
      {activeTab === 'accounts' && renderAccountsTab()}
      {activeTab === 'api' && renderApiTab()}
    </div>
  );
};

export default InvestingSettings;
