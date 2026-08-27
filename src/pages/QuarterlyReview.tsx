import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authedFetch } from '../services/authRedirect';
import { CalendarRange, CheckCircle2, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';

const fmt = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

interface QuarterSpend { quarter: string; total: number }
interface CategoryAnalysis {
  category: string;
  spend_by_quarter: QuarterSpend[];
  current_quarter_spend: number;
  by_subcategory: Array<{ subcategory: string; total: number }>;
  top_merchants: Array<{ merchant: string; total: number; count: number }>;
  monthly_budget: number | null;
  quarterly_budget: number | null;
}
interface Analysis { quarter: string; quarters: string[]; categories: CategoryAnalysis[] }

type DecisionKind = 'keep' | 'cut' | 'grow';
interface Decision { decision: DecisionKind; target_monthly: string; note: string }

// The last N completed quarters, newest first.
function completedQuarters(n: number): string[] {
  const now = new Date();
  let year = now.getFullYear();
  let q = Math.floor(now.getMonth() / 3); // current quarter is 1-based q+1; last completed is q
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    if (q < 1) { q += 4; year -= 1; }
    out.push(`${year}-Q${q}`);
    q -= 1;
  }
  return out;
}

function CategoryCard({
  cat,
  decision,
  onChange,
}: {
  cat: CategoryAnalysis;
  decision: Decision;
  onChange: (d: Decision) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const maxSpend = Math.max(...cat.spend_by_quarter.map(q => q.total), cat.quarterly_budget || 0, 1);

  return (
    <div className="bg-white rounded-lg shadow-sm border p-4 space-y-3">
      <button onClick={() => setExpanded(e => !e)} className="w-full text-left">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-gray-900 flex items-center gap-1">
            {expanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
            {cat.category}
          </span>
          <span className="text-sm">
            <span className="font-semibold">{fmt(cat.current_quarter_spend)}</span>
            <span className="text-gray-400"> this quarter{cat.quarterly_budget !== null && ` / ${fmt(cat.quarterly_budget)} budgeted`}</span>
          </span>
        </div>
        {/* 4-quarter trend */}
        <div className="flex items-end gap-2 mt-2 h-14">
          {cat.spend_by_quarter.map((q, i) => (
            <div key={q.quarter} className="flex-1 flex flex-col items-center gap-0.5">
              <div
                className={`w-full rounded-t ${i === cat.spend_by_quarter.length - 1 ? 'bg-blue-500' : 'bg-gray-300'}`}
                style={{ height: `${Math.max((q.total / maxSpend) * 44, 2)}px` }}
                title={`${q.quarter}: ${fmt(q.total)}`}
              />
              <span className="text-[10px] text-gray-400">{q.quarter.split('-')[1]}</span>
            </div>
          ))}
        </div>
      </button>

      {expanded && (
        <div className="grid sm:grid-cols-2 gap-4 text-sm border-t pt-3">
          <div>
            <h4 className="font-medium text-gray-700 mb-1">Subcategories</h4>
            {cat.by_subcategory.length === 0 ? (
              <p className="text-gray-400">No spending.</p>
            ) : (
              cat.by_subcategory.map(s => (
                <div key={s.subcategory} className="flex justify-between py-0.5">
                  <span className="text-gray-600 truncate pr-2">{s.subcategory}</span>
                  <span className="font-medium">{fmt(s.total)}</span>
                </div>
              ))
            )}
          </div>
          <div>
            <h4 className="font-medium text-gray-700 mb-1">Top merchants</h4>
            {cat.top_merchants.length === 0 ? (
              <p className="text-gray-400">None.</p>
            ) : (
              cat.top_merchants.map(m => (
                <div key={m.merchant} className="flex justify-between py-0.5">
                  <span className="text-gray-600 truncate pr-2">{m.merchant} <span className="text-gray-400">×{m.count}</span></span>
                  <span className="font-medium">{fmt(m.total)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Decision */}
      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        {(['keep', 'cut', 'grow'] as DecisionKind[]).map(kind => (
          <button
            key={kind}
            onClick={() => onChange({ ...decision, decision: kind })}
            className={`px-3 py-1.5 rounded-full text-sm font-medium capitalize ${
              decision.decision === kind
                ? kind === 'cut' ? 'bg-red-600 text-white' : kind === 'grow' ? 'bg-green-600 text-white' : 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {kind}
          </button>
        ))}
        {decision.decision !== 'keep' && (
          <div className="flex items-center gap-1 text-sm">
            <span className="text-gray-500">target</span>
            <input
              type="number"
              value={decision.target_monthly}
              onChange={e => onChange({ ...decision, target_monthly: e.target.value })}
              className="w-24 border border-gray-300 rounded-md px-2 py-1"
              placeholder={cat.monthly_budget !== null ? String(Math.round(cat.monthly_budget)) : '0'}
            />
            <span className="text-gray-500">/mo</span>
          </div>
        )}
        <input
          type="text"
          value={decision.note}
          onChange={e => onChange({ ...decision, note: e.target.value })}
          placeholder="Note (optional)"
          className="flex-1 min-w-[10rem] border border-gray-300 rounded-md px-2 py-1.5 text-sm"
        />
      </div>
    </div>
  );
}

const QuarterlyReview: React.FC = () => {
  const queryClient = useQueryClient();
  const quarterOptions = useMemo(() => completedQuarters(4), []);
  const [quarter, setQuarter] = useState(quarterOptions[0]);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [notes, setNotes] = useState('');

  const { data: analysis, isLoading } = useQuery<Analysis>({
    queryKey: ['quarter-analysis', quarter],
    queryFn: async () => {
      const res = await authedFetch(`/api/quarter-reviews/analysis?quarter=${quarter}`);
      if (!res.ok) throw new Error('Failed to fetch analysis');
      return res.json();
    },
  });

  const { data: existing } = useQuery({
    queryKey: ['quarter-review', quarter],
    queryFn: async () => {
      const res = await authedFetch(`/api/quarter-reviews/${quarter}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch review');
      return res.json();
    },
  });

  const getDecision = (cat: CategoryAnalysis): Decision =>
    decisions[cat.category] || {
      decision: 'keep',
      target_monthly: cat.monthly_budget !== null ? String(Math.round(cat.monthly_budget)) : '',
      note: '',
    };

  const complete = useMutation({
    mutationFn: async () => {
      const payload = {
        quarter,
        notes,
        decisions: (analysis?.categories || []).map(cat => {
          const d = getDecision(cat);
          return {
            category: cat.category,
            decision: d.decision,
            target_monthly: d.decision !== 'keep' && d.target_monthly !== '' ? Number(d.target_monthly) : undefined,
            note: d.note || undefined,
          };
        }),
      };
      const res = await authedFetch('/api/quarter-reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'Failed to save review');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quarter-review', quarter] });
      queryClient.invalidateQueries({ queryKey: ['envelopes'] });
      queryClient.invalidateQueries({ queryKey: ['quarter-analysis', quarter] });
    },
  });

  const changedCount = (analysis?.categories || [])
    .filter(cat => getDecision(cat).decision !== 'keep').length;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarRange className="h-6 w-6 text-blue-600" /> Quarterly Review
          </h1>
          <p className="text-sm text-gray-500">
            Walk every category: what you actually spent, then keep, cut, or grow it for next quarter. Cut/grow targets rescale that category's budget items, so pacing updates immediately.
          </p>
        </div>
        <select
          value={quarter}
          onChange={e => { setQuarter(e.target.value); setDecisions({}); setNotes(''); }}
          className="border border-gray-300 rounded-md px-3 py-2"
        >
          {quarterOptions.map(q => <option key={q} value={q}>{q}</option>)}
        </select>
      </div>

      {existing && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800 flex items-start gap-2">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <div>
            Review for {quarter} completed on {String(existing.completed_at).substring(0, 10)}
            {' '}({existing.decisions?.filter((d: any) => d.decision !== 'keep').length || 0} change{existing.decisions?.filter((d: any) => d.decision !== 'keep').length === 1 ? '' : 's'}).
            Submitting again revises it.
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-gray-500 py-8 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" /> Analyzing the quarter…
        </div>
      ) : (
        <>
          {(analysis?.categories || []).map(cat => (
            <CategoryCard
              key={cat.category}
              cat={cat}
              decision={getDecision(cat)}
              onChange={d => setDecisions(prev => ({ ...prev, [cat.category]: d }))}
            />
          ))}

          <div className="bg-white rounded-lg shadow-sm border p-4 space-y-3">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Overall notes for this quarter (optional)…"
              rows={2}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
            {complete.isError && (
              <div className="text-sm text-red-600">{(complete.error as Error).message}</div>
            )}
            {complete.isSuccess && (
              <div className="text-sm text-green-700">Review saved — budgets updated where you chose cut or grow.</div>
            )}
            <button
              onClick={() => complete.mutate()}
              disabled={complete.isLoading || !analysis}
              className="flex items-center gap-2 px-5 py-2.5 rounded-md bg-blue-600 text-white font-medium disabled:bg-gray-300"
            >
              {complete.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Complete review ({changedCount} change{changedCount === 1 ? '' : 's'})
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default QuarterlyReview;
