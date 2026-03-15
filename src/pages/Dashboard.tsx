import React, { useState } from 'react';
import { TrendingUp, TrendingDown, DollarSign, PieChart, Loader2, Quote, Building2 } from 'lucide-react';
import { usePortfolioMetrics, useIPS, useInvestments } from '../hooks/usePortfolio';
import axios from 'axios';

const Dashboard: React.FC = () => {
  const [dateRange, setDateRange] = useState('1M');
  const [accounts, setAccounts] = useState<any[]>([]);
  const { data: metrics, isLoading, error } = usePortfolioMetrics();
  const { data: ips } = useIPS();
  const { data: investments = [] } = useInvestments();

  // Fetch connected accounts and their balances
  React.useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const response = await axios.get('http://localhost:3001/api/plaid/accounts');
        setAccounts(response.data.institutions || []);
      } catch (error) {
        console.error('Failed to fetch accounts:', error);
      }
    };
    fetchAccounts();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading portfolio metrics...</span>
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600">Failed to load portfolio data. Please try again.</p>
      </div>
    );
  }

  const totalGrowth = metrics.totalInvested > 0
    ? ((metrics.netWorth - metrics.totalCash - metrics.totalInvested) / metrics.totalInvested) * 100
    : 0;

  const MetricCard = ({ title, value, change, icon: Icon, isPositive }: any) => (
    <div className="bg-white rounded-lg p-6 shadow-sm border">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-3xl font-bold text-gray-900">{value}</p>
          {change && (
            <div className={`flex items-center mt-2 ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
              {isPositive ? <TrendingUp className="h-4 w-4 mr-1" /> : <TrendingDown className="h-4 w-4 mr-1" />}
              <span className="text-sm font-medium">{change}%</span>
            </div>
          )}
        </div>
        <Icon className="h-12 w-12 text-gray-400" />
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <div className="flex space-x-2">
          {['1W', '1M', '3M', '6M', '1Y', 'ALL'].map((period) => (
            <button
              key={period}
              onClick={() => setDateRange(period)}
              className={`px-3 py-1 rounded-md text-sm font-medium ${
                dateRange === period
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {period}
            </button>
          ))}
        </div>
      </div>

      {/* Investment Philosophy Pull Quote */}
      {ips?.investment_philosophy && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6 border border-blue-200">
          <div className="flex items-start space-x-4">
            <Quote className="h-8 w-8 text-blue-500 flex-shrink-0 mt-1" />
            <div>
              <blockquote className="text-lg text-gray-800 italic leading-relaxed">
                "{ips.investment_philosophy}"
              </blockquote>
              <cite className="text-sm text-blue-600 font-medium mt-2 block">
                — Your Investment Philosophy
              </cite>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Net Worth"
          value={`$${metrics.netWorth.toLocaleString()}`}
          change={metrics.totalGrowth}
          icon={DollarSign}
          isPositive={true}
        />
        <MetricCard
          title="Total Invested"
          value={`$${metrics.totalInvested.toLocaleString()}`}
          icon={TrendingUp}
        />
        <MetricCard
          title="Cash Available"
          value={`$${metrics.totalCash.toLocaleString()}`}
          icon={DollarSign}
        />
        <MetricCard
          title="Portfolio Growth"
          value={`${totalGrowth.toFixed(2)}%`}
          change={totalGrowth}
          icon={PieChart}
          isPositive={totalGrowth >= 0}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg p-6 shadow-sm border">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Investment Allocation</h2>
          <div className="space-y-4">
            {Object.entries(metrics.categoryBreakdown).map(([category, data]) => (
              <div key={category} className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-4 h-4 rounded-full bg-blue-500 mr-3"></div>
                  <span className="capitalize text-gray-700">{category.replace(/([A-Z])/g, ' $1')}</span>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-gray-900">${data.amount.toLocaleString()}</div>
                  <div className="text-sm text-gray-500">{data.percentage}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg p-6 shadow-sm border">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Cash vs Invested</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-700">Invested</span>
              <span className="font-medium">${metrics.totalInvested.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-700">Cash</span>
              <span className="font-medium">${metrics.totalCash.toLocaleString()}</span>
            </div>
            <div className="pt-4 border-t">
              <div className="flex items-center justify-between">
                <span className="text-gray-900 font-medium">Investment Ratio</span>
                <span className="font-bold text-blue-600">
                  {((metrics.totalInvested / metrics.netWorth) * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Account Balances Table */}
      <div className="bg-white rounded-lg p-6 shadow-sm border">
        <div className="flex items-center mb-4">
          <Building2 className="h-6 w-6 text-blue-600 mr-3" />
          <h2 className="text-xl font-semibold text-gray-900">Account Balances</h2>
        </div>

        {accounts.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Building2 className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>No connected accounts yet.</p>
            <p className="text-sm mt-2">Connect your brokerage accounts in Settings to see balances here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Institution
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Account Type
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Balance
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {accounts.map((account, index) => {
                  // Calculate account balance from investments for this institution
                  const accountInvestments = investments.filter(inv => inv.platform === 'plaid');
                  const accountBalance = accountInvestments.reduce((sum, inv) =>
                    sum + (inv.shares * inv.currentPrice), 0
                  );

                  return (
                    <tr key={account.item_id || index} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-3 h-3 rounded-full bg-green-500 mr-3" />
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {account.institution_name}
                            </div>
                            <div className="text-sm text-gray-500">
                              Connected {new Date(account.created_at).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                          Investment Account
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm font-semibold text-gray-900">
                          ${accountBalance.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                          <div className="w-2 h-2 rounded-full bg-green-400 mr-1" />
                          Connected
                        </span>
                      </td>
                    </tr>
                  );
                })}

                {/* Total Row */}
                <tr className="bg-gray-50 border-t-2 border-gray-300">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-semibold text-gray-900">Total</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-500">{accounts.length} account{accounts.length !== 1 ? 's' : ''}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="text-sm font-bold text-gray-900">
                      ${metrics?.totalInvested?.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      }) || '0.00'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-500">All accounts</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;