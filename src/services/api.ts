import axios from 'axios';
import { Investment, Trade, InvestmentIdea, PortfolioMetrics, InvestmentPolicyStatement } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

export const portfolioService = {
  async getPortfolioMetrics(): Promise<PortfolioMetrics> {
    const response = await api.get('/portfolio/metrics');
    return response.data;
  },

  async getInvestments(): Promise<Investment[]> {
    const response = await api.get('/investments');
    return response.data;
  },

  async addInvestment(investment: Omit<Investment, 'id'>): Promise<Investment> {
    const response = await api.post('/investments', investment);
    return response.data;
  },
};

export const tradeService = {
  async getTrades(): Promise<Trade[]> {
    const response = await api.get('/trades');
    return response.data;
  },

  async addTrade(trade: Omit<Trade, 'id'>): Promise<Trade> {
    const response = await api.post('/trades', trade);
    return response.data;
  },

  async updateTradeRationale(tradeId: string, rationale: string): Promise<Trade> {
    const response = await api.patch(`/trades/${tradeId}`, { rationale });
    return response.data;
  },
};

export const ideaService = {
  async getIdeas(): Promise<InvestmentIdea[]> {
    const response = await api.get('/ideas');
    return response.data;
  },

  async addIdea(idea: Omit<InvestmentIdea, 'id' | 'dateAdded'>): Promise<InvestmentIdea> {
    const response = await api.post('/ideas', idea);
    return response.data;
  },

  async updateIdea(ideaId: string, updates: Partial<Omit<InvestmentIdea, 'id' | 'dateAdded'>>): Promise<InvestmentIdea> {
    const response = await api.put(`/ideas/${ideaId}`, updates);
    return response.data;
  },

  async deleteIdea(ideaId: string): Promise<void> {
    await api.delete(`/ideas/${ideaId}`);
  },
};

export const stockService = {
  async getStockPrice(ticker: string): Promise<number> {
    const response = await api.get(`/stocks/${ticker}/price`);
    return response.data.price;
  },

  async searchStocks(query: string): Promise<Array<{ ticker: string; name: string; price: number }>> {
    const response = await api.get(`/stocks/search?q=${encodeURIComponent(query)}`);
    return response.data;
  },
};

export const platformService = {
  async syncPlatform(platform: 'etrade' | 'schwab' | 'chase'): Promise<void> {
    await api.post(`/platforms/${platform}/sync`);
  },

  async getPlatformStatus(platform: string): Promise<{ connected: boolean; lastSync: string }> {
    const response = await api.get(`/platforms/${platform}/status`);
    return response.data;
  },
};

export const ipsService = {
  async getIPS(): Promise<InvestmentPolicyStatement> {
    const response = await api.get('/ips');
    return response.data;
  },

  async saveIPS(ips: Partial<InvestmentPolicyStatement>): Promise<InvestmentPolicyStatement> {
    const response = await api.post('/ips', ips);
    return response.data;
  },
};

export default api;