import React, { useState } from 'react';
import { PiggyBank, CreditCard, Building2, Plus, Eye, EyeOff, TrendingUp, TrendingDown } from 'lucide-react';

const Accounts: React.FC = () => {
  const [showBalances, setShowBalances] = useState(() => {
    const saved = localStorage.getItem('accounts_show_balances');
    return saved !== null ? saved === 'true' : true;
  });

  const toggleShowBalances = () => {
    setShowBalances(prev => {
      const next = !prev;
      localStorage.setItem('accounts_show_balances', String(next));
      return next;
    });
  };

  const accounts = [
    {
      id: 1,
      name: 'Main Checking',
      type: 'Checking',
      institution: 'Chase Bank',
      balance: 5420.50,
      change: 125.30,
      changePercent: 2.4,
      accountNumber: '****1234',
      status: 'active'
    },
    {
      id: 2,
      name: 'Emergency Savings',
      type: 'Savings',
      institution: 'Ally Bank',
      balance: 12500.00,
      change: 45.00,
      changePercent: 0.36,
      accountNumber: '****5678',
      status: 'active'
    },
    {
      id: 3,
      name: 'Travel Credit Card',
      type: 'Credit Card',
      institution: 'Chase Sapphire',
      balance: -2340.75,
      change: -89.50,
      changePercent: -3.98,
      accountNumber: '****9012',
      status: 'active'
    },
    {
      id: 4,
      name: 'Business Checking',
      type: 'Checking',
      institution: 'Wells Fargo',
      balance: 8750.25,
      change: 456.75,
      changePercent: 5.5,
      accountNumber: '****3456',
      status: 'active'
    },
    {
      id: 5,
      name: 'High Yield Savings',
      type: 'Savings',
      institution: 'Marcus by Goldman Sachs',
      balance: 25000.00,
      change: 104.17,
      changePercent: 0.42,
      accountNumber: '****7890',
      status: 'active'
    }
  ];

  const getAccountIcon = (type: string) => {
    switch (type) {
      case 'Checking':
        return <Building2 className="h-6 w-6" />;
      case 'Savings':
        return <PiggyBank className="h-6 w-6" />;
      case 'Credit Card':
        return <CreditCard className="h-6 w-6" />;
      default:
        return <Building2 className="h-6 w-6" />;
    }
  };

  const getAccountTypeColor = (type: string) => {
    switch (type) {
      case 'Checking':
        return 'bg-blue-100 text-blue-800';
      case 'Savings':
        return 'bg-green-100 text-green-800';
      case 'Credit Card':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatBalance = (balance: number) => {
    if (!showBalances) return '••••••';
    return balance < 0 ? `-$${Math.abs(balance).toLocaleString()}` : `$${balance.toLocaleString()}`;
  };

  const totalAssets = accounts
    .filter(account => account.type !== 'Credit Card' && account.balance > 0)
    .reduce((sum, account) => sum + account.balance, 0);

  const totalDebt = accounts
    .filter(account => account.type === 'Credit Card')
    .reduce((sum, account) => sum + Math.abs(account.balance), 0);

  const netWorth = totalAssets - totalDebt;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Accounts</h1>
        <div className="flex items-center space-x-4">
          <button
            onClick={toggleShowBalances}
            className="flex items-center px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
          >
            {showBalances ? <Eye className="h-4 w-4 mr-2" /> : <EyeOff className="h-4 w-4 mr-2" />}
            {showBalances ? 'Hide' : 'Show'} Balances
          </button>
          <button className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center">
            <Plus className="h-4 w-4 mr-2" />
            Add Account
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg p-6 shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Assets</p>
              <p className="text-2xl font-bold text-green-600">
                {showBalances ? `$${totalAssets.toLocaleString()}` : '••••••'}
              </p>
            </div>
            <PiggyBank className="h-10 w-10 text-green-400" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-6 shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Debt</p>
              <p className="text-2xl font-bold text-red-600">
                {showBalances ? `$${totalDebt.toLocaleString()}` : '••••••'}
              </p>
            </div>
            <CreditCard className="h-10 w-10 text-red-400" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-6 shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Net Worth</p>
              <p className={`text-2xl font-bold ${netWorth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {showBalances ? `$${netWorth.toLocaleString()}` : '••••••'}
              </p>
            </div>
            <Building2 className="h-10 w-10 text-blue-400" />
          </div>
        </div>
      </div>

      {/* Accounts List */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">All Accounts</h2>
        </div>

        <div className="divide-y divide-gray-200">
          {accounts.map((account) => (
            <div key={account.id} className="p-6 hover:bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className={`p-3 rounded-lg ${getAccountTypeColor(account.type)}`}>
                    {getAccountIcon(account.type)}
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{account.name}</h3>
                    <p className="text-sm text-gray-600">{account.institution}</p>
                    <p className="text-xs text-gray-500">{account.accountNumber}</p>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xl font-bold text-gray-900">
                    {formatBalance(account.balance)}
                  </div>

                  {showBalances && account.change && (
                    <div className={`flex items-center justify-end mt-1 ${
                      account.change >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {account.change >= 0 ?
                        <TrendingUp className="h-4 w-4 mr-1" /> :
                        <TrendingDown className="h-4 w-4 mr-1" />
                      }
                      <span className="text-sm font-medium">
                        {account.change >= 0 ? '+' : ''}${account.change.toFixed(2)}
                        ({account.changePercent >= 0 ? '+' : ''}{account.changePercent}%)
                      </span>
                    </div>
                  )}

                  <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full mt-2 ${
                    getAccountTypeColor(account.type)
                  }`}>
                    {account.type}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg p-6 shadow-sm border">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button className="flex items-center justify-center p-4 border border-gray-300 rounded-lg hover:bg-gray-50">
            <Plus className="h-5 w-5 text-blue-600 mr-2" />
            <span className="font-medium">Connect New Account</span>
          </button>

          <button className="flex items-center justify-center p-4 border border-gray-300 rounded-lg hover:bg-gray-50">
            <Building2 className="h-5 w-5 text-green-600 mr-2" />
            <span className="font-medium">Transfer Funds</span>
          </button>

          <button className="flex items-center justify-center p-4 border border-gray-300 rounded-lg hover:bg-gray-50">
            <CreditCard className="h-5 w-5 text-purple-600 mr-2" />
            <span className="font-medium">Pay Bills</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Accounts;