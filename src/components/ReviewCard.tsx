import { useState } from 'react';
import { ArrowLeftRight, SkipForward, Check } from 'lucide-react';

export interface Suggestion {
  category: string;
  subcategory: string;
}

export interface QueueItem {
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

const fmtAmount = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

// One review card: the AI's question, tap-to-accept suggestions, and
// fallbacks (manual pick / transfer / skip). Mobile-first — used by the
// standalone review queue and the monthly close wizard.
export function ReviewCard({
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
