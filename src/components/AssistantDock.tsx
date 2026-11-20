import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Sparkles, X, Send, PenSquare, Loader2, ExternalLink } from 'lucide-react';
import { authedFetch } from '../services/authRedirect';
import Markdown from './Markdown';
import { cn } from '../lib/cn';

interface Source { url: string; title: string }
interface Turn { role: 'user' | 'assistant'; content: string; sources?: Source[] }

const STORAGE_KEY = 'wn_assistant_thread';

const TOOL_LABELS: Record<string, string> = {
  web_search: 'Searching the web…',
  query_transactions: 'Looking at your transactions…',
  get_category_stats: 'Checking your spending by category…',
  get_budgets: 'Reading your budget…',
  get_snapshot: 'Checking your balances…',
  get_bets: 'Looking at your investments…',
  get_recurring_costs: 'Checking your recurring costs…',
  get_trips: 'Looking at your past trips…',
  get_year_plan: 'Reading your year plan…',
  create_trip: 'Adding the trip…',
  add_special_expense: 'Adding the expense…',
};

const PAGE_NAMES: Record<string, string> = {
  '/': 'Investing dashboard', '/reports': 'Spending dashboard', '/pacing': 'Pacing', '/budgets': 'Budgets',
  '/year-plan': 'Year Plan', '/expenses': 'Expenses', '/trips': 'Trips', '/plan': 'Planner', '/chat': 'Finance Chat',
  '/portfolio': 'Portfolio', '/holdings': 'Holdings', '/bets': 'Bets', '/research': 'Research', '/quarterly': 'Quarterly review',
};

const STARTERS = [
  'Help me budget a ski trip to Austria',
  'What would a week in Japan cost me, based on how I travel?',
  'Is there room in my 2027 plan for a $3,000 purchase?',
];

function loadThread(): Turn[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };

// A chat with Claude that is reachable from every page: a button in the
// corner opens a side panel. The conversation survives moving between pages
// (and a reload, for the browser session) until "New chat" clears it.
export function AssistantDock() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState<Turn[]>(loadThread);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState<string | null>(null);
  const [activity, setActivity] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = streaming !== null;
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(thread.slice(-40))); } catch { /* storage unavailable */ }
  }, [thread]);

  // Keep the newest text in view while it streams.
  useEffect(() => {
    if (open) scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [open, thread, streaming, activity]);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  // Cmd/Ctrl+K toggles the panel from anywhere; Escape closes it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(v => !v);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
        launcher.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const ask = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setError(null);
    setDraft('');
    const prior = thread;
    setThread(prev => [...prev, { role: 'user', content: q }]);
    setStreaming('');
    setActivity('Thinking…');

    try {
      const res = await authedFetch('/api/assistant/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          history: prior.map(t => ({ role: t.role, content: t.content })),
          page: PAGE_NAMES[location.pathname] || location.pathname,
        }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'That request failed. Please try again.');
      }

      // SSE frames: `data: {json}\n\n`.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let textSoFar = '';
      let final: { response: string; sources: Source[] } | null = null;
      let changed = false;

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
            textSoFar += event.text;
            setStreaming(textSoFar);
            setActivity(null);
          } else if (event.type === 'tool') {
            setActivity(TOOL_LABELS[event.name] || 'Looking things up…');
          } else if (event.type === 'changed') {
            changed = true;
          } else if (event.type === 'done') {
            final = { response: event.response || textSoFar, sources: event.sources || [] };
          } else if (event.type === 'error') {
            throw new Error(event.message);
          }
        }
      }

      const answer = (final?.response ?? textSoFar).trim();
      if (!answer) throw new Error('No answer came back. Please try again.');
      setThread(prev => [...prev, { role: 'assistant', content: answer, sources: final?.sources }]);
      // If the assistant added a trip or an expense, the pages showing those must refresh.
      if (changed) ['trips', 'trip', 'year-plan', 'plan-gaps', 'planned-costs', 'envelopes'].forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
    } catch (err) {
      setError((err as Error).message);
      // Put the question back so it isn't lost.
      setThread(prev => prev.slice(0, -1));
      setDraft(q);
    } finally {
      setStreaming(null);
      setActivity(null);
    }
  };

  const newChat = () => {
    if (busy) return;
    setThread([]);
    setError(null);
    input.current?.focus();
  };

  return (
    <>
      <button
        ref={launcher}
        onClick={() => setOpen(true)}
        className={cn(
          'fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-ever-lime px-4 py-3 text-sm font-semibold text-ever-lime-ink shadow-xl transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-white',
          open && 'pointer-events-none opacity-0',
        )}
        aria-label="Ask Claude"
        aria-expanded={open}
        title="Ask Claude (Cmd/Ctrl+K)"
      >
        <Sparkles className="h-4 w-4" />
        <span className="hidden sm:inline">Ask Claude</span>
      </button>

      {open && (
        <aside
          role="dialog"
          aria-label="Ask Claude"
          className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-ever-line bg-ever-card shadow-2xl sm:w-[440px]"
        >
          <header className="flex items-center justify-between gap-2 border-b border-ever-line px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-ever-ink">
              <Sparkles className="h-4 w-4 text-ever-lime" /> Ask Claude
            </div>
            <div className="flex items-center gap-1">
              <button onClick={newChat} disabled={busy || thread.length === 0} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-ever-dim hover:bg-white/10 hover:text-ever-ink disabled:opacity-40" title="Start a new chat">
                <PenSquare className="h-3.5 w-3.5" /> New chat
              </button>
              <button onClick={() => { setOpen(false); launcher.current?.focus(); }} className="rounded-md p-1.5 text-ever-dim hover:bg-white/10 hover:text-ever-ink" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
            {thread.length === 0 && !busy && (
              <div className="pt-4">
                <p className="text-sm text-ever-ink">Ask anything while you work. I can search the web and I know your spending, budgets, trips and year plan.</p>
                <div className="mt-4 space-y-2">
                  {STARTERS.map(s => (
                    <button key={s} onClick={() => ask(s)} className="block w-full rounded-[11px] border border-ever-line px-3 py-2.5 text-left text-sm text-ever-dim hover:border-ever-lime hover:text-ever-ink">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {thread.map((t, i) => (
              t.role === 'user' ? (
                <div key={i} className="ml-8 rounded-[11px] bg-white/10 px-3 py-2 text-sm text-ever-ink whitespace-pre-wrap">{t.content}</div>
              ) : (
                <div key={i} className="text-sm text-ever-ink">
                  <Markdown text={t.content} />
                  {t.sources && t.sources.length > 0 && (
                    <div className="mt-2 border-t border-ever-line pt-2">
                      <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ever-dim">Sources</div>
                      <ul className="space-y-0.5">
                        {t.sources.map(s => (
                          <li key={s.url}>
                            <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 text-xs text-ever-lime hover:underline">
                              <ExternalLink className="h-3 w-3 flex-none" />
                              <span className="truncate">{s.title || hostOf(s.url)}</span>
                              <span className="flex-none text-ever-faint">{hostOf(s.url)}</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )
            ))}

            {busy && (
              <div className="text-sm text-ever-ink">
                {streaming && <Markdown text={streaming} />}
                {activity && (
                  <div className="mt-1 flex items-center gap-2 text-xs text-ever-dim" role="status">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> {activity}
                  </div>
                )}
              </div>
            )}

            {error && <p role="alert" className="rounded-[11px] border border-ever-line px-3 py-2 text-sm text-ever-neg">{error}</p>}
          </div>

          <form
            className="border-t border-ever-line p-3"
            onSubmit={e => { e.preventDefault(); ask(draft); }}
          >
            <div className="flex items-end gap-2">
              <textarea
                ref={input}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(draft); } }}
                rows={Math.min(6, Math.max(1, draft.split('\n').length))}
                placeholder="Ask a question…"
                aria-label="Message"
                className="max-h-40 flex-1 resize-none rounded-[11px] border border-ever-line bg-ever-bg px-3 py-2.5 text-sm text-ever-ink placeholder-ever-faint focus:border-ever-lime focus:outline-none"
              />
              <button type="submit" disabled={busy || !draft.trim()} className="flex-none rounded-[11px] bg-ever-lime p-2.5 text-ever-lime-ink transition hover:brightness-95 disabled:opacity-40" aria-label="Send">
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-ever-faint">Enter to send, Shift+Enter for a new line. It only adds things to the app when you ask it to.</p>
          </form>
        </aside>
      )}
    </>
  );
}
