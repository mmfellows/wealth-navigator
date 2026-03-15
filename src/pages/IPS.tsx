import React, { useState, useEffect } from 'react';
import { FileText, Save, Loader2, CheckCircle } from 'lucide-react';
import { useIPS, useSaveIPS } from '../hooks/usePortfolio';
import { InvestmentPolicyStatement } from '../types';

const IPS: React.FC = () => {
  const { data: ips, isLoading, error } = useIPS();
  const saveIPSMutation = useSaveIPS();
  const [showSaved, setShowSaved] = useState(false);

  const [formData, setFormData] = useState<Partial<InvestmentPolicyStatement>>({
    investment_philosophy: '',
    risk_tolerance: '',
    time_horizon: '',
    investment_objectives: '',
    asset_allocation_strategy: '',
    rebalancing_strategy: '',
    review_frequency: ''
  });

  // Update form when data loads
  useEffect(() => {
    if (ips) {
      setFormData({
        investment_philosophy: ips.investment_philosophy || '',
        risk_tolerance: ips.risk_tolerance || '',
        time_horizon: ips.time_horizon || '',
        investment_objectives: ips.investment_objectives || '',
        asset_allocation_strategy: ips.asset_allocation_strategy || '',
        rebalancing_strategy: ips.rebalancing_strategy || '',
        review_frequency: ips.review_frequency || ''
      });
    }
  }, [ips]);

  const handleInputChange = (field: keyof InvestmentPolicyStatement, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await saveIPSMutation.mutateAsync(formData);
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 3000);
    } catch (error) {
      console.error('Failed to save IPS:', error);
      alert('Failed to save Investment Policy Statement');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading Investment Policy Statement...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600">Failed to load Investment Policy Statement. Please try again.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <FileText className="h-8 w-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-gray-900">Investment Policy Statement</h1>
        </div>
        {showSaved && (
          <div className="flex items-center space-x-2 text-green-600">
            <CheckCircle className="h-5 w-5" />
            <span className="text-sm font-medium">Saved successfully!</span>
          </div>
        )}
      </div>

      <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
        <p className="text-blue-800">
          An Investment Policy Statement (IPS) is a strategic document that outlines your investment approach,
          risk tolerance, and long-term financial objectives. It serves as a roadmap for making consistent
          investment decisions and helps maintain discipline during market volatility.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-8">
        {/* Investment Philosophy */}
        <div className="bg-white rounded-lg p-6 shadow-sm border">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Investment Philosophy</h2>
          <p className="text-sm text-gray-600 mb-3">
            Describe your core beliefs about investing and wealth building. This will also be displayed on your dashboard.
          </p>
          <textarea
            rows={4}
            value={formData.investment_philosophy}
            onChange={(e) => handleInputChange('investment_philosophy', e.target.value)}
            placeholder="e.g., I believe in long-term value investing with a focus on quality companies that have sustainable competitive advantages..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
          />
        </div>

        {/* Risk Tolerance */}
        <div className="bg-white rounded-lg p-6 shadow-sm border">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Risk Tolerance</h2>
          <p className="text-sm text-gray-600 mb-3">
            Define your comfort level with investment volatility and potential losses.
          </p>
          <textarea
            rows={3}
            value={formData.risk_tolerance}
            onChange={(e) => handleInputChange('risk_tolerance', e.target.value)}
            placeholder="e.g., I am comfortable with moderate volatility and can tolerate short-term losses of up to 20% for long-term growth..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
          />
        </div>

        {/* Time Horizon */}
        <div className="bg-white rounded-lg p-6 shadow-sm border">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Time Horizon</h2>
          <p className="text-sm text-gray-600 mb-3">
            Specify your investment timeline and when you expect to need the funds.
          </p>
          <textarea
            rows={2}
            value={formData.time_horizon}
            onChange={(e) => handleInputChange('time_horizon', e.target.value)}
            placeholder="e.g., My primary investment horizon is 15-20 years for retirement, with some shorter-term goals in 5-7 years..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
          />
        </div>

        {/* Investment Objectives */}
        <div className="bg-white rounded-lg p-6 shadow-sm border">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Investment Objectives</h2>
          <p className="text-sm text-gray-600 mb-3">
            List your specific financial goals and what you hope to achieve through investing.
          </p>
          <textarea
            rows={3}
            value={formData.investment_objectives}
            onChange={(e) => handleInputChange('investment_objectives', e.target.value)}
            placeholder="e.g., 1. Build retirement wealth to maintain current lifestyle, 2. Generate passive income, 3. Preserve capital against inflation..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
          />
        </div>

        {/* Asset Allocation Strategy */}
        <div className="bg-white rounded-lg p-6 shadow-sm border">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Asset Allocation Strategy</h2>
          <p className="text-sm text-gray-600 mb-3">
            Define your target allocation across different asset classes and investment categories.
          </p>
          <textarea
            rows={3}
            value={formData.asset_allocation_strategy}
            onChange={(e) => handleInputChange('asset_allocation_strategy', e.target.value)}
            placeholder="e.g., Target allocation: 30% Low-Risk (bonds, dividend stocks), 60% Growth (large-cap stocks), 10% Speculative (small-cap, emerging markets)..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
          />
        </div>

        {/* Rebalancing Strategy */}
        <div className="bg-white rounded-lg p-6 shadow-sm border">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Rebalancing Strategy</h2>
          <p className="text-sm text-gray-600 mb-3">
            Describe how and when you will rebalance your portfolio to maintain target allocations.
          </p>
          <textarea
            rows={2}
            value={formData.rebalancing_strategy}
            onChange={(e) => handleInputChange('rebalancing_strategy', e.target.value)}
            placeholder="e.g., Review and rebalance quarterly if any asset class deviates more than 5% from target allocation..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
          />
        </div>

        {/* Review Frequency */}
        <div className="bg-white rounded-lg p-6 shadow-sm border">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Review Frequency</h2>
          <p className="text-sm text-gray-600 mb-3">
            Define how often you will review and potentially update this policy statement.
          </p>
          <textarea
            rows={2}
            value={formData.review_frequency}
            onChange={(e) => handleInputChange('review_frequency', e.target.value)}
            placeholder="e.g., Review this IPS annually or when major life events occur (job change, marriage, major purchases)..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
          />
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saveIPSMutation.isPending}
            className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            {saveIPSMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                <span>Save Investment Policy Statement</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default IPS;