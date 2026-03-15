import React, { useState } from 'react';
import { X } from 'lucide-react';

interface NewTradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (trade: TradeFormData) => void;
}

export interface TradeFormData {
  date: string;
  ticker: string;
  type: 'buy' | 'sell';
  shares: number;
  price: number;
  platform: string;
  rationale: string;
  strategy: string;
}

const STRATEGIES = ['Trade', 'Swing', '1 Year', '5 Years', 'Long'] as const;
const PLATFORMS = ['etrade', 'schwab', 'chase', 'fidelity', 'robinhood', 'vanguard'] as const;

const NewTradeModal: React.FC<NewTradeModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [formData, setFormData] = useState<TradeFormData>({
    date: new Date().toISOString().split('T')[0],
    ticker: '',
    type: 'buy',
    shares: 0,
    price: 0,
    platform: 'etrade',
    rationale: '',
    strategy: 'Long',
  });

  const [errors, setErrors] = useState<Partial<Record<keyof TradeFormData, string>>>({});

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof TradeFormData, string>> = {};

    if (!formData.date) newErrors.date = 'Date is required';
    if (!formData.ticker.trim()) newErrors.ticker = 'Ticker symbol is required';
    if (formData.shares <= 0) newErrors.shares = 'Shares must be greater than 0';
    if (formData.price <= 0) newErrors.price = 'Price must be greater than 0';
    if (!formData.platform) newErrors.platform = 'Platform is required';
    if (!formData.strategy) newErrors.strategy = 'Strategy is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      onSubmit({
        ...formData,
        ticker: formData.ticker.toUpperCase(),
      });
      // Reset form
      setFormData({
        date: new Date().toISOString().split('T')[0],
        ticker: '',
        type: 'buy',
        shares: 0,
        price: 0,
        platform: 'etrade',
        rationale: '',
        strategy: 'Long',
      });
      setErrors({});
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'shares' || name === 'price' ? parseFloat(value) || 0 : value,
    }));
    // Clear error when field is edited
    if (errors[name as keyof TradeFormData]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  if (!isOpen) return null;

  const total = formData.shares * formData.price;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative w-full max-w-lg transform rounded-lg bg-white shadow-xl transition-all">
          {/* Header */}
          <div className="flex items-center justify-between border-b px-6 py-4">
            <h2 className="text-xl font-semibold text-gray-900">New Trade</h2>
            <button
              onClick={onClose}
              className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6">
            <div className="space-y-4">
              {/* Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date of Purchase
                </label>
                <input
                  type="date"
                  name="date"
                  value={formData.date}
                  onChange={handleChange}
                  className={`w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.date ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {errors.date && <p className="mt-1 text-sm text-red-500">{errors.date}</p>}
              </div>

              {/* Ticker and Action Row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ticker Symbol
                  </label>
                  <input
                    type="text"
                    name="ticker"
                    value={formData.ticker}
                    onChange={handleChange}
                    placeholder="AAPL"
                    className={`w-full rounded-md border px-3 py-2 uppercase focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.ticker ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {errors.ticker && <p className="mt-1 text-sm text-red-500">{errors.ticker}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Action</label>
                  <select
                    name="type"
                    value={formData.type}
                    onChange={handleChange}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="buy">Buy</option>
                    <option value="sell">Sell</option>
                  </select>
                </div>
              </div>

              {/* Shares and Price Row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Shares</label>
                  <input
                    type="number"
                    name="shares"
                    value={formData.shares || ''}
                    onChange={handleChange}
                    placeholder="0"
                    step="0.0001"
                    min="0"
                    className={`w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.shares ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {errors.shares && <p className="mt-1 text-sm text-red-500">{errors.shares}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Price Paid
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-gray-500">$</span>
                    <input
                      type="number"
                      name="price"
                      value={formData.price || ''}
                      onChange={handleChange}
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                      className={`w-full rounded-md border px-3 py-2 pl-7 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        errors.price ? 'border-red-500' : 'border-gray-300'
                      }`}
                    />
                  </div>
                  {errors.price && <p className="mt-1 text-sm text-red-500">{errors.price}</p>}
                </div>
              </div>

              {/* Total Display */}
              {total > 0 && (
                <div className="rounded-md bg-gray-50 px-4 py-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Total Value</span>
                    <span className="font-semibold text-gray-900">
                      ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              )}

              {/* Platform and Strategy Row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Platform</label>
                  <select
                    name="platform"
                    value={formData.platform}
                    onChange={handleChange}
                    className={`w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.platform ? 'border-red-500' : 'border-gray-300'
                    }`}
                  >
                    {PLATFORMS.map((platform) => (
                      <option key={platform} value={platform}>
                        {platform.charAt(0).toUpperCase() + platform.slice(1)}
                      </option>
                    ))}
                  </select>
                  {errors.platform && (
                    <p className="mt-1 text-sm text-red-500">{errors.platform}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Strategy</label>
                  <select
                    name="strategy"
                    value={formData.strategy}
                    onChange={handleChange}
                    className={`w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.strategy ? 'border-red-500' : 'border-gray-300'
                    }`}
                  >
                    {STRATEGIES.map((strategy) => (
                      <option key={strategy} value={strategy}>
                        {strategy}
                      </option>
                    ))}
                  </select>
                  {errors.strategy && (
                    <p className="mt-1 text-sm text-red-500">{errors.strategy}</p>
                  )}
                </div>
              </div>

              {/* Rationale */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rationale <span className="text-gray-400">(optional)</span>
                </label>
                <textarea
                  name="rationale"
                  value={formData.rationale}
                  onChange={handleChange}
                  placeholder="Why are you making this trade? What's your thesis?"
                  rows={3}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="mt-6 flex justify-end space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
              >
                Add Trade
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default NewTradeModal;
