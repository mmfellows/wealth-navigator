import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import RequireAuth from './components/RequireAuth';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Research from './pages/Research';
import Ideas from './pages/Ideas';
import Portfolio from './pages/Portfolio';
import Holdings from './pages/Holdings';
import TradeJournal from './pages/TradeJournal';
import Settings from './pages/Settings';
import InvestingSettings from './pages/InvestingSettings';
import PersonalFinanceSettings from './pages/PersonalFinanceSettings';
import TestPage from './pages/TestPage';
import IPS from './pages/IPS';
import Budgets from './pages/Budgets';
import Expenses from './pages/Expenses';
import Accounts from './pages/Accounts';
import Reports from './pages/Reports';
import Carrots from './pages/Carrots';
import OAuthCallback from './pages/OAuthCallback';
import AccountSnapshot from './pages/AccountSnapshot';
import Bets from './pages/Bets';
import Options from './pages/Options';
import Login from './pages/Login';
import Security from './pages/Security';
import Privacy from './pages/Privacy';

// Create a query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router>
          <Routes>
            {/* Public routes. Everything else requires auth. */}
            <Route path="/login" element={<Login />} />
            <Route path="/privacy" element={<Privacy />} />

            {/* Protected routes */}
            <Route
              path="*"
              element={
                <RequireAuth>
                  <Layout>
                    <Routes>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/test" element={<TestPage />} />
                      <Route path="/research" element={<Research />} />
                      <Route path="/ideas" element={<Ideas />} />
                      <Route path="/portfolio" element={<Portfolio />} />
                      <Route path="/holdings" element={<Holdings />} />
                      <Route path="/bets" element={<Bets />} />
                      <Route path="/options" element={<Options />} />
                      <Route path="/trades" element={<TradeJournal />} />
                      <Route path="/ips" element={<IPS />} />
                      <Route path="/account-snapshot" element={<AccountSnapshot />} />
                      <Route path="/budgets" element={<Budgets />} />
                      <Route path="/expenses" element={<Expenses />} />
                      <Route path="/accounts" element={<Accounts />} />
                      <Route path="/reports" element={<Reports />} />
                      <Route path="/carrots" element={<Carrots />} />
                      <Route path="/oauth-callback" element={<OAuthCallback />} />
                      <Route path="/settings" element={<Settings />} />
                      <Route path="/security" element={<Security />} />
                      <Route path="/investing-settings" element={<InvestingSettings />} />
                      <Route path="/personal-finance-settings" element={<PersonalFinanceSettings />} />
                    </Routes>
                  </Layout>
                </RequireAuth>
              }
            />
          </Routes>
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
