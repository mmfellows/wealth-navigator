import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { PiggyBank, CreditCard, Building2, Briefcase, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import PlaidLink from '../components/PlaidLink';

interface Account {
  id: string;
  account_id: string;
  institution_name: string;
  name: string;
  mask: string;
  type: string;
  subtype: string;
  balance_current: number | null;
}

const isLiability = (a: Account) => a.type === 'credit' || a.type === 'loan';
const signedBalance = (a: Account) => {
  const bal = a.balance_current ?? 0;
  return isLiability(a) ? -Math.abs(bal) : bal;
};

const fmt = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

const Accounts: React.FC = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showBalances, setShowBalances] = useState(() => {
    const saved = localStorage.getItem('accounts_show_balances');
    return saved !== null ? saved === 'true' : true;
  });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get<{ accounts: Account[] }>('/api/plaid/accounts');
      setAccounts(res.data.accounts || []);
    } catch {
      setError('Failed to load accounts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggleShowBalances = () => {
    setShowBalances(prev => {
      const next = !prev;
      localStorage.setItem('accounts_show_balances', String(next));
      return next;
    });
  };

  const { totalAssets, totalDebt, netWorth, sorted } = useMemo(() => {
    const assets = accounts.filter(a => !isLiability(a)).reduce((s, a) => s + (a.balance_current ?? 0), 0);
    const debt = accounts.filter(isLiability).reduce((s, a) => s + Math.abs(a.balance_current ?? 0), 0);
    const bySigned = [...accounts].sort((a, b) => signedBalance(b) - signedBalance(a));
    return { totalAssets: assets, totalDebt: debt, netWorth: assets - debt, sorted: bySigned };
  }, [accounts]);

  const getAccountIcon = (a: Account) => {
    if (a.type === 'credit') return <CreditCard className="h-6 w-6" />;
    if (a.type === 'investment') return <Briefcase className="h-6 w-6" />;
    if (a.subtype === 'savings') return <PiggyBank className="h-6 w-6" />;
    return <Building2 className="h-6 w-6" />;
  };

  const getAccountTypeColor = (a: Account) => {
    if (a.type === 'credit' || a.type === 'loan') return 'bg-purple-100 text-purple-800';
    if (a.type === 'investment') return 'bg-amber-100 text-amber-800';
    if (a.subtype === 'savings') return 'bg-green-100 text-green-800';
    return 'bg-blue-100 text-blue-800';
  };

  const typeLabel = (a: Account) =>
    (a.subtype || a.type || 'account').replace(/\b\w/g, c => c.toUpperCase());

  const masked = (v: string) => (showBalances ? v : '••••••');

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Accounts</h1>
        <button
          onClick={toggleShowBalances}
          className="flex items-center px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
        >
          {showBalances ? <Eye className="h-4 w-4 mr-2" /> : <EyeOff className="h-4 w-4 mr-2" />}
          {showBalances ? 'Hide' : 'Show'} Balances
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg p-6 shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Assets</p>
              <p className="text-2xl font-bold text-green-600">{masked(fmt(totalAssets))}</p>
            </div>
            <PiggyBank className="h-10 w-10 text-green-400" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-6 shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Debt</p>
              <p className="text-2xl font-bold text-red-600">{masked(fmt(totalDebt))}</p>
            </div>
            <CreditCard className="h-10 w-10 text-red-400" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-6 shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Net Worth</p>
              <p className={`text-2xl font-bold ${netWorth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {masked(fmt(netWorth))}
              </p>
            </div>
            <Building2 className="h-10 w-10 text-blue-400" />
          </div>
        </div>
      </div>

      {/* Accounts List */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">All Accounts</h2>
          <Link to="/account-snapshot" className="text-sm text-blue-600 hover:text-blue-800">
            Detailed snapshot →
          </Link>
        </div>

        {loading ? (
          <div className="p-10 flex items-center justify-center text-gray-500">
            <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Loading accounts…
          </div>
        ) : error ? (
          <div className="p-10 flex items-center justify-center text-red-600">
            <AlertCircle className="h-5 w-5 mr-2" /> {error}
          </div>
        ) : sorted.length === 0 ? (
          <div className="p-10 text-center text-gray-500">
            No accounts connected yet. Connect one below to get started.
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {sorted.map((account) => {
              const bal = signedBalance(account);
              return (
                <div key={account.id} className="p-6 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className={`p-3 rounded-lg ${getAccountTypeColor(account)}`}>
                        {getAccountIcon(account)}
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">{account.name}</h3>
                        <p className="text-sm text-gray-600">{account.institution_name}</p>
                        {account.mask && <p className="text-xs text-gray-500">****{account.mask}</p>}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className={`text-xl font-bold ${bal < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                        {masked(fmt(bal))}
                      </div>
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full mt-2 ${getAccountTypeColor(account)}`}>
                        {typeLabel(account)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Connect a new account */}
      <div className="bg-white rounded-lg p-6 shadow-sm border">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Connect New Account</h3>
        <PlaidLink onSuccess={load} />
      </div>
    </div>
  );
};

export default Accounts;
