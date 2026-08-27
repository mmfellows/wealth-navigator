import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authedFetch } from '../services/authRedirect';
import { fetchBudgetCategories } from '../constants/budgetCategories';
import { Sparkles, Inbox } from 'lucide-react';
import { ReviewCard, QueueItem } from '../components/ReviewCard';

interface CategorizeCounts {
  total: number;
  merchant_rule_applied: number;
  ai_applied: number;
  needs_review: number;
  unprocessed: number;
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
