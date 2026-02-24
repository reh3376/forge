import { apiClient } from './rest-client'
import type { 
  ProductionOrder, 
  Equipment, 
  Recipe,
  ApiResponse
} from '@/types'

// Additional types for production scheduling
export interface ProductionSchedule {
  id: string
  name: string
  startDate: Date
  endDate: Date
  orders: ProductionOrder[]
  equipment: Equipment[]
  utilization: EquipmentUtilization[]
  conflicts: ScheduleConflict[]
  status: 'draft' | 'active' | 'completed' | 'cancelled'
  createdAt: Date
  updatedAt: Date
}

export interface ScheduleEntry {
  id: string
  orderId: string
  equipmentId: string
  startTime: Date
  endTime: Date
  stage: string
  status: 'scheduled' | 'in_progress' | 'completed' | 'delayed'
}

export interface EquipmentUtilization {
  equipmentId: string
  utilizationRate: number
  scheduledHours: number
  availableHours: number
  maintenanceHours: number
}

export interface ScheduleConflict {
  id: string
  type: 'equipment_overlap' | 'resource_shortage' | 'maintenance_conflict'
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  affectedOrders: string[]
  suggestedResolution?: string
}

export interface ScheduleOptimization {
  currentEfficiency: number
  optimizedEfficiency: number
  suggestions: OptimizationSuggestion[]
  estimatedSavings: {
    time: number
    cost: number
  }
}

export interface OptimizationSuggestion {
  type: 'reorder' | 'parallel' | 'equipment_change' | 'timing_adjustment'
  description: string
  impact: number
  effort: 'low' | 'medium' | 'high'
}

// Production Schedule API endpoints
export const productionSchedulingApi = {
  // Get all production schedules
  getSchedules: async (params?: {
    startDate?: string
    endDate?: string
    equipmentId?: string
    status?: 'draft' | 'active' | 'completed' | 'cancelled'
  }): Promise<ProductionSchedule[]> => {
    const response = await apiClient.get<ApiResponse<ProductionSchedule[]>>('/production/schedules', { params })
    return response.data.data
  },

  // Get a specific schedule by ID
  getSchedule: async (id: string): Promise<ProductionSchedule> => {
    const response = await apiClient.get<ApiResponse<ProductionSchedule>>(`/production/schedules/${id}`)
    return response.data.data
  },

  // Create a new production schedule
  createSchedule: async (schedule: Omit<ProductionSchedule, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProductionSchedule> => {
    const response = await apiClient.post('/api/production/schedules', schedule)
    return response.data
  },

  // Update an existing schedule
  updateSchedule: async (id: string, updates: Partial<ProductionSchedule>): Promise<ProductionSchedule> => {
    const response = await apiClient.put(`/api/production/schedules/${id}`, updates)
    return response.data
  },

  // Delete a schedule
  deleteSchedule: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/production/schedules/${id}`)
  },

  // Get schedule entries for a specific time period
  getScheduleEntries: async (params: {
    startDate: string
    endDate: string
    equipmentId?: string
  }): Promise<ScheduleEntry[]> => {
    const response = await apiClient.get('/api/production/schedule-entries', { params })
    return response.data
  },

  // Create a new schedule entry
  createScheduleEntry: async (entry: Omit<ScheduleEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<ScheduleEntry> => {
    const response = await apiClient.post('/api/production/schedule-entries', entry)
    return response.data
  },

  // Update a schedule entry
  updateScheduleEntry: async (id: string, updates: Partial<ScheduleEntry>): Promise<ScheduleEntry> => {
    const response = await apiClient.put(`/api/production/schedule-entries/${id}`, updates)
    return response.data
  },

  // Delete a schedule entry
  deleteScheduleEntry: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/production/schedule-entries/${id}`)
  },

  // Get available equipment for scheduling
  getAvailableEquipment: async (params?: {
    startDate?: string
    endDate?: string
    equipmentType?: string
  }): Promise<Equipment[]> => {
    const response = await apiClient.get('/api/production/equipment/available', { params })
    return response.data
  },

  // Get production capacity for a time period
  getProductionCapacity: async (params: {
    startDate: string
    endDate: string
    equipmentId?: string
  }): Promise<EquipmentUtilization[]> => {
    const response = await apiClient.get<ApiResponse<EquipmentUtilization[]>>('/production/capacity', { params })
    return response.data.data
  },

  // Check for schedule conflicts
  checkScheduleConflicts: async (entry: Omit<ScheduleEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<ScheduleConflict[]> => {
    const response = await apiClient.post('/api/production/schedule-conflicts', entry)
    return response.data
  },

  // Optimize schedule
  optimizeSchedule: async (params: {
    scheduleId: string
    optimizationCriteria: 'efficiency' | 'cost' | 'time' | 'quality'
  }): Promise<ScheduleOptimization> => {
    const response = await apiClient.post('/api/production/optimize-schedule', params)
    return response.data
  },

  // Get recipes available for scheduling
  getAvailableRecipes: async (): Promise<Recipe[]> => {
    const response = await apiClient.get('/api/production/recipes/available')
    return response.data
  },

  // Bulk operations
  bulkCreateScheduleEntries: async (entries: Omit<ScheduleEntry, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<ScheduleEntry[]> => {
    const response = await apiClient.post('/api/production/schedule-entries/bulk', { entries })
    return response.data
  },

  bulkUpdateScheduleEntries: async (updates: { id: string; updates: Partial<ScheduleEntry> }[]): Promise<ScheduleEntry[]> => {
    const response = await apiClient.put('/api/production/schedule-entries/bulk', { updates })
    return response.data
  },

  bulkDeleteScheduleEntries: async (ids: string[]): Promise<void> => {
    await apiClient.delete('/api/production/schedule-entries/bulk', { data: { ids } })
  },
} 