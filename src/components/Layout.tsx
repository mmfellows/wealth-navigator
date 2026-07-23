import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Search,
  Lightbulb,
  Briefcase,
  FileText,
  Settings,
  TrendingUp,
  Target,
  ClipboardList,
  List,
  Layers,
  DollarSign,
  CreditCard,
  PiggyBank,
  PieChart,
  Wallet,
  Carrot,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  Check
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
    if (path.startsWith('/research') || path.startsWith('/ideas') || path.startsWith('/portfolio') || path.startsWith('/holdings') || path.startsWith('/bets') || path.startsWith('/options') || path.startsWith('/trades') || path.startsWith('/ips') || path.startsWith('/account-snapshot') || path === '/investing-settings' || path === '/') {
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
  const [sectionMenuOpen, setSectionMenuOpen] = useState(false);
  const sectionMenuRef = useRef<HTMLDivElement>(null);

  // Close the section dropdown on outside click or Escape
  useEffect(() => {
    if (!sectionMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (sectionMenuRef.current && !sectionMenuRef.current.contains(e.target as Node)) {
        setSectionMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSectionMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [sectionMenuOpen]);

  const SECTIONS: Array<{ id: Section; label: string; icon: typeof Briefcase; home: string }> = [
    { id: 'investing', label: 'Investing', icon: Briefcase, home: '/' },
    { id: 'personal-finance', label: 'Personal Finance', icon: Wallet, home: '/reports' },
  ];
  const currentSection = SECTIONS.find(s => s.id === activeSection) ?? SECTIONS[0];

  const selectSection = (s: (typeof SECTIONS)[number]) => {
    setSectionMenuOpen(false);
    if (s.id !== activeSection) {
      setActiveSection(s.id);
      navigate(s.home);
    }
  };

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
    { path: '/ideas', icon: Lightbulb, label: 'Watchlist' },
    { path: '/portfolio', icon: Briefcase, label: 'Portfolio' },
    { path: '/holdings', icon: List, label: 'Holdings' },
    { path: '/bets', icon: Target, label: 'Bets' },
    { path: '/options', icon: Layers, label: 'Options' },
    { path: '/trades', icon: FileText, label: 'Trade Journal' },
    { path: '/ips', icon: ClipboardList, label: 'Investment Policy' },
    { path: '/account-snapshot', icon: Wallet, label: 'Account Snapshot' },
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
        <div className="px-6 py-3">
          <div className="flex items-center space-x-2">
            <TrendingUp className="h-8 w-8 text-blue-600" />
            <h1 className="text-xl font-bold text-gray-900">Wealth Navigator</h1>
          </div>

          {/* Section selector */}
          <div className="relative mt-1 ml-10 inline-block" ref={sectionMenuRef}>
            <button
              onClick={() => setSectionMenuOpen(open => !open)}
              aria-haspopup="listbox"
              aria-expanded={sectionMenuOpen}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
            >
              <currentSection.icon className="h-4 w-4 text-blue-600" />
              {currentSection.label}
              <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${sectionMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {sectionMenuOpen && (
              <div
                role="listbox"
                className="absolute left-0 top-full mt-1 w-52 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50"
              >
                {SECTIONS.map(s => {
                  const Icon = s.icon;
                  const isActive = s.id === activeSection;
                  return (
                    <button
                      key={s.id}
                      role="option"
                      aria-selected={isActive}
                      onClick={() => selectSection(s)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                        isActive ? 'text-blue-600 bg-blue-50' : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="flex-1">{s.label}</span>
                      {isActive && <Check className="h-4 w-4" />}
                    </button>
                  );
                })}
              </div>
            )}
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

        <main className="flex-1 overflow-auto flex flex-col">
          <div className="p-8 flex-1">
            {children}
          </div>
          <footer className="px-8 py-4 text-xs text-gray-400 border-t border-gray-200 bg-white">
            <Link to="/privacy" className="hover:text-gray-600">Privacy Policy</Link>
            <span className="mx-2" aria-hidden="true">·</span>
            <Link to="/security" className="hover:text-gray-600">Security &amp; passkeys</Link>
          </footer>
        </main>
      </div>
    </div>
  );
};

export default Layout;