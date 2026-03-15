import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Research from './pages/Research';
import Ideas from './pages/Ideas';
import Portfolio from './pages/Portfolio';
import TradeJournal from './pages/TradeJournal';
import Settings from './pages/Settings';
import InvestingSettings from './pages/InvestingSettings';
import PersonalFinanceSettings from './pages/PersonalFinanceSettings';
import TestPage from './pages/TestPage';
import IPS from './pages/IPS';
import ApiTesting from './pages/ApiTesting';
import Budgets from './pages/Budgets';
import Expenses from './pages/Expenses';
import Accounts from './pages/Accounts';
import Reports from './pages/Reports';
import Carrots from './pages/Carrots';

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
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/test" element={<TestPage />} />
            <Route path="/research" element={<Research />} />
            <Route path="/ideas" element={<Ideas />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/trades" element={<TradeJournal />} />
            <Route path="/ips" element={<IPS />} />
            <Route path="/api-testing" element={<ApiTesting />} />
            <Route path="/budgets" element={<Budgets />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/carrots" element={<Carrots />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/investing-settings" element={<InvestingSettings />} />
            <Route path="/personal-finance-settings" element={<PersonalFinanceSettings />} />
          </Routes>
        </Layout>
      </Router>
    </QueryClientProvider>
  );
}

export default App;