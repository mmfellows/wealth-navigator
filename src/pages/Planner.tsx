import React, { useCallback, useEffect, useRef, useState } from 'react';
import { authedFetch } from '../services/authRedirect';
import { Card, StatCard, fmtUSD, fmtPct, toast } from '../components/ui';
import Markdown from '../components/Markdown';
import ProjectionChart, { ProjectionScenario } from '../components/charts/ProjectionChart';
import {
  Compass, Loader2, Send, AlertCircle, Database, Plus, Trash2, MessageSquare, Sparkles, User,
} from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  scenarios?: ProjectionScenario[];
}

interface ConversationSummary {
  id: string;
  title: string;
  updated_at: string;
  turns: number;
}

interface PlanningProfile {
  current_age?: number;
  target_retirement_age?: number;
  retirement_annual_spend?: number;
  retirement_annual_income?: number;
  risk_tolerance?: string;
  target_net_worth?: number;
  goals?: { name: string; amount: number; year?: number }[];
  notes?: string;
}

interface Baseline {
  net_worth: number;
  cash: number;
  investments: { total: number; taxable: number; retirement: number };
  liabilities: { total: number };
  cash_flow: {
    monthly_savings_estimate: number;
    windows: { m3: Window; m6: Window; m12: Window };
  };
  net_worth_history: { change: { delta: number; avg_monthly_delta: number; from_month: string; to_month: string } | null };
  profile: PlanningProfile;
}
interface Window { months: number; avg_income: number; avg_spend: number; avg_taxes: number; avg_net: number; savings_rate: number | null }

const TOOL_LABELS: Record<string, string> = {
  get_planning_baseline: 'Pulling your baseline…',
  run_projection: 'Running the projection…',
  compare_scenarios: 'Comparing scenarios…',
  solve_for_goal: 'Solving for the goal…',
  get_planning_profile: 'Reading your profile…',
  save_planning_profile: 'Saving to your profile…',
  query_transactions: 'Looking through transactions…',
  get_category_stats: 'Crunching category stats…',
  get_budgets: 'Reading budgets…',
  get_snapshot: 'Checking the balance sheet…',
  get_bets: 'Reviewing investment bets…',
  get_recurring_costs: 'Scanning recurring costs…',
};

const STARTERS = [
  'Where will I be in 10 years if I keep saving at this rate?',
  'Compare conservative, moderate and aggressive over 20 years',
  'When could I stop working if I need $120k a year?',
  'How much do I need to save each month to hit $3M by 55?',
];

const relTime = (iso: string) => {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

// Parse a `data: {json}\n\n` SSE body from fetch and hand each event over.
async function readSse(res: Response, onEvent: (event: Record<string, unknown> & { type: string }) => void) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() || '';
    for (const frame of frames) {
      const line = frame.split('\n').find(l => l.startsWith('data: '));
      if (!line) continue;
      try { onEvent(JSON.parse(line.slice(6))); } catch { /* skip malformed frame */ }
    }
  }
}

function profileSummary(p: PlanningProfile | undefined): string[] {
  if (!p) return [];
  const bits: string[] = [];
  if (p.current_age) bits.push(`Age ${p.current_age}`);
  if (p.target_retirement_age) bits.push(`Retire at ${p.target_retirement_age}`);
  if (p.retirement_annual_spend) bits.push(`${fmtUSD(p.retirement_annual_spend, { compact: true })}/yr in retirement`);
  if (p.target_net_worth) bits.push(`Target ${fmtUSD(p.target_net_worth, { compact: true })}`);
  if (p.risk_tolerance) bits.push(`${p.risk_tolerance[0].toUpperCase()}${p.risk_tolerance.slice(1)} risk`);
  if (p.goals?.length) bits.push(`${p.goals.length} goal${p.goals.length === 1 ? '' : 's'}`);
  return bits;
}

const Planner: React.FC = () => {
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [baselineError, setBaselineError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [thread, setThread] = useState<ChatMessage[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [query, setQuery] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [streamingScenarios, setStreamingScenarios] = useState<ProjectionScenario[]>([]);
  const [activity, setActivity] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<PlanningProfile>({});
  const threadEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const loadConversations = useCallback(async () => {
    try {
      const res = await authedFetch('/api/planning/conversations?limit=30');
      if (res.ok) setConversations(await res.json());
    } catch { /* best-effort */ }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await authedFetch('/api/planning/baseline');
        if (!res.ok) throw new Error('Could not load your planning baseline.');
        const b: Baseline = await res.json();
        setBaseline(b);
        setProfile(b.profile || {});
      } catch (err) {
        setBaselineError((err as Error).message);
      }
    })();
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [thread, streamingText, streamingScenarios]);

  const openConversation = async (id: string) => {
    if (isAsking) return;
    setActiveId(id);
    setError(null);
    setLoadingThread(true);
    try {
      const res = await authedFetch(`/api/planning/conversations/${id}`);
      if (!res.ok) throw new Error('Could not load that conversation.');
      const c = await res.json();
      setThread((c.messages || []).map((m: ChatMessage) => ({ role: m.role, content: m.content, scenarios: m.scenarios })));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingThread(false);
    }
  };

  const newConversation = () => {
    if (isAsking) return;
    setActiveId(null);
    setThread([]);
    setError(null);
    inputRef.current?.focus();
  };

  const removeConversation = async (id: string) => {
    try {
      const res = await authedFetch(`/api/planning/conversations/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setConversations(prev => prev.filter(c => c.id !== id));
      if (activeId === id) newConversation();
      toast.success('Conversation deleted');
    } catch {
      toast.error('Could not delete the conversation');
    }
  };

  const ask = async (text?: string) => {
    const q = (text ?? query).trim();
    if (!q || isAsking) return;
    setIsAsking(true);
    setError(null);
    setQuery('');
    setThread(prev => [...prev, { role: 'user', content: q }]);
    setStreamingText('');
    setStreamingScenarios([]);

    let collected = '';
    let finalText: string | null = null;
    const scenarios: ProjectionScenario[] = [];
    let conversationId = activeId;

    try {
      const res = await authedFetch('/api/planning/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, conversation_id: activeId }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || body?.error || 'Request failed. Please try again.');
      }

      await readSse(res, (event) => {
        switch (event.type) {
          case 'conversation':
            conversationId = event.id as string;
            setActiveId(conversationId);
            break;
          case 'text':
            collected += event.text as string;
            setStreamingText(collected);
            setActivity(null);
            break;
          case 'tool':
            setActivity(TOOL_LABELS[event.name as string] || 'Looking things up…');
            break;
          case 'scenario':
            scenarios.push(...(event.scenarios as ProjectionScenario[]));
            setStreamingScenarios([...scenarios]);
            setActivity(null);
            break;
          case 'profile':
            setProfile(event.profile as PlanningProfile);
            break;
          case 'done':
            finalText = (event.response as string) || collected;
            break;
          case 'error':
            throw new Error(event.message as string);
        }
      });

      const answer = (finalText ?? collected).trim();
      if (!answer) throw new Error('No response received. Please try again.');
      setThread(prev => [...prev, { role: 'assistant', content: answer, scenarios: scenarios.length ? scenarios : undefined }]);
      loadConversations();
    } catch (err) {
      setError((err as Error).message);
      setThread(prev => prev.slice(0, -1));
    } finally {
      setStreamingText(null);
      setStreamingScenarios([]);
      setActivity(null);
      setIsAsking(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      ask();
    }
  };

  const m6 = baseline?.cash_flow.windows.m6;
  const savingsRate = m6?.savings_rate != null ? m6.savings_rate * 100 : null;
  const trend = baseline?.net_worth_history.change;
  const profileBits = profileSummary(profile);

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-ever-ink flex items-center gap-2">
            <Compass className="h-7 w-7 text-ever-lime" /> Planner
          </h1>
          <p className="text-sm text-ever-dim mt-1">
            Talk through your financial future. It starts from your live numbers and runs scenarios — different savings rates, risk levels, retirement dates, big purchases — with a Monte Carlo fan so you see the spread, not just one line.
          </p>
        </div>
        {profileBits.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap font-mono text-[10.5px] tracking-wide text-ever-dim">
            <User className="h-3.5 w-3.5 text-ever-lime" />
            {profileBits.map(b => <span key={b} className="rounded-pill border border-ever-line px-2 py-0.5">{b}</span>)}
          </div>
        )}
      </div>

      {baselineError ? (
        <div className="bg-ever-orange/10 border border-ever-orange/30 rounded-lg p-3 text-sm text-ever-orange flex items-center gap-2">
          <AlertCircle className="h-4 w-4" /> {baselineError}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Net worth"
            value={baseline ? fmtUSD(baseline.net_worth, { compact: true }) : '…'}
            sub={trend ? `${trend.delta >= 0 ? '+' : ''}${fmtUSD(trend.delta, { compact: true })} since ${trend.from_month}` : 'No history yet'}
          />
          <StatCard
            label="Invested"
            value={baseline ? fmtUSD(baseline.investments.total, { compact: true }) : '…'}
            sub={baseline ? `${fmtUSD(baseline.investments.taxable, { compact: true })} taxable · ${fmtUSD(baseline.investments.retirement, { compact: true })} retirement` : undefined}
            dot="var(--ever-violet)"
          />
          <StatCard
            label="Saving / month"
            value={baseline ? fmtUSD(baseline.cash_flow.monthly_savings_estimate, { compact: true }) : '…'}
            sub={m6 ? `6-mo avg · income ${fmtUSD(m6.avg_income, { compact: true })}, spend ${fmtUSD(m6.avg_spend, { compact: true })}` : undefined}
            dot={baseline && baseline.cash_flow.monthly_savings_estimate < 0 ? 'var(--ever-neg)' : 'var(--ever-pos)'}
          />
          <StatCard
            label="Savings rate"
            value={savingsRate != null ? fmtPct(savingsRate, 0) : '—'}
            sub={baseline ? `cash ${fmtUSD(baseline.cash, { compact: true })} · debt ${fmtUSD(baseline.liabilities.total, { compact: true })}` : undefined}
            dot="var(--ever-teal)"
          />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[15rem_1fr] gap-4">
        {/* Conversations */}
        <Card className="p-3 md:max-h-[42rem] flex flex-col">
          <button
            onClick={newConversation}
            disabled={isAsking}
            className="w-full flex items-center justify-center gap-2 rounded-[11px] bg-ever-lime text-ever-lime-ink text-sm font-semibold px-3 py-2 hover:brightness-95 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> New conversation
          </button>
          <div className="mt-3 space-y-1 overflow-y-auto flex-1 max-h-48 md:max-h-none">
            {conversations.length === 0 && (
              <div className="text-xs text-ever-dim px-1 py-2">Your conversations will show up here so you can pick them back up.</div>
            )}
            {conversations.map(c => (
              <div
                key={c.id}
                className={`group flex items-start gap-2 rounded-[10px] px-2 py-2 cursor-pointer transition ${c.id === activeId ? 'bg-white/10' : 'hover:bg-white/5'}`}
                onClick={() => openConversation(c.id)}
              >
                <MessageSquare className={`h-4 w-4 mt-0.5 flex-shrink-0 ${c.id === activeId ? 'text-ever-lime' : 'text-ever-faint'}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] text-ever-ink leading-snug line-clamp-2">{c.title}</div>
                  <div className="font-mono text-[10px] text-ever-dim mt-0.5">{relTime(c.updated_at)} · {Math.round(c.turns / 2)} turn{c.turns === 2 ? '' : 's'}</div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); removeConversation(c.id); }}
                  className="opacity-0 group-hover:opacity-100 text-ever-faint hover:text-ever-neg p-0.5"
                  title="Delete conversation"
                  aria-label="Delete conversation"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </Card>

        {/* Thread */}
        <Card className="p-4 md:p-5 flex flex-col min-h-[32rem]">
          {error && (
            <div className="bg-ever-orange/10 border border-ever-orange/30 rounded-lg p-3 mb-3 flex items-start gap-2 text-sm text-ever-orange">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" /> {error}
            </div>
          )}

          <div className="flex-1 overflow-y-auto pr-1 space-y-4 max-h-[36rem]">
            {loadingThread ? (
              <div className="flex items-center gap-2 text-sm text-ever-dim"><Loader2 className="h-4 w-4 animate-spin" /> Loading conversation…</div>
            ) : thread.length === 0 && streamingText === null ? (
              <div className="h-full flex flex-col justify-center">
                <div className="text-sm text-ever-dim mb-3 flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-ever-lime" /> Some places to start</div>
                <div className="grid sm:grid-cols-2 gap-2">
                  {STARTERS.map(s => (
                    <button
                      key={s}
                      onClick={() => ask(s)}
                      className="text-left text-[13px] text-ever-ink rounded-[11px] border border-ever-line px-3 py-2.5 hover:bg-white/5 hover:border-ever-lime/50 transition"
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <div className="text-xs text-ever-dim mt-4">
                  Tell it durable facts as you go — your age, when you'd like to stop working, what you'd spend — and it can save them to your profile so the next conversation starts there.
                </div>
              </div>
            ) : (
              <>
                {thread.map((m, i) => <MessageBubble key={i} message={m} />)}
                {streamingText !== null && (
                  <div className="space-y-3 max-w-[96%]">
                    {streamingScenarios.length > 0 && (
                      <div className="rounded-[14px] border border-ever-line bg-white/[0.03] p-3">
                        <ProjectionChart scenarios={streamingScenarios} />
                      </div>
                    )}
                    <div className="bg-white/5 border border-ever-line rounded-[14px] px-4 py-3">
                      {streamingText && <Markdown text={streamingText} className="text-sm text-ever-ink" />}
                      <div className="flex items-center gap-2 text-sm text-ever-dim mt-1">
                        {activity ? (
                          <><Database className="h-4 w-4 animate-pulse" /> {activity}</>
                        ) : !streamingText ? (
                          <><Loader2 className="h-4 w-4 animate-spin" /> Thinking…</>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={threadEndRef} />
          </div>

          <div className="mt-4 flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              rows={2}
              placeholder={thread.length ? 'Ask a follow-up, or change an assumption…' : 'e.g. What if I bumped savings to $6k a month and went aggressive?'}
              className="flex-1 min-w-0 px-4 py-2.5 bg-ever-bg border border-ever-line rounded-[11px] text-sm text-ever-ink placeholder-ever-faint focus:ring-2 focus:ring-ever-lime focus:border-ever-lime resize-none"
            />
            <button
              onClick={() => ask()}
              disabled={isAsking || !query.trim()}
              className="px-4 py-2.5 h-[3.25rem] bg-ever-lime text-ever-lime-ink rounded-[11px] hover:brightness-95 disabled:opacity-50 flex items-center gap-2 font-semibold text-sm"
            >
              {isAsking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              <span className="hidden sm:inline">{isAsking ? 'Working…' : 'Send'}</span>
            </button>
          </div>
          <div className="text-[11px] text-ever-faint mt-2">
            Projections use long-run planning assumptions, not forecasts. Not licensed financial or tax advice.
          </div>
        </Card>
      </div>
    </div>
  );
};

const MessageBubble: React.FC<{ message: ChatMessage }> = ({ message: m }) => {
  if (m.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="bg-ever-lime text-ever-lime-ink rounded-[14px] px-4 py-2 max-w-[80%] text-sm whitespace-pre-wrap">{m.content}</div>
      </div>
    );
  }
  return (
    <div className="space-y-3 max-w-[96%]">
      {m.scenarios && m.scenarios.length > 0 && (
        <div className="rounded-[14px] border border-ever-line bg-white/[0.03] p-3">
          <ProjectionChart scenarios={m.scenarios} />
        </div>
      )}
      <div className="bg-white/5 border border-ever-line rounded-[14px] px-4 py-3">
        <Markdown text={m.content} className="text-sm text-ever-ink" />
      </div>
    </div>
  );
};

export default Planner;
