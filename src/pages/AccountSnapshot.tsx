import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Wallet, TrendingUp, Banknote, PieChart, ArrowUp, ArrowDown, AlertCircle, RefreshCw, CreditCard, GraduationCap, Home } from 'lucide-react';

interface Account {
  id: string;
  item_id: string;
  account_id: string;
  institution_name: string;
  name: string;
  official_name: string;
  mask: string;
  type: string;
  subtype: string;
  balance_current: number | null;
  balance_available: number | null;
  balance_limit: number | null;
  iso_currency_code: string;
  updated_at: string;
}

interface Liability {
  id: string;
  kind: 'credit' | 'student' | 'mortgage';
  account_id: string;
  institution_name: string;
  account_name: string;
  account_subtype: string;
  mask: string;
  balance: number | null;
  apr: number | null;
  min_payment_amount: number | null;
  next_payment_due_date: string | null;
  last_payment_amount: number | null;
  last_payment_date: string | null;
  origination_date: string | null;
  maturity_date: string | null;
  is_overdue: boolean;
  loan_name: string | null;
  loan_type: string | null;
  ytd_interest_paid: number | null;
  ytd_principal_paid: number | null;
}

type SortKey = 'institution_name' | 'name' | 'type' | 'balance';
type SortDir = 'asc' | 'desc';

const fmt = (n: number | null | undefined) => {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
};
const fmtPct = (n: number | null | undefined) => {
  if (n == null || isNaN(n)) return '—';
  return `${n.toFixed(2)}%`;
};

const KIND_META: Record<Liability['kind'], { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  credit: { label: 'Credit Cards', icon: CreditCard },
  student: { label: 'Student Loans', icon: GraduationCap },
  mortgage: { label: 'Mortgages', icon: Home },
};

const AccountSnapshot: React.FC = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [liabilities, setLiabilities] = useState<Liability[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('balance');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const load = async () => {
    setLoading(true);
    try {
      const [acctRes, liabRes] = await Promise.all([
        axios.get<{ accounts: Account[] }>('/api/plaid/accounts'),
        axios.get<{ liabilities: Liability[] }>('/api/plaid/liabilities'),
      ]);
      setAccounts(acctRes.data.accounts || []);
      setLiabilities(liabRes.data.liabilities || []);
    } catch (err) {
      console.error('Failed to load account snapshot:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const triggerSync = async () => {
    setSyncing(true);
    try {
      await axios.post('/api/plaid/sync');
      await load();
    } catch (err) {
      console.error(err);
      alert('Sync failed.');
    } finally {
      setSyncing(false);
    }
  };

  const totals = useMemo(() => {
    let cash = 0, invested = 0, credit = 0, student = 0, mortgage = 0;
    for (const a of accounts) {
      const bal = a.balance_current || 0;
      if (a.type === 'depository') cash += bal;
      else if (a.type === 'investment') invested += bal;
    }
    for (const l of liabilities) {
      const bal = Math.abs(l.balance || 0);
      if (l.kind === 'credit') credit += bal;
      else if (l.kind === 'student') student += bal;
      else if (l.kind === 'mortgage') mortgage += bal;
    }
    const totalAssets = cash + invested;
    const totalLiabilities = credit + student + mortgage;
    return { cash, invested, totalAssets, credit, student, mortgage, totalLiabilities, netWorth: totalAssets - totalLiabilities };
  }, [accounts, liabilities]);

  const sortedAccounts = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...accounts].sort((a, b) => {
      if (sortKey === 'balance') return ((a.balance_current || 0) - (b.balance_current || 0)) * dir;
      const av = String(a[sortKey] || '');
      const bv = String(b[sortKey] || '');
      return av.localeCompare(bv) * dir;
    });
  }, [accounts, sortKey, sortDir]);

  const handleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir(k === 'balance' ? 'desc' : 'asc'); }
  };

  const SortIcon: React.FC<{ column: SortKey }> = ({ column }) => {
    if (sortKey !== column) return null;
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3 inline ml-1" /> : <ArrowDown className="h-3 w-3 inline ml-1" />;
  };

  const liabilitiesByKind = useMemo(() => {
    const out: Record<Liability['kind'], Liability[]> = { credit: [], student: [], mortgage: [] };
    for (const l of liabilities) out[l.kind].push(l);
    return out;
  }, [liabilities]);

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Account Snapshot</h1>
          <p className="text-gray-600 mt-1">Every account, every balance, every liability — live from Plaid.</p>
        </div>
        <button
          onClick={triggerSync}
          disabled={syncing || loading}
          className="inline-flex items-center px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing…' : 'Refresh'}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-5 shadow-sm border">
          <div className="flex items-center gap-2 mb-1"><Wallet className="h-4 w-4 text-blue-600" /><span className="text-xs uppercase tracking-wide text-gray-500">Net Worth</span></div>
          <p className="text-2xl font-bold text-gray-900">{fmt(totals.netWorth)}</p>
        </div>
        <div className="bg-white rounded-lg p-5 shadow-sm border">
          <div className="flex items-center gap-2 mb-1"><Banknote className="h-4 w-4 text-emerald-600" /><span className="text-xs uppercase tracking-wide text-gray-500">Cash</span></div>
          <p className="text-2xl font-bold text-gray-900">{fmt(totals.cash)}</p>
        </div>
        <div className="bg-white rounded-lg p-5 shadow-sm border">
          <div className="flex items-center gap-2 mb-1"><TrendingUp className="h-4 w-4 text-green-600" /><span className="text-xs uppercase tracking-wide text-gray-500">Invested</span></div>
          <p className="text-2xl font-bold text-gray-900">{fmt(totals.invested)}</p>
        </div>
        <div className="bg-white rounded-lg p-5 shadow-sm border">
          <div className="flex items-center gap-2 mb-1"><AlertCircle className="h-4 w-4 text-rose-600" /><span className="text-xs uppercase tracking-wide text-gray-500">Liabilities</span></div>
          <p className="text-2xl font-bold text-gray-900">{fmt(totals.totalLiabilities)}</p>
        </div>
      </div>

      {/* Accounts */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-3">Accounts</h2>
        {loading ? (
          <div className="text-gray-500">Loading…</div>
        ) : accounts.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
            <PieChart className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No accounts connected yet.</p>
            <a href="/investing-settings" className="text-blue-600 hover:underline text-sm mt-2 inline-block">Connect an account</a>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th onClick={() => handleSort('institution_name')} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700">Institution<SortIcon column="institution_name" /></th>
                  <th onClick={() => handleSort('name')} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700">Account<SortIcon column="name" /></th>
                  <th onClick={() => handleSort('type')} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700">Type<SortIcon column="type" /></th>
                  <th onClick={() => handleSort('balance')} className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700">Balance<SortIcon column="balance" /></th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedAccounts.map(a => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-sm font-medium text-gray-900">{a.institution_name}</td>
                    <td className="px-6 py-3 text-sm text-gray-700">
                      {a.name}{a.mask && <span className="text-gray-400 ml-1">···{a.mask}</span>}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-500">
                      <span className="capitalize">{a.type}</span>
                      {a.subtype && <span className="text-gray-400"> · {a.subtype}</span>}
                    </td>
                    <td className="px-6 py-3 text-sm text-right tabular-nums font-medium text-gray-900">{fmt(a.balance_current)}</td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-semibold">
                  <td className="px-6 py-3 text-sm text-gray-900" colSpan={3}>Total</td>
                  <td className="px-6 py-3 text-sm text-right tabular-nums text-gray-900">{fmt(totals.totalAssets)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Liabilities */}
      {liabilities.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Liabilities</h2>
          <div className="space-y-4">
            {(['credit', 'student', 'mortgage'] as const).map(kind => {
              const rows = liabilitiesByKind[kind];
              if (rows.length === 0) return null;
              const Meta = KIND_META[kind];
              const subtotal = rows.reduce((s, l) => s + Math.abs(l.balance || 0), 0);
              return (
                <div key={kind} className="bg-white rounded-lg shadow-sm border overflow-hidden">
                  <div className="px-6 py-3 bg-gray-50 border-b flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Meta.icon className="h-4 w-4 text-gray-600" />
                      <h3 className="font-semibold text-gray-900">{Meta.label}</h3>
                    </div>
                    <div className="text-sm text-gray-700">Subtotal: <span className="font-semibold">{fmt(subtotal)}</span></div>
                  </div>
                  <table className="min-w-full text-sm">
                    <thead className="bg-white border-b">
                      <tr className="text-xs text-gray-500 uppercase">
                        <th className="px-6 py-2 text-left">Account</th>
                        <th className="px-6 py-2 text-right">Balance</th>
                        <th className="px-6 py-2 text-right">APR</th>
                        <th className="px-6 py-2 text-right">Min Payment</th>
                        <th className="px-6 py-2 text-right">Next Due</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {rows.map(l => (
                        <tr key={l.id} className={l.is_overdue ? 'bg-rose-50' : ''}>
                          <td className="px-6 py-3">
                            <div className="font-medium text-gray-900">{l.institution_name}</div>
                            <div className="text-xs text-gray-500">
                              {l.account_name}{l.mask && ` ···${l.mask}`}
                              {l.loan_name && ` · ${l.loan_name}`}
                              {l.loan_type && ` · ${l.loan_type}`}
                            </div>
                          </td>
                          <td className="px-6 py-3 text-right tabular-nums font-medium">{fmt(Math.abs(l.balance || 0))}</td>
                          <td className="px-6 py-3 text-right tabular-nums">{fmtPct(l.apr)}</td>
                          <td className="px-6 py-3 text-right tabular-nums">{fmt(l.min_payment_amount)}</td>
                          <td className="px-6 py-3 text-right text-gray-600">
                            {l.next_payment_due_date || '—'}
                            {l.is_overdue && <div className="text-xs text-rose-600 font-medium">Overdue</div>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountSnapshot;
