import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from './ui';

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
          className="fixed inset-0 bg-black/50 transition-opacity"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative w-full max-w-lg transform rounded-ever border border-ever-line bg-ever-card text-ever-ink shadow-xl transition-all">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-ever-line px-6 py-4">
            <h2 className="text-xl font-semibold text-ever-ink">New Trade</h2>
            <button
              onClick={onClose}
              className="rounded-full p-1 text-ever-dim hover:bg-white/5 hover:text-ever-ink"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6">
            <div className="space-y-4">
              {/* Date */}
              <div>
                <label className="block text-sm font-medium text-ever-dim mb-1">
                  Date of Purchase
                </label>
                <input
                  type="date"
                  name="date"
                  value={formData.date}
                  onChange={handleChange}
                  className={`w-full rounded-lg border bg-ever-bg px-3 py-2 text-ever-ink placeholder-ever-faint focus:outline-none focus:border-ever-lime ${
                    errors.date ? 'border-ever-neg' : 'border-ever-line'
                  }`}
                />
                {errors.date && <p className="mt-1 text-sm text-ever-neg">{errors.date}</p>}
              </div>

              {/* Ticker and Action Row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-ever-dim mb-1">
                    Ticker Symbol
                  </label>
                  <input
                    type="text"
                    name="ticker"
                    value={formData.ticker}
                    onChange={handleChange}
                    placeholder="AAPL"
                    className={`w-full rounded-lg border bg-ever-bg px-3 py-2 uppercase text-ever-ink placeholder-ever-faint focus:outline-none focus:border-ever-lime ${
                      errors.ticker ? 'border-ever-neg' : 'border-ever-line'
                    }`}
                  />
                  {errors.ticker && <p className="mt-1 text-sm text-ever-neg">{errors.ticker}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-ever-dim mb-1">Action</label>
                  <select
                    name="type"
                    value={formData.type}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-ever-line bg-ever-bg px-3 py-2 text-ever-ink focus:outline-none focus:border-ever-lime"
                  >
                    <option value="buy">Buy</option>
                    <option value="sell">Sell</option>
                  </select>
                </div>
              </div>

              {/* Shares and Price Row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-ever-dim mb-1">Shares</label>
                  <input
                    type="number"
                    name="shares"
                    value={formData.shares || ''}
                    onChange={handleChange}
                    placeholder="0"
                    step="0.0001"
                    min="0"
                    className={`w-full rounded-lg border bg-ever-bg px-3 py-2 text-ever-ink placeholder-ever-faint focus:outline-none focus:border-ever-lime ${
                      errors.shares ? 'border-ever-neg' : 'border-ever-line'
                    }`}
                  />
                  {errors.shares && <p className="mt-1 text-sm text-ever-neg">{errors.shares}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-ever-dim mb-1">
                    Price Paid
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-ever-dim">$</span>
                    <input
                      type="number"
                      name="price"
                      value={formData.price || ''}
                      onChange={handleChange}
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                      className={`w-full rounded-lg border bg-ever-bg px-3 py-2 pl-7 text-ever-ink placeholder-ever-faint focus:outline-none focus:border-ever-lime ${
                        errors.price ? 'border-ever-neg' : 'border-ever-line'
                      }`}
                    />
                  </div>
                  {errors.price && <p className="mt-1 text-sm text-ever-neg">{errors.price}</p>}
                </div>
              </div>

              {/* Total Display */}
              {total > 0 && (
                <div className="rounded-lg bg-white/5 px-4 py-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-ever-dim">Total Value</span>
                    <span className="font-semibold text-ever-ink">
                      ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              )}

              {/* Platform and Strategy Row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-ever-dim mb-1">Platform</label>
                  <select
                    name="platform"
                    value={formData.platform}
                    onChange={handleChange}
                    className={`w-full rounded-lg border bg-ever-bg px-3 py-2 text-ever-ink focus:outline-none focus:border-ever-lime ${
                      errors.platform ? 'border-ever-neg' : 'border-ever-line'
                    }`}
                  >
                    {PLATFORMS.map((platform) => (
                      <option key={platform} value={platform}>
                        {platform.charAt(0).toUpperCase() + platform.slice(1)}
                      </option>
                    ))}
                  </select>
                  {errors.platform && (
                    <p className="mt-1 text-sm text-ever-neg">{errors.platform}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-ever-dim mb-1">Strategy</label>
                  <select
                    name="strategy"
                    value={formData.strategy}
                    onChange={handleChange}
                    className={`w-full rounded-lg border bg-ever-bg px-3 py-2 text-ever-ink focus:outline-none focus:border-ever-lime ${
                      errors.strategy ? 'border-ever-neg' : 'border-ever-line'
                    }`}
                  >
                    {STRATEGIES.map((strategy) => (
                      <option key={strategy} value={strategy}>
                        {strategy}
                      </option>
                    ))}
                  </select>
                  {errors.strategy && (
                    <p className="mt-1 text-sm text-ever-neg">{errors.strategy}</p>
                  )}
                </div>
              </div>

              {/* Rationale */}
              <div>
                <label className="block text-sm font-medium text-ever-dim mb-1">
                  Rationale <span className="text-ever-faint">(optional)</span>
                </label>
                <textarea
                  name="rationale"
                  value={formData.rationale}
                  onChange={handleChange}
                  placeholder="Why are you making this trade? What's your thesis?"
                  rows={3}
                  className="w-full rounded-lg border border-ever-line bg-ever-bg px-3 py-2 text-ever-ink placeholder-ever-faint focus:outline-none focus:border-ever-lime"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="mt-6 flex justify-end space-x-3">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit">
                Add Trade
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default NewTradeModal;
