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
  Check,
  Inbox,
  CalendarCheck,
  Menu,
  X,
  Gauge,
  MessageCircle,
  CalendarRange
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
    if (path.startsWith('/budgets') || path.startsWith('/expenses') || path.startsWith('/accounts') || path.startsWith('/reports') || path.startsWith('/carrots') || path.startsWith('/review') || path.startsWith('/close') || path.startsWith('/pacing') || path.startsWith('/chat') || path.startsWith('/quarterly') || path === '/personal-finance-settings') {
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const sectionMenuRef = useRef<HTMLDivElement>(null);

  // Close the mobile drawer on navigation
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

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
    { path: '/pacing', icon: Gauge, label: 'Pacing' },
    { path: '/chat', icon: MessageCircle, label: 'Chat' },
    { path: '/budgets', icon: DollarSign, label: 'Budgets' },
    { path: '/expenses', icon: CreditCard, label: 'Expenses' },
    { path: '/review', icon: Inbox, label: 'Review' },
    { path: '/close', icon: CalendarCheck, label: 'Close' },
    { path: '/quarterly', icon: CalendarRange, label: 'Quarterly' },
    { path: '/accounts', icon: PiggyBank, label: 'Accounts' },
    { path: '/carrots', icon: Carrot, label: 'Carrots' },
    { path: '/personal-finance-settings', icon: Settings, label: 'Settings' },
  ];

  const currentNavItems = activeSection === 'investing' ? investingNavItems : personalFinanceNavItems;

  return (
    <div className={`theme-evergreen ${activeSection === 'personal-finance' ? 'theme-pf' : ''} flex flex-col h-screen bg-ever-bg font-grotesk text-ever-ink`}>
      {/* Top Navigation */}
      <div className="bg-ever-side border-b border-ever-line">
        <div className="px-4 md:px-6 py-3">
          <div className="flex items-center space-x-2">
            {/* Mobile: hamburger opens the nav drawer */}
            <button
              onClick={() => setDrawerOpen(true)}
              className="md:hidden -ml-1 p-1.5 text-ever-dim hover:text-ever-ink"
              aria-label="Open navigation"
            >
              <Menu className="h-6 w-6" />
            </button>
            <TrendingUp className="h-7 w-7 text-ever-lime" />
            <h1 className="text-xl font-bold tracking-tight text-ever-ink">Wealth Navigator</h1>
          </div>

          {/* Section selector */}
          <div className="relative mt-1 ml-9 inline-block" ref={sectionMenuRef}>
            <button
              onClick={() => setSectionMenuOpen(open => !open)}
              aria-haspopup="listbox"
              aria-expanded={sectionMenuOpen}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-ever-dim hover:text-ever-ink transition-colors"
            >
              <currentSection.icon className="h-4 w-4 text-ever-lime" />
              {currentSection.label}
              <ChevronDown className={`h-4 w-4 text-ever-faint transition-transform ${sectionMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {sectionMenuOpen && (
              <div
                role="listbox"
                className="absolute left-0 top-full mt-1 w-52 bg-ever-card border border-ever-line rounded-ever shadow-lg py-1 z-50"
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
                        isActive ? 'text-ever-lime bg-white/5' : 'text-ever-dim hover:bg-white/5 hover:text-ever-ink'
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
        {/* Mobile nav drawer */}
        {drawerOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-black/60" onClick={() => setDrawerOpen(false)} />
            <div className="absolute inset-y-0 left-0 w-64 bg-ever-side border-r border-ever-line shadow-xl flex flex-col">
              <div className="p-4 flex items-center justify-between border-b border-ever-line">
                <span className="font-mono text-[10.5px] font-semibold text-ever-faint uppercase tracking-[0.16em]">
                  {activeSection === 'investing' ? 'Investment Tools' : 'Finance Tools'}
                </span>
                <button onClick={() => setDrawerOpen(false)} className="p-1 text-ever-dim hover:text-ever-ink" aria-label="Close navigation">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex gap-1 p-3 border-b border-ever-line">
                {SECTIONS.map(s => (
                  <button
                    key={s.id}
                    onClick={() => selectSection(s)}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium ${
                      s.id === activeSection ? 'bg-ever-lime text-ever-lime-ink' : 'bg-white/5 text-ever-dim'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="overflow-y-auto py-2">
                {currentNavItems.map(item => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm ${
                        isActive ? 'bg-ever-lime text-ever-lime-ink font-semibold' : 'text-ever-dim'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Side Navigation (desktop) */}
        <nav className={`${collapsed ? 'w-16' : 'w-52'} hidden md:flex bg-ever-side border-r border-ever-line transition-all duration-200 flex-col`}>
          <div className={`p-4 flex items-center ${collapsed ? 'justify-center' : 'justify-between'}`}>
            {!collapsed && (
              <h2 className="font-mono text-[10.5px] font-semibold text-ever-faint uppercase tracking-[0.16em]">
                {activeSection === 'investing' ? 'Investment Tools' : 'Finance Tools'}
              </h2>
            )}
            <button
              onClick={toggleCollapsed}
              className="text-ever-dim hover:text-ever-ink transition-colors"
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
            </button>
          </div>

          <div className="mt-1">
            {currentNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  title={collapsed ? item.label : undefined}
                  className={`flex items-center ${collapsed ? 'justify-center px-3' : 'px-4'} py-2.5 mx-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'bg-ever-lime text-ever-lime-ink font-semibold'
                      : 'text-ever-dim hover:bg-white/5 hover:text-ever-ink'
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
          <div className="p-4 md:p-8 flex-1">
            {children}
          </div>
          <footer className="px-4 md:px-8 py-4 font-mono text-[11px] text-ever-faint border-t border-ever-line bg-ever-side">
            <Link to="/privacy" className="hover:text-ever-ink">Privacy Policy</Link>
            <span className="mx-2" aria-hidden="true">·</span>
            <Link to="/security" className="hover:text-ever-ink">Security &amp; passkeys</Link>
          </footer>
        </main>
      </div>
    </div>
  );
};

export default Layout;