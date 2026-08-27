import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authedFetch } from '../services/authRedirect';
import { fetchBudgetCategories } from '../constants/budgetCategories';
import { Sparkles, ArrowLeftRight, SkipForward, Check, Inbox } from 'lucide-react';

interface Suggestion {
  category: string;
  subcategory: string;
}

interface QueueItem {
  id: string;
  date: string;
  merchant: string | null;
  description: string | null;
  amount: number;
  account: string | null;
  needs_review?: boolean;
  ai_question?: string | null;
  ai_suggestions?: Suggestion[] | null;
  ai_confidence?: number | null;
}

interface CategorizeCounts {
  total: number;
  merchant_rule_applied: number;
  ai_applied: number;
  needs_review: number;
  unprocessed: number;
}

const fmtAmount = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

// One review card: the AI's question, tap-to-accept suggestions, and
// fallbacks (manual pick / transfer / skip). Mobile-first — used standalone
// and inside the monthly close.
function ReviewCard({
  item,
  categories,
  onResolve,
}: {
  item: QueueItem;
  categories: Record<string, string[]>;
  onResolve: (id: string, body: Record<string, unknown>) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [mainCat, setMainCat] = useState('');
  const [subCat, setSubCat] = useState('');

  const question =
    item.ai_question || `How should "${item.merchant || item.description}" be categorized?`;
  const suggestions = item.ai_suggestions || [];

  return (
    <div className="bg-white rounded-lg shadow p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-gray-900 truncate">{item.merchant || '(no merchant)'}</div>
          <div className="text-sm text-gray-500">
            {item.date} · {item.account || 'Unknown account'}
            {item.description && item.description !== item.merchant && (
              <span className="block truncate">{item.description}</span>
            )}
          </div>
        </div>
        <div className="font-semibold text-gray-900 whitespace-nowrap">{fmtAmount(item.amount)}</div>
      </div>

      <p className="text-sm text-gray-700">{question}</p>

      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => onResolve(item.id, { category: s.category, subcategory: s.subcategory })}
              className="flex items-center gap-1 px-3 py-2 rounded-md bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100 active:bg-blue-200"
            >
              <Check className="h-4 w-4" />
              {s.category} · {s.subcategory}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {!showPicker ? (
          <button
            onClick={() => setShowPicker(true)}
            className="px-3 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Other category…
          </button>
        ) : (
          <div className="flex flex-wrap gap-2 items-center w-full">
            <select
              value={mainCat}
              onChange={e => { setMainCat(e.target.value); setSubCat(''); }}
              className="border border-gray-300 rounded-md px-2 py-2 flex-1 min-w-[8rem]"
            >
              <option value="">Category…</option>
              {Object.keys(categories).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={subCat}
              onChange={e => setSubCat(e.target.value)}
              disabled={!mainCat}
              className="border border-gray-300 rounded-md px-2 py-2 flex-1 min-w-[8rem] disabled:bg-gray-100"
            >
              <option value="">Subcategory…</option>
              {(categories[mainCat] || []).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button
              onClick={() => onResolve(item.id, { category: mainCat, subcategory: subCat || null })}
              disabled={!mainCat}
              className="px-3 py-2 rounded-md bg-blue-600 text-white font-medium disabled:bg-gray-300"
            >
              Apply
            </button>
          </div>
        )}
        <div className="flex gap-2 ml-auto">
          <button
            onClick={() => onResolve(item.id, { is_transfer: true })}
            className="flex items-center gap-1 px-3 py-2 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50"
            title="Mark as a transfer (excluded from spending)"
          >
            <ArrowLeftRight className="h-4 w-4" /> Transfer
          </button>
          <button
            onClick={() => onResolve(item.id, { skip: true })}
            className="flex items-center gap-1 px-3 py-2 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50"
            title="Acknowledge and leave uncategorized"
          >
            <SkipForward className="h-4 w-4" /> Skip
          </button>
        </div>
      </div>
    </div>
  );
}

const ReviewQueue: React.FC = () => {
  const queryClient = useQueryClient();
  const [lastRun, setLastRun] = useState<CategorizeCounts | null>(null);

  const { data: queueData, isLoading } = useQuery({
    queryKey: ['review-queue'],
    queryFn: async () => {
      const response = await authedFetch('/api/expenses/review-queue');
      if (!response.ok) throw new Error('Failed to fetch review queue');
      return response.json() as Promise<{ queue: QueueItem[]; total: number }>;
    },
  });

  const { data: categories = {} } = useQuery({
    queryKey: ['budget-categories'],
    queryFn: fetchBudgetCategories,
  });

  const categorize = useMutation({
    mutationFn: async () => {
      const response = await authedFetch('/api/expenses/categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || 'Failed to run AI categorization');
      }
      return response.json() as Promise<CategorizeCounts>;
    },
    onSuccess: counts => {
      setLastRun(counts);
      queryClient.invalidateQueries({ queryKey: ['review-queue'] });
    },
  });

  const resolve = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => {
      const response = await authedFetch(`/api/expenses/${id}/resolve-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error('Failed to resolve');
      return response.json();
    },
    // Optimistically drop the card so tagging feels instant on mobile.
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: ['review-queue'] });
      const prev = queryClient.getQueryData<{ queue: QueueItem[]; total: number }>(['review-queue']);
      if (prev) {
        queryClient.setQueryData(['review-queue'], {
          queue: prev.queue.filter(q => q.id !== id),
          total: prev.total - 1,
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['review-queue'], ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['review-queue'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    },
  });

  const queue = queueData?.queue || [];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Review Queue</h1>
          <p className="text-sm text-gray-500">
            {isLoading ? 'Loading…' : `${queue.length} transaction${queue.length === 1 ? '' : 's'} need your input`}
          </p>
        </div>
        <button
          onClick={() => categorize.mutate()}
          disabled={categorize.isLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:bg-blue-300"
        >
          <Sparkles className="h-4 w-4" />
          {categorize.isLoading ? 'Categorizing…' : 'Run AI categorization'}
        </button>
      </div>

      {categorize.isError && (
        <div className="bg-red-50 text-red-700 text-sm rounded-md p-3">
          {(categorize.error as Error).message}
        </div>
      )}
      {lastRun && (
        <div className="bg-green-50 text-green-800 text-sm rounded-md p-3">
          AI pass: {lastRun.ai_applied} categorized, {lastRun.merchant_rule_applied} matched saved
          rules, {lastRun.needs_review} queued for review
          {lastRun.unprocessed > 0 && `, ${lastRun.unprocessed} unprocessed`}.
        </div>
      )}

      {!isLoading && queue.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-10 text-center text-gray-500">
          <Inbox className="h-10 w-10 mx-auto mb-3 text-gray-300" />
          All caught up — every transaction is categorized.
        </div>
      ) : (
        queue.map(item => (
          <ReviewCard
            key={item.id}
            item={item}
            categories={categories}
            onResolve={(id, body) => resolve.mutate({ id, body })}
          />
        ))
      )}
    </div>
  );
};

export default ReviewQueue;
