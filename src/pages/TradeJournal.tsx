import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Edit, Filter, Calendar, Plus, Loader2 } from 'lucide-react';
import axios from 'axios';
import NewTradeModal, { TradeFormData } from '../components/NewTradeModal';

const API_BASE = 'http://localhost:3001/api';

interface Trade {
  id: string;
  ticker: string;
  type: 'buy' | 'sell';
  shares: number;
  price: number;
  date: string;
  platform: string;
  rationale: string;
  strategy: string;
}

// API functions
const fetchTrades = async (): Promise<Trade[]> => {
  const { data } = await axios.get(`${API_BASE}/trades`);
  return data;
};

const createTrade = async (trade: TradeFormData): Promise<Trade> => {
  const { data } = await axios.post(`${API_BASE}/trades`, trade);
  return data;
};

const updateTradeRationale = async ({ id, rationale }: { id: string; rationale: string }): Promise<Trade> => {
  const { data } = await axios.patch(`${API_BASE}/trades/${id}`, { rationale });
  return data;
};

const TradeJournal: React.FC = () => {
  const [showAddRationale, setShowAddRationale] = useState<string | null>(null);
  const [rationaleText, setRationaleText] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const queryClient = useQueryClient();

  // Fetch trades
  const { data: trades = [], isLoading, error } = useQuery({
    queryKey: ['trades'],
    queryFn: fetchTrades,
  });

  // Create trade mutation
  const createMutation = useMutation({
    mutationFn: createTrade,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      setIsModalOpen(false);
    },
  });

  // Update rationale mutation
  const updateRationaleMutation = useMutation({
    mutationFn: updateTradeRationale,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      setShowAddRationale(null);
      setRationaleText('');
    },
  });

  const handleSaveRationale = (tradeId: string) => {
    updateRationaleMutation.mutate({ id: tradeId, rationale: rationaleText });
  };

  const handleEditRationale = (tradeId: string, currentRationale: string) => {
    setShowAddRationale(tradeId);
    setRationaleText(currentRationale);
  };

  const handleNewTrade = (tradeData: TradeFormData) => {
    createMutation.mutate(tradeData);
  };

  const getStrategyColor = (strategy: string) => {
    switch (strategy) {
      case 'Trade':
        return 'bg-purple-100 text-purple-800';
      case 'Swing':
        return 'bg-orange-100 text-orange-800';
      case '1 Year':
        return 'bg-blue-100 text-blue-800';
      case '5 Years':
        return 'bg-teal-100 text-teal-800';
      case 'Long':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">Failed to load trades. Please try again.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Trade Journal</h1>
        <div className="flex space-x-3">
          <button className="flex items-center px-4 py-2 border border-gray-300 rounded-md text-gray-600 hover:bg-gray-50">
            <Filter className="h-4 w-4 mr-2" />
            Filter
          </button>
          <button className="flex items-center px-4 py-2 border border-gray-300 rounded-md text-gray-600 hover:bg-gray-50">
            <Calendar className="h-4 w-4 mr-2" />
            Date Range
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Trade
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Security
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Shares
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Price
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Platform
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Strategy
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rationale
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {trades.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                    No trades yet. Click "New Trade" to add your first trade.
                  </td>
                </tr>
              ) : (
                trades.map((trade) => (
                  <React.Fragment key={trade.id}>
                    <tr className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(trade.date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {trade.ticker}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          trade.type === 'buy'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {trade.type.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {trade.shares}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${trade.price.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${(trade.shares * trade.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full capitalize">
                          {trade.platform}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStrategyColor(trade.strategy)}`}>
                          {trade.strategy || 'Long'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {trade.rationale ? (
                          <div className="flex items-start space-x-2">
                            <p className="text-sm text-gray-600 max-w-xs truncate">{trade.rationale}</p>
                            <button
                              onClick={() => handleEditRationale(trade.id, trade.rationale)}
                              className="text-blue-600 hover:text-blue-900"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setShowAddRationale(trade.id)}
                            className="text-red-600 hover:text-red-800 text-sm font-medium"
                          >
                            Add Rationale Required
                          </button>
                        )}
                      </td>
                    </tr>

                    {showAddRationale === trade.id && (
                      <tr>
                        <td colSpan={9} className="px-6 py-4 bg-blue-50">
                          <div className="space-y-3">
                            <label className="block text-sm font-medium text-gray-700">
                              Trade Rationale for {trade.ticker} {trade.type}
                            </label>
                            <textarea
                              value={rationaleText}
                              onChange={(e) => setRationaleText(e.target.value)}
                              placeholder="Explain why you made this trade, your strategy, and expectations..."
                              rows={3}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                            <div className="flex justify-end space-x-3">
                              <button
                                onClick={() => {
                                  setShowAddRationale(null);
                                  setRationaleText('');
                                }}
                                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleSaveRationale(trade.id)}
                                disabled={updateRationaleMutation.isPending}
                                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                              >
                                {updateRationaleMutation.isPending ? 'Saving...' : 'Save Rationale'}
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg p-6 shadow-sm border">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Recent Activity</h3>
          <div className="text-2xl font-bold text-blue-600">{trades.length}</div>
          <div className="text-sm text-gray-600">trades this month</div>
        </div>

        <div className="bg-white rounded-lg p-6 shadow-sm border">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Missing Rationales</h3>
          <div className="text-2xl font-bold text-red-600">
            {trades.filter(trade => !trade.rationale).length}
          </div>
          <div className="text-sm text-gray-600">trades need rationale</div>
        </div>

        <div className="bg-white rounded-lg p-6 shadow-sm border">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Total Volume</h3>
          <div className="text-2xl font-bold text-green-600">
            ${trades.reduce((sum, trade) => sum + (trade.shares * trade.price), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-sm text-gray-600">traded this month</div>
        </div>
      </div>

      {/* New Trade Modal */}
      <NewTradeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleNewTrade}
      />

      {/* Show error toast for failed mutations */}
      {createMutation.isError && (
        <div className="fixed bottom-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          Failed to create trade. Please try again.
        </div>
      )}
    </div>
  );
};

export default TradeJournal;
