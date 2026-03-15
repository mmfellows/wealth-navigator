import React, { useState } from 'react';
import { Search, Plus, Star, TrendingUp, Loader2 } from 'lucide-react';
import axios from 'axios';

const Research: React.FC = () => {
  const [query, setQuery] = useState('');
  const [selectedTicker, setSelectedTicker] = useState('');
  const [searchResult, setSearchResult] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [stockAnalysis, setStockAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) {
      alert('Please enter a search query');
      return;
    }

    setIsSearching(true);
    try {
      const response = await axios.post('http://localhost:3001/api/research/query', {
        query: query
      });
      setSearchResult(response.data.response);
    } catch (error) {
      console.error('Search failed:', error);
      alert('Search failed. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleAnalyze = async () => {
    if (!selectedTicker.trim()) {
      alert('Please enter a ticker symbol');
      return;
    }

    setIsAnalyzing(true);
    try {
      const analysisQuery = `Technical analysis for ${selectedTicker.toUpperCase()}`;
      const response = await axios.post('http://localhost:3001/api/research/query', {
        query: analysisQuery
      });
      setStockAnalysis(response.data.response);
    } catch (error) {
      console.error('Analysis failed:', error);
      alert('Analysis failed. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAddToIdeas = async (ticker: string, category: string) => {
    try {
      const response = await axios.post('http://localhost:3001/api/ideas', {
        ticker: ticker.toUpperCase(),
        name: ticker.toUpperCase(),
        category: category.toLowerCase().replace(' ', '-'),
        notes: `Added from research analysis. Category: ${category}`
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

      <div className="bg-white rounded-lg p-6 shadow-sm border">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">AI Research Assistant</h2>
        <div className="space-y-4">
          <div className="flex space-x-4">
            <div className="flex-1">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask about stocks, market trends, or investment strategies..."
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={isSearching}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {isSearching ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Researching...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Research
                </>
              )}
            </button>
          </div>

          <div className="text-sm text-gray-500">
            Try asking: "What are the best dividend stocks for 2024?" or "Technical analysis for AAPL"
          </div>

          {searchResult && (
            <div className="mt-6 p-4 bg-gray-50 rounded-md border">
              <h3 className="text-lg font-medium text-gray-900 mb-3">Research Results</h3>
              <div className="prose prose-sm max-w-none">
                <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans">{searchResult}</pre>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg p-6 shadow-sm border">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Stock Analysis</h2>
        <div className="space-y-4">
          <div className="flex space-x-4">
            <input
              type="text"
              value={selectedTicker}
              onChange={(e) => setSelectedTicker(e.target.value.toUpperCase())}
              placeholder="Enter stock ticker (e.g., AAPL, MSFT)"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Analyze
                </>
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

      <div className="bg-white rounded-lg p-6 shadow-sm border">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Research History</h2>
        <div className="space-y-3">
          {[
            { query: "Best dividend stocks for retirement", timestamp: "2 hours ago" },
            { query: "Technical analysis for NVDA", timestamp: "1 day ago" },
            { query: "Clean energy ETFs comparison", timestamp: "3 days ago" }
          ].map((item, index) => (
            <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
              <span className="text-gray-900">{item.query}</span>
              <span className="text-sm text-gray-500">{item.timestamp}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Research;