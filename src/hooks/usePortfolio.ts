import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { portfolioService, tradeService, ideaService, ipsService } from '../services/api';

export const usePortfolioMetrics = () => {
  return useQuery({
    queryKey: ['portfolio', 'metrics'],
    queryFn: portfolioService.getPortfolioMetrics,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useInvestments = () => {
  return useQuery({
    queryKey: ['investments'],
    queryFn: portfolioService.getInvestments,
    staleTime: 5 * 60 * 1000,
  });
};

export const useTrades = () => {
  return useQuery({
    queryKey: ['trades'],
    queryFn: tradeService.getTrades,
    staleTime: 2 * 60 * 1000, // 2 minutes for more frequent updates
  });
};

export const useIdeas = () => {
  return useQuery({
    queryKey: ['ideas'],
    queryFn: ideaService.getIdeas,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
};

export const useAddIdea = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ideaService.addIdea,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ideas'] });
    },
  });
};

export const useDeleteIdea = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ideaService.deleteIdea,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ideas'] });
    },
  });
};

export const useUpdateIdea = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ideaId, updates }: { ideaId: string; updates: any }) =>
      ideaService.updateIdea(ideaId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ideas'] });
    },
  });
};

export const useUpdateTradeRationale = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ tradeId, rationale }: { tradeId: string; rationale: string }) =>
      tradeService.updateTradeRationale(tradeId, rationale),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trades'] });
    },
  });
};

export const useIPS = () => {
  return useQuery({
    queryKey: ['ips'],
    queryFn: ipsService.getIPS,
    staleTime: 30 * 60 * 1000, // 30 minutes
  });
};

export const useSaveIPS = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ipsService.saveIPS,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ips'] });
    },
  });
};