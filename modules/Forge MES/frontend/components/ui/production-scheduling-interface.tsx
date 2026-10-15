'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Calendar, AlertTriangle, Plus, Edit, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { format, parseISO, addDays } from 'date-fns'
import { productionSchedulingApi, type ProductionSchedule } from '@/lib/api/production-scheduling'
import type { Equipment, Recipe } from '@/types'

interface ProductionSchedulingInterfaceProps {
  className?: string
}

export function ProductionSchedulingInterface({ className }: ProductionSchedulingInterfaceProps) {
  const [selectedSchedule, setSelectedSchedule] = useState<ProductionSchedule | null>(null)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [dateRange, setDateRange] = useState({
    startDate: format(new Date(), 'yyyy-MM-dd'),
    endDate: format(addDays(new Date(), 30), 'yyyy-MM-dd')
  })

  const queryClient = useQueryClient()

  // Fetch production schedules
  const { data: schedules, isLoading: schedulesLoading, error: schedulesError } = useQuery({
    queryKey: ['production-schedules', dateRange],
    queryFn: () => productionSchedulingApi.getSchedules({
      startDate: dateRange.startDate,
      endDate: dateRange.endDate
    }),
    refetchInterval: 30000, // Refetch every 30 seconds for real-time updates
  })

  // Fetch available equipment
  const { data: equipment } = useQuery({
    queryKey: ['available-equipment', dateRange],
    queryFn: () => productionSchedulingApi.getAvailableEquipment({
      startDate: dateRange.startDate,
      endDate: dateRange.endDate
    }),
  })

  // Fetch available recipes
  const { data: recipes } = useQuery({
    queryKey: ['available-recipes'],
    queryFn: () => productionSchedulingApi.getAvailableRecipes(),
  })

  // Create schedule mutation
  const createScheduleMutation = useMutation({
    mutationFn: productionSchedulingApi.createSchedule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['production-schedules'] })
      setIsCreateDialogOpen(false)
      toast.success('Production schedule created successfully')
    },
    onError: (error) => {
      toast.error(`Failed to create schedule: ${error.message}`)
    },
  })

  // Update schedule mutation
  const updateScheduleMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<ProductionSchedule> }) =>
      productionSchedulingApi.updateSchedule(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['production-schedules'] })
      setIsEditDialogOpen(false)
      toast.success('Production schedule updated successfully')
    },
    onError: (error) => {
      toast.error(`Failed to update schedule: ${error.message}`)
    },
  })

  // Delete schedule mutation
  const deleteScheduleMutation = useMutation({
    mutationFn: productionSchedulingApi.deleteSchedule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['production-schedules'] })
      toast.success('Production schedule deleted successfully')
    },
    onError: (error) => {
      toast.error(`Failed to delete schedule: ${error.message}`)
    },
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800'
      case 'draft':
        return 'bg-yellow-100 text-yellow-800'
      case 'completed':
        return 'bg-blue-100 text-blue-800'
      case 'cancelled':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getConflictSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-800'
      case 'high':
        return 'bg-orange-100 text-orange-800'
      case 'medium':
        return 'bg-yellow-100 text-yellow-800'
      case 'low':
        return 'bg-blue-100 text-blue-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  if (schedulesLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (schedulesError) {
    return (
      <div className="text-center text-red-600 p-4">
        Error loading production schedules: {schedulesError.message}
      </div>
    )
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Production Scheduling</h2>
          <p className="text-gray-600">Manage whiskey production schedules and optimize resource allocation</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Schedule
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Production Schedule</DialogTitle>
              <DialogDescription>
                Create a new production schedule for whiskey manufacturing
              </DialogDescription>
            </DialogHeader>
            <CreateScheduleForm
              equipment={equipment || []}
              recipes={recipes || []}
              onSubmit={(data) => createScheduleMutation.mutate(data)}
              isLoading={createScheduleMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Date Range Filter */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Schedule Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-end">
            <div>
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={dateRange.startDate}
                onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="endDate">End Date</Label>
              <Input
                id="endDate"
                type="date"
                value={dateRange.endDate}
                onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
              />
            </div>
            <Button variant="outline">
              <Calendar className="h-4 w-4 mr-2" />
              Apply Filter
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Schedules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {schedules?.map((schedule) => (
          <Card key={schedule.id} className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg">{schedule.name}</CardTitle>
                  <CardDescription>
                    {format(parseISO(schedule.startDate.toString()), 'MMM dd')} - {format(parseISO(schedule.endDate.toString()), 'MMM dd, yyyy')}
                  </CardDescription>
                </div>
                <Badge className={getStatusColor(schedule.status)}>
                  {schedule.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Schedule Stats */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Orders:</span>
                    <span className="ml-2 font-medium">{schedule.orders.length}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Equipment:</span>
                    <span className="ml-2 font-medium">{schedule.equipment.length}</span>
                  </div>
                </div>

                {/* Conflicts */}
                {schedule.conflicts.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center text-sm text-orange-600">
                      <AlertTriangle className="h-4 w-4 mr-1" />
                      {schedule.conflicts.length} Conflict{schedule.conflicts.length > 1 ? 's' : ''}
                    </div>
                    {schedule.conflicts.slice(0, 2).map((conflict) => (
                      <div key={conflict.id} className="text-xs">
                        <Badge className={getConflictSeverityColor(conflict.severity)}>
                          {conflict.severity}
                        </Badge>
                        <span className="ml-2">{conflict.description}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Equipment Utilization */}
                <div className="space-y-2">
                  <div className="text-sm font-medium">Equipment Utilization</div>
                  {schedule.utilization.slice(0, 3).map((util) => (
                    <div key={util.equipmentId} className="flex justify-between text-xs">
                      <span>{util.equipmentId}</span>
                      <span className={`font-medium ${util.utilizationRate > 80 ? 'text-red-600' : util.utilizationRate > 60 ? 'text-yellow-600' : 'text-green-600'}`}>
                        {Math.round(util.utilizationRate)}%
                      </span>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedSchedule(schedule)
                      setIsEditDialogOpen(true)
                    }}
                  >
                    <Edit className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (confirm('Are you sure you want to delete this schedule?')) {
                        deleteScheduleMutation.mutate(schedule.id)
                      }
                    }}
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty State */}
      {schedules?.length === 0 && (
        <Card>
          <CardContent className="text-center py-12">
            <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No schedules found</h3>
            <p className="text-gray-500 mb-4">Create your first production schedule to get started</p>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Schedule
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Production Schedule</DialogTitle>
            <DialogDescription>
              Update the production schedule details
            </DialogDescription>
          </DialogHeader>
          {selectedSchedule && (
            <EditScheduleForm
              schedule={selectedSchedule}
              equipment={equipment || []}
              recipes={recipes || []}
              onSubmit={(updates) => updateScheduleMutation.mutate({ id: selectedSchedule.id, updates })}
              isLoading={updateScheduleMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Create Schedule Form Component
interface CreateScheduleFormProps {
  equipment: Equipment[]
  recipes: Recipe[]
  onSubmit: (data: Omit<ProductionSchedule, 'id' | 'createdAt' | 'updatedAt'>) => void
  isLoading: boolean
}

function CreateScheduleForm({ onSubmit, isLoading }: CreateScheduleFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    startDate: format(new Date(), 'yyyy-MM-dd'),
    endDate: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
    status: 'draft' as 'draft' | 'active' | 'completed' | 'cancelled',
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({
      ...formData,
      startDate: new Date(formData.startDate),
      endDate: new Date(formData.endDate),
      orders: [],
      equipment: [],
      utilization: [],
      conflicts: [],
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="name">Schedule Name</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
          placeholder="Enter schedule name"
          required
        />
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="startDate">Start Date</Label>
          <Input
            id="startDate"
            type="date"
            value={formData.startDate}
            onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
            required
          />
        </div>
        <div>
          <Label htmlFor="endDate">End Date</Label>
          <Input
            id="endDate"
            type="date"
            value={formData.endDate}
            onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
            required
          />
        </div>
      </div>

      <div>
        <Label htmlFor="status">Status</Label>
        <Select value={formData.status} onValueChange={(value: 'draft' | 'active' | 'completed' | 'cancelled') => 
          setFormData(prev => ({ ...prev, status: value }))
        }>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={isLoading}>
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Creating...' : 'Create Schedule'}
        </Button>
      </div>
    </form>
  )
}

// Edit Schedule Form Component
interface EditScheduleFormProps {
  schedule: ProductionSchedule
  equipment: Equipment[]
  recipes: Recipe[]
  onSubmit: (updates: Partial<ProductionSchedule>) => void
  isLoading: boolean
}

function EditScheduleForm({ schedule, onSubmit, isLoading }: EditScheduleFormProps) {
  const [formData, setFormData] = useState({
    name: schedule.name,
    startDate: format(schedule.startDate, 'yyyy-MM-dd'),
    endDate: format(schedule.endDate, 'yyyy-MM-dd'),
    status: schedule.status,
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({
      ...formData,
      startDate: new Date(formData.startDate),
      endDate: new Date(formData.endDate),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="name">Schedule Name</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
          placeholder="Enter schedule name"
          required
        />
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="startDate">Start Date</Label>
          <Input
            id="startDate"
            type="date"
            value={formData.startDate}
            onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
            required
          />
        </div>
        <div>
          <Label htmlFor="endDate">End Date</Label>
          <Input
            id="endDate"
            type="date"
            value={formData.endDate}
            onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
            required
          />
        </div>
      </div>

      <div>
        <Label htmlFor="status">Status</Label>
        <Select value={formData.status} onValueChange={(value: 'draft' | 'active' | 'completed' | 'cancelled') => 
          setFormData(prev => ({ ...prev, status: value }))
        }>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={isLoading}>
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Updating...' : 'Update Schedule'}
        </Button>
      </div>
    </form>
  )
} 