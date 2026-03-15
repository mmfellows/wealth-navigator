import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Gift, Check, X, Plus, Target, DollarSign, AlertCircle } from 'lucide-react';

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
      const response = await fetch('http://localhost:3001/api/carrots');
      if (!response.ok) throw new Error('Failed to fetch carrots');
      return response.json();
    }
  });

  // Fetch stats
  const { data: stats } = useQuery<CarrotStats>({
    queryKey: ['carrots-stats'],
    queryFn: async () => {
      const response = await fetch('http://localhost:3001/api/carrots/stats/summary');
      if (!response.ok) throw new Error('Failed to fetch stats');
      return response.json();
    }
  });

  // Create carrot mutation
  const createCarrot = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await fetch('http://localhost:3001/api/carrots', {
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
      const response = await fetch(`http://localhost:3001/api/carrots/${id}`, {
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
      const response = await fetch(`http://localhost:3001/api/carrots/${id}`, {
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
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Carrots</h1>
        <button
          onClick={() => {
            setEditingCarrot(null);
            resetForm();
            setShowAddModal(true);
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Carrot
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg p-6 shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Carrots</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.total || 0}</p>
            </div>
            <Gift className="h-10 w-10 text-gray-400" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-6 shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Goals Completed</p>
              <p className="text-2xl font-bold text-green-600">{stats?.goals_completed || 0}</p>
            </div>
            <Target className="h-10 w-10 text-green-400" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-6 shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Ready to Buy</p>
              <p className="text-2xl font-bold text-blue-600">{stats?.ready_to_buy || 0}</p>
            </div>
            <AlertCircle className="h-10 w-10 text-blue-400" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-6 shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Purchased</p>
              <p className="text-2xl font-bold text-purple-600">{stats?.purchased_count || 0}</p>
            </div>
            <Check className="h-10 w-10 text-purple-400" />
          </div>
        </div>
      </div>

      {/* Carrots List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {carrots.map((carrot: Carrot) => (
          <div
            key={carrot.id}
            className={`bg-white rounded-lg p-6 shadow-sm border-2 ${
              carrot.is_purchased
                ? 'border-purple-300 bg-purple-50'
                : carrot.is_goal_completed
                ? 'border-green-300 bg-green-50'
                : 'border-gray-200'
            }`}
          >
            <div className="flex justify-between items-start mb-4">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-1">
                  {carrot.item_name}
                </h3>
                <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${priorityColors[carrot.priority]}`}>
                  {carrot.priority}
                </span>
              </div>
              <button
                onClick={() => deleteCarrot.mutate(carrot.id)}
                className="text-red-500 hover:text-red-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 mb-4">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-1">Goal:</p>
                <p className="text-sm text-gray-700">{carrot.goal_description}</p>
              </div>

              {carrot.estimated_cost && (
                <div className="flex items-center text-sm text-gray-600">
                  <DollarSign className="h-4 w-4 mr-1" />
                  ${carrot.estimated_cost.toFixed(2)}
                </div>
              )}

              {carrot.notes && (
                <div>
                  <p className="text-sm font-medium text-gray-600 mb-1">Notes:</p>
                  <p className="text-sm text-gray-700">{carrot.notes}</p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <button
                onClick={() => toggleGoalCompleted(carrot)}
                className={`w-full flex items-center justify-center px-4 py-2 rounded-md text-sm font-medium ${
                  carrot.is_goal_completed
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Target className="h-4 w-4 mr-2" />
                {carrot.is_goal_completed ? 'Goal Completed!' : 'Complete Goal'}
              </button>

              <button
                onClick={() => togglePurchased(carrot)}
                disabled={!carrot.is_goal_completed}
                className={`w-full flex items-center justify-center px-4 py-2 rounded-md text-sm font-medium ${
                  carrot.is_purchased
                    ? 'bg-purple-600 text-white hover:bg-purple-700'
                    : carrot.is_goal_completed
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                <Gift className="h-4 w-4 mr-2" />
                {carrot.is_purchased ? 'Purchased!' : 'Mark as Purchased'}
              </button>

              <button
                onClick={() => handleEdit(carrot)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Edit
              </button>
            </div>
          </div>
        ))}
      </div>

      {carrots.length === 0 && (
        <div className="text-center py-12">
          <Gift className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No carrots yet. Add your first reward goal!</p>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              {editingCarrot ? 'Edit Carrot' : 'Add New Carrot'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Item Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.item_name}
                  onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., New Headphones"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Goal to Complete *
                </label>
                <textarea
                  required
                  value={formData.goal_description}
                  onChange={(e) => setFormData({ ...formData, goal_description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  rows={3}
                  placeholder="e.g., Complete 10 workout sessions"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Estimated Cost
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.estimated_cost}
                  onChange={(e) => setFormData({ ...formData, estimated_cost: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Priority
                </label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value as 'low' | 'medium' | 'high' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  rows={2}
                  placeholder="Any additional notes..."
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
                >
                  {editingCarrot ? 'Update' : 'Add'} Carrot
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingCarrot(null);
                    resetForm();
                  }}
                  className="flex-1 bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Carrots;
