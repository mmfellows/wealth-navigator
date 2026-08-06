import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { PiggyBank, CreditCard, Building2, Briefcase, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import PlaidLink from '../components/PlaidLink';
import { Card, CardHeader, Button, StatCard } from '../components/ui';
import { everPill } from '../lib/categoryColors';
import { cn } from '../lib/cn';

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
        <h1 className="text-2xl font-extrabold tracking-tight text-ever-ink md:text-[26px]">Accounts</h1>
        <Button variant="ghost" onClick={toggleShowBalances}>
          {showBalances ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          {showBalances ? 'Hide' : 'Show'} Balances
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total Assets" value={masked(fmt(totalAssets))} dot="var(--ever-pos)" />
        <StatCard
          label="Total Debt"
          value={<span className="text-ever-neg">{masked(fmt(totalDebt))}</span>}
          dot="var(--ever-neg)"
        />
        <StatCard
          label="Net Worth"
          value={<span className={netWorth < 0 ? 'text-ever-neg' : undefined}>{masked(fmt(netWorth))}</span>}
          dot={netWorth >= 0 ? 'var(--ever-pos)' : 'var(--ever-neg)'}
        />
      </div>

      {/* Accounts List */}
      <Card>
        <CardHeader
          title="All Accounts"
          right={
            <Link to="/account-snapshot" className="font-mono text-[10.5px] text-ever-lime hover:underline">
              Detailed snapshot →
            </Link>
          }
        />

        {loading ? (
          <div className="flex items-center justify-center py-10 text-ever-dim">
            <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Loading accounts…
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-10 text-ever-neg">
            <AlertCircle className="h-5 w-5 mr-2" /> {error}
          </div>
        ) : sorted.length === 0 ? (
          <div className="py-10 text-center text-ever-dim">
            No accounts connected yet. Connect one below to get started.
          </div>
        ) : (
          <div>
            {sorted.map((account) => {
              const bal = signedBalance(account);
              return (
                <div
                  key={account.id}
                  className="flex items-center justify-between gap-4 border-t border-ever-line py-4 first:border-t-0"
                >
                  <div className="flex items-center space-x-4">
                    <div className={cn('p-3 rounded-lg', everPill(getAccountTypeColor(account)))}>
                      {getAccountIcon(account)}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-ever-ink">{account.name}</h3>
                      <p className="text-sm text-ever-dim">{account.institution_name}</p>
                      {account.mask && <p className="text-xs text-ever-faint">****{account.mask}</p>}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className={cn('text-xl font-bold tabular-nums', bal < 0 ? 'text-ever-neg' : 'text-ever-ink')}>
                      {masked(fmt(bal))}
                    </div>
                    <span className={cn('inline-flex px-2 py-1 text-xs font-medium rounded-full mt-2', everPill(getAccountTypeColor(account)))}>
                      {typeLabel(account)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Connect a new account */}
      <Card>
        <CardHeader title="Connect New Account" />
        <PlaidLink onSuccess={load} />
      </Card>
    </div>
  );
};

export default Accounts;
