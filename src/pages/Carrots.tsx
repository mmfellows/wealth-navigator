import React, { useState } from 'react';
import { authedFetch } from '../services/authRedirect';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Gift, X, Plus, Target, DollarSign } from 'lucide-react';
import { Card, Button, StatCard } from '../components/ui';
import { cn } from '../lib/cn';
import { everPill } from '../lib/categoryColors';

interface Carrot {
  id: number;
  item_name: string;
  goal_description: string;
  estimated_cost?: number;
  is_purchased: boolean;
  is_goal_completed: boolean;
  priority: 'low' | 'medium' | 'high';
  purchased_date?: string;
  goal_completed_date?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

interface CarrotStats {
  total: number;
  purchased_count: number;
  goals_completed: number;
  ready_to_buy: number;
  total_estimated_cost: number;
}

const Carrots: React.FC = () => {
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCarrot, setEditingCarrot] = useState<Carrot | null>(null);
  const [formData, setFormData] = useState({
    item_name: '',
    goal_description: '',
    estimated_cost: '',
    priority: 'medium' as 'low' | 'medium' | 'high',
    notes: ''
  });

  // Fetch carrots
  const { data: carrotsData, isLoading } = useQuery({
    queryKey: ['carrots'],
    queryFn: async () => {
      const response = await authedFetch('/api/carrots');
      if (!response.ok) throw new Error('Failed to fetch carrots');
      return response.json();
    }
  });

  // Fetch stats
  const { data: stats } = useQuery<CarrotStats>({
    queryKey: ['carrots-stats'],
    queryFn: async () => {
      const response = await authedFetch('/api/carrots/stats/summary');
      if (!response.ok) throw new Error('Failed to fetch stats');
      return response.json();
    }
  });

  // Create carrot mutation
  const createCarrot = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await authedFetch('/api/carrots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          estimated_cost: data.estimated_cost ? parseFloat(data.estimated_cost) : null
        })
      });
      if (!response.ok) throw new Error('Failed to create carrot');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['carrots'] });
      queryClient.invalidateQueries({ queryKey: ['carrots-stats'] });
      setShowAddModal(false);
      resetForm();
    }
  });

  // Update carrot mutation
  const updateCarrot = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Carrot> }) => {
      const response = await authedFetch(`/api/carrots/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Failed to update carrot');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['carrots'] });
      queryClient.invalidateQueries({ queryKey: ['carrots-stats'] });
      setEditingCarrot(null);
      resetForm();
    }
  });

  // Delete carrot mutation
  const deleteCarrot = useMutation({
    mutationFn: async (id: number) => {
      const response = await authedFetch(`/api/carrots/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Failed to delete carrot');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['carrots'] });
      queryClient.invalidateQueries({ queryKey: ['carrots-stats'] });
    }
  });

  const resetForm = () => {
    setFormData({
      item_name: '',
      goal_description: '',
      estimated_cost: '',
      priority: 'medium',
      notes: ''
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCarrot) {
      updateCarrot.mutate({
        id: editingCarrot.id,
        data: {
          ...formData,
          estimated_cost: formData.estimated_cost ? parseFloat(formData.estimated_cost) : undefined
        }
      });
    } else {
      createCarrot.mutate(formData);
    }
  };

  const handleEdit = (carrot: Carrot) => {
    setEditingCarrot(carrot);
    setFormData({
      item_name: carrot.item_name,
      goal_description: carrot.goal_description,
      estimated_cost: carrot.estimated_cost?.toString() || '',
      priority: carrot.priority,
      notes: carrot.notes || ''
    });
    setShowAddModal(true);
  };

  const toggleGoalCompleted = (carrot: Carrot) => {
    updateCarrot.mutate({
      id: carrot.id,
      data: { is_goal_completed: !carrot.is_goal_completed }
    });
  };

  const togglePurchased = (carrot: Carrot) => {
    updateCarrot.mutate({
      id: carrot.id,
      data: { is_purchased: !carrot.is_purchased }
    });
  };

  const carrots = carrotsData?.carrots || [];

  const priorityColors = {
    low: 'bg-gray-100 text-gray-800',
    medium: 'bg-blue-100 text-blue-800',
    high: 'bg-red-100 text-red-800'
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-ever-lime"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-extrabold tracking-tight text-ever-ink md:text-[26px]">Carrots</h1>
        <Button
          onClick={() => {
            setEditingCarrot(null);
            resetForm();
            setShowAddModal(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Add Carrot
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard label="Total Carrots" value={stats?.total || 0} dot="var(--ever-lime)" />
        <StatCard label="Goals Completed" value={stats?.goals_completed || 0} dot="var(--ever-pos)" />
        <StatCard label="Ready to Buy" value={stats?.ready_to_buy || 0} dot="var(--ever-orange)" />
        <StatCard label="Purchased" value={stats?.purchased_count || 0} dot="var(--ever-violet)" />
      </div>

      {/* Carrots List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {carrots.map((carrot: Carrot) => (
          <Card
            key={carrot.id}
            className={cn(
              'border-2',
              carrot.is_purchased
                ? 'border-ever-violet'
                : carrot.is_goal_completed
                ? 'border-ever-lime'
                : 'border-ever-line',
            )}
          >
            <div className="flex justify-between items-start mb-4">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-ever-ink mb-1">
                  {carrot.item_name}
                </h3>
                <span className={cn('inline-flex px-2 py-1 text-xs font-medium rounded-full', everPill(priorityColors[carrot.priority]))}>
                  {carrot.priority}
                </span>
              </div>
              <button
                onClick={() => deleteCarrot.mutate(carrot.id)}
                className="text-ever-dim hover:text-ever-neg transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 mb-4">
              <div>
                <p className="text-sm font-medium text-ever-dim mb-1">Goal:</p>
                <p className="text-sm text-ever-ink">{carrot.goal_description}</p>
              </div>

              {carrot.estimated_cost && (
                <div className="flex items-center text-sm text-ever-dim">
                  <DollarSign className="h-4 w-4 mr-1" />
                  ${carrot.estimated_cost.toFixed(2)}
                </div>
              )}

              {carrot.notes && (
                <div>
                  <p className="text-sm font-medium text-ever-dim mb-1">Notes:</p>
                  <p className="text-sm text-ever-ink">{carrot.notes}</p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <button
                onClick={() => toggleGoalCompleted(carrot)}
                className={cn(
                  'w-full flex items-center justify-center px-4 py-2 rounded-[11px] text-sm font-medium transition',
                  carrot.is_goal_completed
                    ? 'bg-ever-lime text-ever-lime-ink font-semibold'
                    : 'border border-ever-line text-ever-dim hover:text-ever-ink hover:bg-white/5',
                )}
              >
                <Target className="h-4 w-4 mr-2" />
                {carrot.is_goal_completed ? 'Goal Completed!' : 'Complete Goal'}
              </button>

              <button
                onClick={() => togglePurchased(carrot)}
                disabled={!carrot.is_goal_completed}
                className={cn(
                  'w-full flex items-center justify-center px-4 py-2 rounded-[11px] text-sm font-medium transition',
                  carrot.is_purchased
                    ? 'bg-ever-violet text-white font-semibold'
                    : carrot.is_goal_completed
                    ? 'border border-ever-lime text-ever-ink hover:bg-white/5'
                    : 'border border-ever-line text-ever-faint cursor-not-allowed',
                )}
              >
                <Gift className="h-4 w-4 mr-2" />
                {carrot.is_purchased ? 'Purchased!' : 'Mark as Purchased'}
              </button>

              <Button variant="ghost" onClick={() => handleEdit(carrot)} className="w-full">
                Edit
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {carrots.length === 0 && (
        <div className="text-center py-12">
          <Gift className="h-12 w-12 text-ever-faint mx-auto mb-4" />
          <p className="text-ever-dim">No carrots yet. Add your first reward goal!</p>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-ever-card border border-ever-line rounded-ever text-ever-ink p-8 max-w-md w-full mx-4">
            <h2 className="text-2xl font-bold text-ever-ink mb-6">
              {editingCarrot ? 'Edit Carrot' : 'Add New Carrot'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ever-dim mb-1">
                  Item Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.item_name}
                  onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
                  className="w-full px-3 py-2 bg-ever-bg border border-ever-line text-ever-ink placeholder-ever-faint rounded-lg focus:outline-none focus:border-ever-lime"
                  placeholder="e.g., New Headphones"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-ever-dim mb-1">
                  Goal to Complete *
                </label>
                <textarea
                  required
                  value={formData.goal_description}
                  onChange={(e) => setFormData({ ...formData, goal_description: e.target.value })}
                  className="w-full px-3 py-2 bg-ever-bg border border-ever-line text-ever-ink placeholder-ever-faint rounded-lg focus:outline-none focus:border-ever-lime"
                  rows={3}
                  placeholder="e.g., Complete 10 workout sessions"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-ever-dim mb-1">
                  Estimated Cost
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.estimated_cost}
                  onChange={(e) => setFormData({ ...formData, estimated_cost: e.target.value })}
                  className="w-full px-3 py-2 bg-ever-bg border border-ever-line text-ever-ink placeholder-ever-faint rounded-lg focus:outline-none focus:border-ever-lime"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-ever-dim mb-1">
                  Priority
                </label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value as 'low' | 'medium' | 'high' })}
                  className="w-full px-3 py-2 bg-ever-bg border border-ever-line text-ever-ink rounded-lg focus:outline-none focus:border-ever-lime"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-ever-dim mb-1">
                  Notes
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-ever-bg border border-ever-line text-ever-ink placeholder-ever-faint rounded-lg focus:outline-none focus:border-ever-lime"
                  rows={2}
                  placeholder="Any additional notes..."
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <Button type="submit" className="flex-1">
                  {editingCarrot ? 'Update' : 'Add'} Carrot
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="flex-1"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingCarrot(null);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Carrots;
