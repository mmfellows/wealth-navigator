import { useEffect, useRef, useState } from 'react';
import { authedFetch } from '../services/authRedirect';
import { Sparkles, Loader2, Send, AlertCircle, Database } from 'lucide-react';

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

interface HistoryItem {
  query: string;
  response: string;
  created_at: string;
}

const TOOL_LABELS: Record<string, string> = {
  query_transactions: 'Looking through transactions…',
  get_category_stats: 'Crunching category stats…',
  get_budgets: 'Reading budgets…',
  get_snapshot: 'Checking the balance sheet…',
  get_bets: 'Reviewing investment bets…',
};

const relTime = (iso: string) => {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

const FinanceChat: React.FC = () => {
  const [query, setQuery] = useState('');
  const [thread, setThread] = useState<ChatTurn[]>([]);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [activity, setActivity] = useState<string | null>(null);
  const [isAsking, setIsAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [expandedHistory, setExpandedHistory] = useState<number | null>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const loadHistory = async () => {
    try {
      const res = await authedFetch('/api/finance-chat/history?limit=20');
      if (res.ok) setHistory(await res.json());
    } catch {
      // history is best-effort
    }
  };

  useEffect(() => { loadHistory(); }, []);
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread, streamingText]);

  const ask = async () => {
    const q = query.trim();
    if (!q || isAsking) return;
    setIsAsking(true);
    setError(null);
    setQuery('');
    const priorThread = thread;
    setThread(prev => [...prev, { role: 'user', content: q }]);
    setStreamingText('');

    try {
      const res = await authedFetch('/api/finance-chat/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, history: priorThread }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || body?.error || 'Request failed. Please try again.');
      }

      // Parse the SSE stream: `data: {json}\n\n` frames.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let text = '';
      let finalText: string | null = null;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() || '';
        for (const frame of frames) {
          const line = frame.split('\n').find(l => l.startsWith('data: '));
          if (!line) continue;
          let event: any;
          try { event = JSON.parse(line.slice(6)); } catch { continue; }
          if (event.type === 'text') {
            text += event.text;
            setStreamingText(text);
            setActivity(null);
          } else if (event.type === 'tool') {
            setActivity(TOOL_LABELS[event.name] || 'Looking things up…');
          } else if (event.type === 'done') {
            finalText = event.response || text;
          } else if (event.type === 'error') {
            throw new Error(event.message);
          }
        }
      }

      const answer = (finalText ?? text).trim();
      if (!answer) throw new Error('No response received. Please try again.');
      setThread(prev => [...prev, { role: 'assistant', content: answer }]);
      loadHistory();
    } catch (err) {
      setError((err as Error).message);
      setThread(prev => prev.slice(0, -1));
    } finally {
      setStreamingText(null);
      setActivity(null);
      setIsAsking(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-ever-ink">Finance Chat</h1>
        <p className="text-sm text-ever-dim">
          Ask about your spending, budgets, taxes, or how it all fits with your investments — it can query your live data.
        </p>
      </div>

      {error && (
        <div className="bg-ever-orange/10 border border-ever-orange/30 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-ever-orange flex-shrink-0 mt-0.5" />
          <div className="text-sm text-ever-orange">{error}</div>
        </div>
      )}

      <div className="bg-ever-card rounded-ever p-4 md:p-6 border border-ever-line">
        {(thread.length > 0 || streamingText !== null) && (
          <div className="space-y-4 mb-4 max-h-[32rem] overflow-y-auto pr-1">
            {thread.map((turn, i) => (
              <div key={i} className={turn.role === 'user' ? 'flex justify-end' : ''}>
                <div
                  className={
                    turn.role === 'user'
                      ? 'bg-ever-lime text-ever-lime-ink rounded-lg px-4 py-2 max-w-[80%] text-sm'
                      : 'bg-white/5 border border-ever-line rounded-lg px-4 py-3 max-w-[95%]'
                  }
                >
                  {turn.role === 'user' ? (
                    turn.content
                  ) : (
                    <pre className="whitespace-pre-wrap text-sm text-ever-ink font-sans">{turn.content}</pre>
                  )}
                </div>
              </div>
            ))}
            {streamingText !== null && (
              <div className="bg-white/5 border border-ever-line rounded-lg px-4 py-3 max-w-[95%]">
                {streamingText ? (
                  <pre className="whitespace-pre-wrap text-sm text-ever-ink font-sans">{streamingText}</pre>
                ) : null}
                <div className="flex items-center gap-2 text-sm text-ever-dim mt-1">
                  {activity ? (
                    <><Database className="h-4 w-4 animate-pulse" /> {activity}</>
                  ) : !streamingText ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Thinking…</>
                  ) : null}
                </div>
              </div>
            )}
            <div ref={threadEndRef} />
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && ask()}
            placeholder={thread.length ? 'Ask a follow-up…' : 'e.g. Where could I cut $500/month?'}
            className="flex-1 min-w-0 px-4 py-2 bg-ever-bg border border-ever-line rounded-md text-ever-ink placeholder-ever-faint focus:ring-2 focus:ring-ever-lime focus:border-ever-lime"
          />
          <button
            onClick={ask}
            disabled={isAsking}
            className="px-4 md:px-6 py-2 bg-ever-lime text-ever-lime-ink rounded-md hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
          >
            {isAsking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span className="hidden sm:inline">{isAsking ? 'Working…' : 'Ask'}</span>
          </button>
          {thread.length > 0 && !isAsking && (
            <button
              onClick={() => setThread([])}
              className="px-2 py-2 text-sm text-ever-dim hover:text-ever-ink"
              title="Start a new conversation"
            >
              Clear
            </button>
          )}
        </div>
        <div className="text-xs md:text-sm text-ever-dim mt-2 flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          Try: "Am I spending more than I make?" · "What subscriptions am I paying for?" · "Tax implications if I sell a bet?"
        </div>
      </div>

      <div className="bg-ever-card rounded-ever p-4 md:p-6 border border-ever-line">
        <h2 className="text-lg font-semibold text-ever-ink mb-4">History</h2>
        {history.length === 0 ? (
          <div className="text-sm text-ever-dim">No conversations yet.</div>
        ) : (
          <div className="space-y-3">
            {history.map((item, index) => (
              <div key={index} className="bg-white/5 rounded-md">
                <button
                  className="w-full flex items-center justify-between p-3 text-left"
                  onClick={() => setExpandedHistory(expandedHistory === index ? null : index)}
                >
                  <span className="text-ever-ink truncate pr-4">{item.query}</span>
                  <span className="text-sm text-ever-dim flex-shrink-0">{relTime(item.created_at)}</span>
                </button>
                {expandedHistory === index && (
                  <div className="px-3 pb-3">
                    <pre className="whitespace-pre-wrap text-sm text-ever-dim font-sans border-t border-ever-line pt-3">{item.response}</pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default FinanceChat;
