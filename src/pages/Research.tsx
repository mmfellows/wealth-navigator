import React, { useEffect, useRef, useState } from 'react';
import { Search, Plus, TrendingUp, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import axios from 'axios';

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

interface HistoryItem {
  query: string;
  response: string;
  created_at: string;
}

const relTime = (iso: string) => {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const Research: React.FC = () => {
  const [query, setQuery] = useState('');
  const [thread, setThread] = useState<ChatTurn[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  const [selectedTicker, setSelectedTicker] = useState('');
  const [stockAnalysis, setStockAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [expandedHistory, setExpandedHistory] = useState<number | null>(null);

  const threadEndRef = useRef<HTMLDivElement>(null);

  const loadHistory = async () => {
    try {
      const res = await axios.get<HistoryItem[]>('/api/research/history?limit=20');
      setHistory(res.data || []);
    } catch (err) {
      console.error('Failed to load research history:', err);
    }
  };

  useEffect(() => { loadHistory(); }, []);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread]);

  const ask = async (q: string, withThread: boolean): Promise<string | null> => {
    setConfigError(null);
    try {
      const res = await axios.post('/api/research/query', {
        query: q,
        history: withThread ? thread : [],
      });
      loadHistory();
      return res.data.response as string;
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = error as any;
      if (e?.response?.status === 503) {
        setConfigError(e.response.data?.detail || 'AI research is not configured.');
      } else {
        setConfigError('Request failed. Please try again.');
      }
      return null;
    }
  };

  const handleSearch = async () => {
    const q = query.trim();
    if (!q || isSearching) return;
    setIsSearching(true);
    setThread(prev => [...prev, { role: 'user', content: q }]);
    setQuery('');
    const answer = await ask(q, true);
    if (answer != null) {
      setThread(prev => [...prev, { role: 'assistant', content: answer }]);
    } else {
      setThread(prev => prev.slice(0, -1));
    }
    setIsSearching(false);
  };

  const handleAnalyze = async () => {
    const ticker = selectedTicker.trim().toUpperCase();
    if (!ticker || isAnalyzing) return;
    setIsAnalyzing(true);
    const answer = await ask(
      `Give me a research overview of ${ticker}: business model, competitive position, key risks, valuation context, and how it relates to my current portfolio exposure.`,
      false,
    );
    if (answer != null) setStockAnalysis(answer);
    setIsAnalyzing(false);
  };

  const handleAddToIdeas = async (ticker: string, category: string) => {
    try {
      await axios.post('/api/ideas', {
        ticker: ticker.toUpperCase(),
        name: ticker.toUpperCase(),
        category: category.toLowerCase().replace(' ', '-'),
        notes: `Added from research analysis. Category: ${category}`,
      });
      alert(`${ticker} has been added to your ${category} ideas!`);
    } catch (error) {
      console.error('Failed to add to ideas:', error);
      alert('Failed to add to ideas. Please try again.');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Research</h1>
      </div>

      {configError && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">{configError}</div>
        </div>
      )}

      {/* AI research chat */}
      <div className="bg-white rounded-lg p-6 shadow-sm border">
        <h2 className="text-xl font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-blue-600" /> Research Assistant
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Ask about tickers, theses, or your own exposure — it sees your live portfolio and bets.
        </p>

        {thread.length > 0 && (
          <div className="space-y-4 mb-4 max-h-[32rem] overflow-y-auto pr-1">
            {thread.map((turn, i) => (
              <div key={i} className={turn.role === 'user' ? 'flex justify-end' : ''}>
                <div
                  className={
                    turn.role === 'user'
                      ? 'bg-blue-600 text-white rounded-lg px-4 py-2 max-w-[80%] text-sm'
                      : 'bg-gray-50 border rounded-lg px-4 py-3 max-w-[95%]'
                  }
                >
                  {turn.role === 'user' ? (
                    turn.content
                  ) : (
                    <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans">{turn.content}</pre>
                  )}
                </div>
              </div>
            ))}
            {isSearching && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
              </div>
            )}
            <div ref={threadEndRef} />
          </div>
        )}

        <div className="flex space-x-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder={thread.length ? 'Ask a follow-up…' : 'Ask about stocks, your exposure, or a thesis…'}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <button
            onClick={handleSearch}
            disabled={isSearching}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            {isSearching ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Researching…</>
            ) : (
              <><Search className="h-4 w-4 mr-2" /> Ask</>
            )}
          </button>
          {thread.length > 0 && (
            <button
              onClick={() => setThread([])}
              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-800"
              title="Start a new conversation"
            >
              Clear
            </button>
          )}
        </div>
        <div className="text-sm text-gray-500 mt-2">
          Try: "How concentrated am I in solar?" or "What would change your view on my IIPR thesis?"
        </div>
      </div>

      {/* Single-ticker analysis */}
      <div className="bg-white rounded-lg p-6 shadow-sm border">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Stock Analysis</h2>
        <div className="space-y-4">
          <div className="flex space-x-4">
            <input
              type="text"
              value={selectedTicker}
              onChange={(e) => setSelectedTicker(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
              placeholder="Enter stock ticker (e.g., AAPL, MSFT)"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {isAnalyzing ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analyzing…</>
              ) : (
                <><TrendingUp className="h-4 w-4 mr-2" /> Analyze</>
              )}
            </button>
          </div>

          {selectedTicker && stockAnalysis && (
            <div className="mt-6 p-4 border border-gray-200 rounded-md bg-gray-50">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium">{selectedTicker} Analysis</h3>
                <div className="flex space-x-2">
                  {['Low Risk', 'Growth', 'Speculative'].map((category) => (
                    <button
                      key={category}
                      onClick={() => handleAddToIdeas(selectedTicker, category)}
                      className="px-3 py-1 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 text-sm flex items-center"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add to {category}
                    </button>
                  ))}
                </div>
              </div>
              <div className="prose prose-sm max-w-none">
                <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans">{stockAnalysis}</pre>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Research history — real, persisted server-side */}
      <div className="bg-white rounded-lg p-6 shadow-sm border">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Research History</h2>
        {history.length === 0 ? (
          <div className="text-sm text-gray-500">No research queries yet.</div>
        ) : (
          <div className="space-y-3">
            {history.map((item, index) => (
              <div key={index} className="bg-gray-50 rounded-md">
                <button
                  className="w-full flex items-center justify-between p-3 text-left"
                  onClick={() => setExpandedHistory(expandedHistory === index ? null : index)}
                >
                  <span className="text-gray-900 truncate pr-4">{item.query}</span>
                  <span className="text-sm text-gray-500 flex-shrink-0">{relTime(item.created_at)}</span>
                </button>
                {expandedHistory === index && (
                  <div className="px-3 pb-3">
                    <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans border-t pt-3">{item.response}</pre>
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

export default Research;
