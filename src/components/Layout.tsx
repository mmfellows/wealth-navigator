import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Search,
  Lightbulb,
  Briefcase,
  FileText,
  Settings,
  TrendingUp,
  ClipboardList,
  TestTube,
  DollarSign,
  CreditCard,
  PiggyBank,
  Calendar,
  PieChart,
  Wallet,
  Carrot,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

type Section = 'investing' | 'personal-finance';

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();

  // Determine active section based on current route
  const getActiveSection = (): Section => {
    const path = location.pathname;

    // Personal Finance routes
    if (path.startsWith('/budgets') || path.startsWith('/expenses') || path.startsWith('/accounts') || path.startsWith('/reports') || path.startsWith('/carrots') || path === '/personal-finance-settings') {
      localStorage.setItem('lastActiveSection', 'personal-finance');
      return 'personal-finance';
    }

    // Investing routes
    if (path.startsWith('/research') || path.startsWith('/ideas') || path.startsWith('/portfolio') || path.startsWith('/trades') || path.startsWith('/ips') || path.startsWith('/api-testing') || path === '/investing-settings' || path === '/') {
      localStorage.setItem('lastActiveSection', 'investing');
      return 'investing';
    }

    // Legacy settings route should maintain the last active section
    if (path === '/settings') {
      return localStorage.getItem('lastActiveSection') as Section || 'investing';
    }

    return 'investing';
  };

  const [activeSection, setActiveSection] = useState<Section>(getActiveSection());
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('navCollapsed') === 'true');

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      localStorage.setItem('navCollapsed', String(!prev));
      return !prev;
    });
  };

  // Update active section when route changes
  React.useEffect(() => {
    setActiveSection(getActiveSection());
  }, [location.pathname]);

  const investingNavItems = [
    { path: '/', icon: BarChart3, label: 'Dashboard' },
    { path: '/research', icon: Search, label: 'Research' },
    { path: '/ideas', icon: Lightbulb, label: 'Ideas' },
    { path: '/portfolio', icon: Briefcase, label: 'Portfolio' },
    { path: '/trades', icon: FileText, label: 'Trade Journal' },
    { path: '/ips', icon: ClipboardList, label: 'Investment Policy' },
    { path: '/api-testing', icon: TestTube, label: 'API Testing' },
    { path: '/investing-settings', icon: Settings, label: 'Settings' },
  ];

  const personalFinanceNavItems = [
    { path: '/reports', icon: PieChart, label: 'Dashboard' },
    { path: '/budgets', icon: DollarSign, label: 'Budgets' },
    { path: '/expenses', icon: CreditCard, label: 'Expenses' },
    { path: '/accounts', icon: PiggyBank, label: 'Accounts' },
    { path: '/carrots', icon: Carrot, label: 'Carrots' },
    { path: '/personal-finance-settings', icon: Settings, label: 'Settings' },
  ];

  const currentNavItems = activeSection === 'investing' ? investingNavItems : personalFinanceNavItems;

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Top Navigation */}
      <div className="bg-white shadow-sm border-b">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center space-x-2">
            <TrendingUp className="h-8 w-8 text-blue-600" />
            <h1 className="text-xl font-bold text-gray-900">Wealth Navigator</h1>
          </div>

          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => { setActiveSection('investing'); navigate('/'); }}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeSection === 'investing'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Briefcase className="h-4 w-4 mr-2 inline" />
              Investing
            </button>
            <button
              onClick={() => { setActiveSection('personal-finance'); navigate('/reports'); }}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeSection === 'personal-finance'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Wallet className="h-4 w-4 mr-2 inline" />
              Personal Finance
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Side Navigation */}
        <nav className={`${collapsed ? 'w-16' : 'w-52'} bg-white shadow-lg transition-all duration-200 flex flex-col`}>
          <div className={`p-4 flex items-center ${collapsed ? 'justify-center' : 'justify-between'}`}>
            {!collapsed && (
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                {activeSection === 'investing' ? 'Investment Tools' : 'Finance Tools'}
              </h2>
            )}
            <button
              onClick={toggleCollapsed}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
            </button>
          </div>

          <div className="mt-2">
            {currentNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  title={collapsed ? item.label : undefined}
                  className={`flex items-center ${collapsed ? 'justify-center px-3' : 'pl-6 pr-3'} py-3 text-left w-full transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <Icon className={`h-5 w-5 ${collapsed ? '' : 'mr-3'}`} />
                  {!collapsed && item.label}
                </Link>
              );
            })}
          </div>
        </nav>

        <main className="flex-1 overflow-auto">
          <div className="p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;