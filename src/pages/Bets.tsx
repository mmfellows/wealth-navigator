import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Plus, X, CheckCircle, Edit2, Trash2, Target, Clock, Archive, AlertCircle } from 'lucide-react';
import { Card, Button } from '../components/ui';
import { cn } from '../lib/cn';

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

// Evergreen bet-type accents: violet lead, teal, orange, sand — distinguished by text color.
const TYPE_COLORS: Record<BetType, string> = {
  Long: 'bg-white/5 text-ever-violet border-ever-line',
  Mid: 'bg-white/5 text-ever-teal border-ever-line',
  Short: 'bg-white/5 text-ever-orange border-ever-line',
  Core: 'bg-white/5 text-ever-dim border-ever-line',
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
          <h1 className="text-2xl font-extrabold tracking-tight text-ever-ink md:text-[26px]">Bets</h1>
          <p className="mt-1 text-sm text-ever-dim">Your investment thesis layer — Long, Mid, and Short bets backed by holdings.</p>
        </div>
        <Button onClick={startCreate}>
          <Plus className="h-4 w-4" /> New Bet
        </Button>
      </div>

      <div className="flex gap-2">
        {(['active', 'planned', 'closed'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-2 rounded-md text-sm font-medium transition',
              tab === t
                ? 'bg-ever-lime text-ever-lime-ink'
                : 'border border-ever-line text-ever-dim hover:text-ever-ink',
            )}
          >
            {t === 'active' && <Target className="h-4 w-4 mr-1 inline" />}
            {t === 'planned' && <Clock className="h-4 w-4 mr-1 inline" />}
            {t === 'closed' && <Archive className="h-4 w-4 mr-1 inline" />}
            {t.charAt(0).toUpperCase() + t.slice(1)} ({tabCounts[t]})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-ever-dim">Loading...</div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed p-12 text-center text-ever-dim">
          No {tab} bets yet. {tab === 'active' && 'Create one to start tracking your thesis against real holdings.'}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(bet => (
            <Card key={bet.id}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-semibold text-ever-ink">{bet.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${TYPE_COLORS[bet.type]}`}>
                      {bet.type}
                    </span>
                    {bet.is_synthetic && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-ever-violet border border-ever-line">
                        Auto
                      </span>
                    )}
                  </div>
                  {bet.tickers.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {bet.tickers.map(t => (
                        <span key={t} className="text-xs font-mono bg-ever-track text-ever-dim px-2 py-0.5 rounded">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-1 ml-2">
                  <button onClick={() => startEdit(bet)} title="Edit" className="p-1.5 text-ever-faint hover:text-ever-ink">
                    <Edit2 className="h-4 w-4" />
                  </button>
                  {!bet.is_synthetic && bet.status !== 'closed' && (
                    <button onClick={() => closeBet(bet)} title="Close" className="p-1.5 text-ever-faint hover:text-ever-pos">
                      <CheckCircle className="h-4 w-4" />
                    </button>
                  )}
                  {!bet.is_synthetic && (
                    <button onClick={() => deleteBet(bet)} title="Delete" className="p-1.5 text-ever-faint hover:text-ever-neg">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {bet.thesis && <p className="text-sm text-ever-dim mb-3">{bet.thesis}</p>}

              <div className="text-xs text-ever-dim space-y-0.5">
                {bet.buy_date && <div>Bought: {bet.buy_date}</div>}
                {bet.target_sell_date && <div>Target sell: {bet.target_sell_date}</div>}
                {bet.actual_sell_date && <div>Closed: {bet.actual_sell_date}</div>}
              </div>
            </Card>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-ever-card border border-ever-line rounded-ever text-ever-ink w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-ever-line">
              <h2 className="text-lg font-semibold text-ever-ink">{editing ? 'Edit Bet' : 'New Bet'}</h2>
              <button onClick={() => setShowForm(false)} className="text-ever-dim hover:text-ever-ink">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={submit} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-ever-dim mb-1">Name</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. AI Infrastructure"
                  className="w-full px-3 py-2 bg-ever-bg border border-ever-line text-ever-ink placeholder-ever-faint rounded-lg focus:outline-none focus:border-ever-lime"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-ever-dim mb-1">Type</label>
                <select
                  value={form.type}
                  onChange={e => setForm({ ...form, type: e.target.value as BetType })}
                  disabled={editing?.is_synthetic}
                  className="w-full px-3 py-2 bg-ever-bg border border-ever-line text-ever-ink rounded-lg focus:outline-none focus:border-ever-lime"
                >
                  <option value="Long">Long</option>
                  <option value="Mid">Mid</option>
                  <option value="Short">Short / Speculative</option>
                  {editing?.is_synthetic && <option value="Core">Core</option>}
                </select>
                <p className="text-xs text-ever-dim mt-1">{TYPE_DESCRIPTIONS[form.type]}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-ever-dim mb-1">
                  Tickers <span className="text-ever-faint font-normal">(comma- or space-separated)</span>
                </label>
                <input
                  type="text"
                  value={form.tickers}
                  onChange={e => setForm({ ...form, tickers: e.target.value })}
                  placeholder="NVDA, AVGO, AMD"
                  disabled={editing?.is_synthetic}
                  className="w-full px-3 py-2 bg-ever-bg border border-ever-line text-ever-ink placeholder-ever-faint rounded-lg focus:outline-none focus:border-ever-lime font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-ever-dim mb-1">Buy date</label>
                  <input
                    type="date"
                    value={form.buy_date}
                    onChange={e => setForm({ ...form, buy_date: e.target.value })}
                    className="w-full px-3 py-2 bg-ever-bg border border-ever-line text-ever-ink rounded-lg focus:outline-none focus:border-ever-lime"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ever-dim mb-1">Target sell date</label>
                  <input
                    type="date"
                    value={form.target_sell_date}
                    onChange={e => setForm({ ...form, target_sell_date: e.target.value })}
                    className="w-full px-3 py-2 bg-ever-bg border border-ever-line text-ever-ink rounded-lg focus:outline-none focus:border-ever-lime"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-ever-dim mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={e => setForm({ ...form, status: e.target.value as BetStatus })}
                  className="w-full px-3 py-2 bg-ever-bg border border-ever-line text-ever-ink rounded-lg focus:outline-none focus:border-ever-lime"
                >
                  <option value="active">Active — I hold positions for this</option>
                  <option value="planned">Planned — committed thesis, not yet bought</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-ever-dim mb-1">Thesis</label>
                <textarea
                  rows={4}
                  value={form.thesis}
                  onChange={e => setForm({ ...form, thesis: e.target.value })}
                  placeholder="Why this bet? What's the catalyst, time horizon, exit condition?"
                  className="w-full px-3 py-2 bg-ever-bg border border-ever-line text-ever-ink placeholder-ever-faint rounded-lg focus:outline-none focus:border-ever-lime"
                />
              </div>

              {submitError && (
                <div className="flex items-start gap-2 p-3 bg-white/5 border border-ever-line rounded text-sm text-ever-neg">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  {editing ? 'Save' : 'Create Bet'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Bets;
