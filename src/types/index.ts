export interface Investment {
  id: string;
  ticker: string;
  name: string;
  shares: number;
  currentPrice: number;
  purchasePrice: number;
  purchaseDate: string;
  platform: 'etrade' | 'schwab' | 'chase';
  category: 'retirement' | 'low-risk' | 'growth' | 'speculative';
}

export interface Trade {
  id: string;
  ticker: string;
  type: 'buy' | 'sell';
  shares: number;
  price: number;
  date: string;
  platform: 'etrade' | 'schwab' | 'chase';
  rationale: string;
}

export interface InvestmentIdea {
  id: string;
  ticker: string;
  name: string;
  category: 'low-risk' | 'growth' | 'speculative';
  current_price: number;
  currentPrice?: number; // backwards compatibility
  notes: string;
  date_added: string;
  dateAdded?: string; // backwards compatibility
}

export interface PortfolioMetrics {
  netWorth: number;
  totalInvested: number;
  totalCash: number;
  categoryBreakdown: {
    retirement: { amount: number; percentage: number };
    lowRisk: { amount: number; percentage: number };
    growth: { amount: number; percentage: number };
    speculative: { amount: number; percentage: number };
  };
}

export interface Settings {
  targetAllocations: {
    lowRisk: number;
    growth: number;
    speculative: number;
  };
}

export interface InvestmentPolicyStatement {
  id?: string;
  user_id?: number;
  investment_philosophy?: string;
  risk_tolerance?: string;
  time_horizon?: string;
  investment_objectives?: string;
  asset_allocation_strategy?: string;
  rebalancing_strategy?: string;
  review_frequency?: string;
  created_at?: string;
  updated_at?: string;
}