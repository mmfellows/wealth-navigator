import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Plus, X, CheckCircle, Edit2, Trash2, Target, Clock, Archive, AlertCircle } from 'lucide-react';

type BetType = 'Long' | 'Mid' | 'Short' | 'Core';
type BetStatus = 'planned' | 'active' | 'closed';

interface Bet {
  id: string;
  name: string;
  type: BetType;
  tickers: string[];
  buy_date: string | null;
  target_sell_date: string | null;
  actual_sell_date: string | null;
  thesis: string;
  status: BetStatus;
  is_synthetic: boolean;
  created_at: string;
  updated_at: string;
}

const TYPE_DESCRIPTIONS: Record<BetType, string> = {
  Long: 'Long Bet — multi-year hold, conviction-driven',
  Mid: 'Mid Bet — months to a couple years',
  Short: 'Short / Speculative Bet — opportunistic, asymmetric upside',
  Core: 'Core / Long-term — auto-bucketed retirement holdings',
};

const TYPE_COLORS: Record<BetType, string> = {
  Long: 'bg-blue-50 text-blue-700 border-blue-200',
  Mid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Short: 'bg-amber-50 text-amber-700 border-amber-200',
  Core: 'bg-gray-50 text-gray-700 border-gray-200',
};

const emptyForm = {
  name: '',
  type: 'Long' as BetType,
  tickers: '',
  buy_date: '',
  target_sell_date: '',
  thesis: '',
  status: 'active' as BetStatus,
};

const Bets: React.FC = () => {
  const [bets, setBets] = useState<Bet[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'active' | 'planned' | 'closed'>('active');
  const [editing, setEditing] = useState<Bet | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await axios.get<Bet[]>('/api/bets');
      setBets(res.data);
    } catch (err) {
      console.error('Failed to load bets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (tab === 'active') return bets.filter(b => b.status === 'active');
    if (tab === 'planned') return bets.filter(b => b.status === 'planned');
    return bets.filter(b => b.status === 'closed');
  }, [bets, tab]);

  const tabCounts = useMemo(() => ({
    active: bets.filter(b => b.status === 'active').length,
    planned: bets.filter(b => b.status === 'planned').length,
    closed: bets.filter(b => b.status === 'closed').length,
  }), [bets]);

  const startCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setSubmitError(null);
    setShowForm(true);
  };

  const startEdit = (bet: Bet) => {
    setEditing(bet);
    setForm({
      name: bet.name,
      type: bet.type,
      tickers: bet.tickers.join(', '),
      buy_date: bet.buy_date || '',
      target_sell_date: bet.target_sell_date || '',
      thesis: bet.thesis || '',
      status: bet.status,
    });
    setSubmitError(null);
    setShowForm(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    const tickers = form.tickers
      .split(/[,\s]+/)
      .map(t => t.trim().toUpperCase())
      .filter(Boolean);

    const payload = {
      name: form.name.trim(),
      type: form.type,
      tickers,
      buy_date: form.buy_date || null,
      target_sell_date: form.target_sell_date || null,
      thesis: form.thesis,
      status: form.status,
    };

    try {
      if (editing) {
        await axios.put(`/api/bets/${editing.id}`, payload);
      } else {
        await axios.post('/api/bets', payload);
      }
      setShowForm(false);
      load();
    } catch (err: any) {
      setSubmitError(err.response?.data?.error || 'Failed to save bet');
    }
  };

  const closeBet = async (bet: Bet) => {
    if (!confirm(`Close "${bet.name}"? Use this when you've sold the position.`)) return;
    await axios.post(`/api/bets/${bet.id}/close`);
    load();
  };

  const deleteBet = async (bet: Bet) => {
    if (!confirm(`Delete "${bet.name}"? Closing is usually preferable so you keep the audit trail.`)) return;
    await axios.delete(`/api/bets/${bet.id}`);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Bets</h1>
          <p className="text-gray-600 mt-1">Your investment thesis layer — Long, Mid, and Short bets backed by holdings.</p>
        </div>
        <button
          onClick={startCreate}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          <Plus className="h-4 w-4 mr-2" /> New Bet
        </button>
      </div>

      <div className="flex gap-2">
        {(['active', 'planned', 'closed'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-md text-sm font-medium ${
              tab === t ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {t === 'active' && <Target className="h-4 w-4 mr-1 inline" />}
            {t === 'planned' && <Clock className="h-4 w-4 mr-1 inline" />}
            {t === 'closed' && <Archive className="h-4 w-4 mr-1 inline" />}
            {t.charAt(0).toUpperCase() + t.slice(1)} ({tabCounts[t]})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-gray-500">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-lg border border-dashed border-gray-300 p-12 text-center text-gray-500">
          No {tab} bets yet. {tab === 'active' && 'Create one to start tracking your thesis against real holdings.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(bet => (
            <div key={bet.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-semibold text-gray-900">{bet.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${TYPE_COLORS[bet.type]}`}>
                      {bet.type}
                    </span>
                    {bet.is_synthetic && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                        Auto
                      </span>
                    )}
                  </div>
                  {bet.tickers.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {bet.tickers.map(t => (
                        <span key={t} className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-1 ml-2">
                  <button onClick={() => startEdit(bet)} title="Edit" className="p-1.5 text-gray-400 hover:text-gray-600">
                    <Edit2 className="h-4 w-4" />
                  </button>
                  {!bet.is_synthetic && bet.status !== 'closed' && (
                    <button onClick={() => closeBet(bet)} title="Close" className="p-1.5 text-gray-400 hover:text-green-600">
                      <CheckCircle className="h-4 w-4" />
                    </button>
                  )}
                  {!bet.is_synthetic && (
                    <button onClick={() => deleteBet(bet)} title="Delete" className="p-1.5 text-gray-400 hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {bet.thesis && <p className="text-sm text-gray-600 mb-3">{bet.thesis}</p>}

              <div className="text-xs text-gray-500 space-y-0.5">
                {bet.buy_date && <div>Bought: {bet.buy_date}</div>}
                {bet.target_sell_date && <div>Target sell: {bet.target_sell_date}</div>}
                {bet.actual_sell_date && <div>Closed: {bet.actual_sell_date}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-semibold">{editing ? 'Edit Bet' : 'New Bet'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={submit} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. AI Infrastructure"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={form.type}
                  onChange={e => setForm({ ...form, type: e.target.value as BetType })}
                  disabled={editing?.is_synthetic}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Long">Long</option>
                  <option value="Mid">Mid</option>
                  <option value="Short">Short / Speculative</option>
                  {editing?.is_synthetic && <option value="Core">Core</option>}
                </select>
                <p className="text-xs text-gray-500 mt-1">{TYPE_DESCRIPTIONS[form.type]}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tickers <span className="text-gray-400 font-normal">(comma- or space-separated)</span>
                </label>
                <input
                  type="text"
                  value={form.tickers}
                  onChange={e => setForm({ ...form, tickers: e.target.value })}
                  placeholder="NVDA, AVGO, AMD"
                  disabled={editing?.is_synthetic}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Buy date</label>
                  <input
                    type="date"
                    value={form.buy_date}
                    onChange={e => setForm({ ...form, buy_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Target sell date</label>
                  <input
                    type="date"
                    value={form.target_sell_date}
                    onChange={e => setForm({ ...form, target_sell_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={e => setForm({ ...form, status: e.target.value as BetStatus })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                >
                  <option value="active">Active — I hold positions for this</option>
                  <option value="planned">Planned — committed thesis, not yet bought</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Thesis</label>
                <textarea
                  rows={4}
                  value={form.thesis}
                  onChange={e => setForm({ ...form, thesis: e.target.value })}
                  placeholder="Why this bet? What's the catalyst, time horizon, exit condition?"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {submitError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700"
                >
                  {editing ? 'Save' : 'Create Bet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Bets;
