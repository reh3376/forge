'use client'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Package, Edit, ChevronUp, ChevronDown, Plus, Shield, User, X, Play, CheckCircle, Trash2 } from 'lucide-react'
import ScheduleView from '@/components/schedule/ScheduleView'
import { ProductionOrderWizard, type ProductionOrderData } from '@/components/production/production-order-wizard'
import { AddToScheduleDialog } from '@/components/schedule/AddToScheduleDialog'
import { AddToScheduleDialogMulti } from '@/components/schedule/AddToScheduleDialog-multi'
import { UnscheduledOrdersPanel } from '@/components/production/UnscheduledOrdersPanel'
import { StartOrderConfirmDialog } from '@/components/schedule/StartOrderConfirmDialog'
import { CompleteOrderConfirmDialog } from '@/components/schedule/CompleteOrderConfirmDialog'
import { UnifiedScheduleOrderEditModal } from '@/components/schedule/UnifiedScheduleOrderEditModal'
import { formatRecipeName } from '@/lib/utils'
import { toast } from 'sonner'
import { UnifiedGraphQLClient } from '@/lib/api/unified-graphql-client'
import { scheduleOrderQueueAPI } from '@/lib/api/schedule-order-queue'
import { useJWTAuth } from '@/hooks/useJWTAuth'
import { useAuth } from '@/lib/auth-context'
import { SchedulingRouteGuard } from '@/components/auth/route-guard'
import { SchedulingPermissions } from '@/lib/rbac'
import { productionOrderWorkflow, transformWizardDataToWorkflowData } from '@/lib/api/production-order-workflows'
import { ChangeoverPanel } from '@/components/changeover'
import {
  GET_PRODUCTION_ORDERS
} from '@/lib/api/production-order-queries'
import {
  GET_SCHEDULE_ORDER_QUEUES
} from '@/lib/api/schedule-order-queries'
import type {
  ProductionOrderV2 as ProductionOrder,
  ScheduleOrderQueue
} from '@/types'

// Create the GraphQL client instance with JWT authentication
const graphqlClient = new UnifiedGraphQLClient({
  useJWTAuth: true,
  enableRetry: true,
})

export default function ProductionSchedulingPage() {
  const router = useRouter()
  const [productionOrders, setProductionOrders] = useState<ProductionOrder[]>([])
  const [scheduleOrderQueues, setScheduleOrderQueues] = useState<ScheduleOrderQueue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAllOrders, setShowAllOrders] = useState(false)
  const [selectedProductionOrder, setSelectedProductionOrder] = useState<ProductionOrder | null>(null)
  const [selectedProductionOrders, setSelectedProductionOrders] = useState<ProductionOrder[]>([])
  const [selectedScheduleOrder, setSelectedScheduleOrder] = useState<ScheduleOrderQueue | null>(null)
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false)
  const [isScheduleDialogMultiOpen, setIsScheduleDialogMultiOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [unscheduledOrdersRefresh, setUnscheduledOrdersRefresh] = useState(0)
  const [isClient, setIsClient] = useState(false)
  const [queueFilter, setQueueFilter] = useState<'queue' | 'active' | 'all'>('queue')
  const [currentView, setCurrentView] = useState<'schedule' | 'line' | 'changeover'>('schedule')
  const [mobilePanel, setMobilePanel] = useState<'orders' | 'schedule'>('schedule')
  const [isCreateOrderWizardOpen, setIsCreateOrderWizardOpen] = useState(false)
  const [movingItems, setMovingItems] = useState<Set<string>>(new Set())

  // Start order dialog state
  const [isStartDialogOpen, setIsStartDialogOpen] = useState(false)
  const [selectedStartOrder, setSelectedStartOrder] = useState<ScheduleOrderQueue | null>(null)
  const [startLoading, setStartLoading] = useState(false)

  // Complete order dialog state
  const [isCompleteDialogOpen, setIsCompleteDialogOpen] = useState(false)
  const [selectedCompleteOrder, setSelectedCompleteOrder] = useState<ScheduleOrderQueue | null>(null)
  const [completeLoading, setCompleteLoading] = useState(false)

  // Get current user for API calls and permissions
  const { user } = useJWTAuth()
  const { user: authUser } = useAuth()

  // Effective username for API calls - fallback chain: JWT username -> MSAL email -> MSAL name -> 'system'
  const effectiveUsername = user?.username || authUser?.email || authUser?.name || 'system'

  // Get user permissions for scheduling
  const userRoles = authUser?.roles || []
  const canManageQueue = SchedulingPermissions.canManageQueue(userRoles)
  const canCreateOrders = SchedulingPermissions.canCreateOrders(userRoles)
  const accessLevel = SchedulingPermissions.getAccessLevel(userRoles)

  // Ensure we're on the client side
  useEffect(() => {
    setIsClient(true)
  }, [])

  // Data loading function that can be called from multiple places
  const loadProductionData = async () => {
    try {
      setLoading(true)
      setError(null)
      
      // ✅ Use authenticated GraphQL client with ordering to prioritize unscheduled orders
      const productionOrdersData = await graphqlClient.query<{ productionOrders: ProductionOrder[] }>(
        GET_PRODUCTION_ORDERS,
        {
          variables: { 
            orderBy: [
              { scheduleOrderId: 'Desc' }, // Orders without scheduleOrder (null) will appear first
              { createdAt: 'Desc' } // Then order by creation date (newest first)
            ]
          }
        }
      )
      
      if (productionOrdersData.productionOrders) {
        setProductionOrders(productionOrdersData.productionOrders)
      }
      
      const scheduleQueueData = await graphqlClient.query<{ scheduleOrderQueues: ScheduleOrderQueue[] }>(
        GET_SCHEDULE_ORDER_QUEUES,
        {
          variables: { 
            take: 50,
            orderBy: [{ queueIndex: 'Asc' }]
          }
        }
      )
      
      if (scheduleQueueData.scheduleOrderQueues) {
        setScheduleOrderQueues(scheduleQueueData.scheduleOrderQueues)
      }
      
    } catch (err) {
      console.error('Error fetching data:', err)
      setError('Failed to load production data. Please check your connection and authentication.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isClient) return
    loadProductionData()
  }, [isClient])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Complete':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
      case 'InProgress':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
      case 'Initiated':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
      case 'Planned':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
      case 'Scheduled':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
      case 'Created':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400'
      case 'Cancelled':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  // Filter production orders based on toggle
  const filteredProductionOrders = productionOrders.filter(order => {
    if (showAllOrders) return true
    return !order.scheduleOrder // Only unscheduled orders
  })

  // Filter schedule order queues based on filter selection
  const filteredScheduleOrderQueues = scheduleOrderQueues.filter(queueItem => {
    if (queueFilter === 'all') return true
    if (queueFilter === 'active') return (queueItem.queueIndex ?? 0) <= 0 // Active/in-progress items
    return (queueItem.queueIndex ?? 0) > 0 // Queue: future items only
  })

  const handleScheduleOrder = (order: ProductionOrder) => {
    setSelectedProductionOrder(order)
    setIsScheduleDialogOpen(true)
  }

  const handleScheduleMultipleOrders = (orders: ProductionOrder[]) => {
    setSelectedProductionOrders(orders)
    setIsScheduleDialogMultiOpen(true)
  }

  const handleEditScheduleOrder = (scheduleQueue: ScheduleOrderQueue) => {
    setSelectedScheduleOrder(scheduleQueue)
    setIsEditDialogOpen(true)
  }

  const handleCreateProductionOrder = async (orderData: ProductionOrderData) => {
    try {
      console.log('🔄 Creating production order with comprehensive backend mutation:', orderData)
      
      // Validate required fields
      if (!orderData.selectedRecipe?.id) {
        throw new Error('Recipe selection is required')
      }
      
      if (!orderData.customerCode) {
        throw new Error('Customer code is required')
      }

      console.log('📋 Using username for order creation:', effectiveUsername)

      // Transform wizard data to workflow format - convert to Record<string, unknown>
      const wizardDataRecord: Record<string, unknown> = {
        orderName: orderData.orderName,
        quantity: orderData.quantity,
        units: orderData.units,
        startDate: orderData.startDate,
        endDate: orderData.endDate,
        customerCode: orderData.customerCode,
        priority: orderData.priority,
        notes: orderData.notes,
        finalProof: orderData.finalProof,
        containerItem: orderData.containerItem,
        containerType: orderData.containerType,
        cooks: orderData.cooks,
        fermenters: orderData.fermenters,
        totalGrainLoad: orderData.totalGrainLoad,
        estBblsPerFerm: orderData.estBblsPerFerm,
        estPGsPerBshl: orderData.estPGsPerBshl,
        estPGsPerBbl: orderData.estPGsPerBbl,
        upperControlLimit: orderData.upperControlLimit,
        lowerControlLimit: orderData.lowerControlLimit,
        selectedRecipe: orderData.selectedRecipe,
        bomItems: orderData.bomItems,
        binConfigurations: orderData.binConfigurations,
        totalFermenters: orderData.fermenters,
        autoSchedule: orderData.autoSchedule
      }
      
      const workflowData = transformWizardDataToWorkflowData(wizardDataRecord)
      
      // Use the comprehensive backend mutation
      console.log('🚀 Creating production order with comprehensive backend mutation...')
      const result = await productionOrderWorkflow.createProductionOrderFromWizard(
        workflowData,
        effectiveUsername
      )
      
      console.log('✅ Production order created successfully:', result.productionOrder.id)

      // Show success message
      toast.success(`Production order "${result.productionOrder.name}" created successfully with ID: ${result.productionOrder.id}`)

      // Refresh the production data and unscheduled orders panel
      await loadProductionData()
      await refreshScheduleQueue()
      setUnscheduledOrdersRefresh(prev => prev + 1)

      // Close the wizard
      setIsCreateOrderWizardOpen(false)
      
    } catch (error) {
      console.error('❌ Error creating production order:', error)
      
      // Show error message
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred'
      toast.error(`Error creating production order: ${errorMessage}`)
    }
  }

  // Handle moving queue items up and down
  const handleMoveUp = async (queueItem: ScheduleOrderQueue, currentIndex: number) => {
    if (currentIndex === 0) {
      toast.warning('Item is already at the top of the queue')
      return
    }

    const itemId = queueItem.id
    setMovingItems(prev => new Set(prev).add(itemId))

    try {
      const result = await scheduleOrderQueueAPI.moveUp(
        itemId,
        queueItem.queueIndex || currentIndex,
        effectiveUsername
      )

      if (result.error) {
        toast.error(`Failed to move item up: ${result.error}`)
        return
      }

      // Refresh the queue data
      await refreshScheduleQueue()
      toast.success('Item moved up successfully')
    } catch (error) {
      console.error('Error moving item up:', error)
      toast.error('Failed to move item up')
    } finally {
      setMovingItems(prev => {
        const newSet = new Set(prev)
        newSet.delete(itemId)
        return newSet
      })
    }
  }

  const handleMoveDown = async (queueItem: ScheduleOrderQueue, currentIndex: number, maxIndex: number) => {
    if (currentIndex >= maxIndex) {
      toast.warning('Item is already at the bottom of the queue')
      return
    }

    const itemId = queueItem.id
    setMovingItems(prev => new Set(prev).add(itemId))

    try {
      const result = await scheduleOrderQueueAPI.moveDown(
        itemId,
        queueItem.queueIndex || currentIndex,
        maxIndex,
        effectiveUsername
      )

      if (result.error) {
        toast.error(`Failed to move item down: ${result.error}`)
        return
      }

      // Refresh the queue data
      await refreshScheduleQueue()
      toast.success('Item moved down successfully')
    } catch (error) {
      console.error('Error moving item down:', error)
      toast.error('Failed to move item down')
    } finally {
      setMovingItems(prev => {
        const newSet = new Set(prev)
        newSet.delete(itemId)
        return newSet
      })
    }
  }

  // Helper function to refresh just the schedule queue data
  const refreshScheduleQueue = async () => {
    try {
      const scheduleQueueData = await graphqlClient.query<{ scheduleOrderQueues: ScheduleOrderQueue[] }>(
        GET_SCHEDULE_ORDER_QUEUES,
        {
          variables: { 
            take: 50,
            orderBy: [{ queueIndex: 'Asc' }]
          },
          fetchPolicy: 'network-only' // Force fresh data
        }
      )
      
      if (scheduleQueueData.scheduleOrderQueues) {
        setScheduleOrderQueues(scheduleQueueData.scheduleOrderQueues)
      }
    } catch (error) {
      console.error('Error refreshing schedule queue:', error)
    }
  }

  // Handle starting an order at queue index 1
  const handleStartOrder = async (queueItem: ScheduleOrderQueue) => {
    if (queueItem.queueIndex !== 1) {
      toast.error('Only orders at queue position 1 can be started')
      return
    }

    setSelectedStartOrder(queueItem)
    setIsStartDialogOpen(true)
  }

  const handleConfirmStartOrder = async () => {
    if (!selectedStartOrder) return

    setStartLoading(true)
    try {
      const result = await scheduleOrderQueueAPI.startOrder(
        selectedStartOrder.id,
        effectiveUsername
      )

      if (result.error) {
        toast.error(`Failed to start order: ${result.error}`)
        return
      }

      // Refresh the queue data
      await refreshScheduleQueue()
      toast.success('Order started successfully')
      
      // Close the dialog
      setIsStartDialogOpen(false)
      setSelectedStartOrder(null)
    } catch (error) {
      console.error('Error starting order:', error)
      toast.error('Failed to start order')
    } finally {
      setStartLoading(false)
    }
  }

  // Handle completing an order for negative indices < -1
  const handleCompleteOrder = async (queueItem: ScheduleOrderQueue) => {
    if ((queueItem.queueIndex || 0) >= -1) {
      toast.error('Only orders at negative queue positions (< -1) can be marked complete')
      return
    }

    setSelectedCompleteOrder(queueItem)
    setIsCompleteDialogOpen(true)
  }

  const handleConfirmCompleteOrder = async () => {
    if (!selectedCompleteOrder) return

    setCompleteLoading(true)
    try {
      // Use the MCP GraphQL client to call the completeScheduleOrderQueue mutation
      const query = `
        mutation CompleteScheduleOrderQueue($where: ScheduleOrderQueueWhereUniqueInput!) {
          completeScheduleOrderQueue(where: $where) {
            id
            queueIndex
            scheduleOrder {
              id
              name
              status
              recipeName
            }
          }
        }
      `

      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          variables: {
            where: {
              id: selectedCompleteOrder.id
            }
          },
        }),
      })

      const result = await response.json()

      if (result.errors) {
        console.error('GraphQL errors:', result.errors)
        toast.error(`Failed to complete order: ${result.errors[0]?.message}`)
        return
      }

      // Refresh the queue data
      await loadProductionData()
      await refreshScheduleQueue()
      toast.success('Order marked as complete successfully')

      // Close the dialog
      setIsCompleteDialogOpen(false)
      setSelectedCompleteOrder(null)
    } catch (error) {
      console.error('Error completing order:', error)
      toast.error('Failed to complete order')
    } finally {
      setCompleteLoading(false)
    }
  }

  // Handle deleting a schedule order
  const handleDeleteScheduleOrder = async (queueItem: ScheduleOrderQueue) => {
    if ((queueItem.queueIndex ?? 0) === 0) {
      toast.error('Cannot delete currently running order (queue index 0)')
      return
    }

    // Count production orders
    const productionOrderCount = queueItem.scheduleOrder.productionOrders?.length || 0

    // Confirmation dialog
    const confirmed = confirm(
      `Delete this schedule order?\n\n` +
      `This will:\n` +
      `• Remove from queue (Position ${queueItem.queueIndex})\n` +
      `• Unlink ${productionOrderCount} production order(s)\n` +
      `• Delete all recipe data\n` +
      `• Resequence remaining queue items\n\n` +
      `Production orders will be marked as available for rescheduling.\n\n` +
      `This cannot be undone. Continue?`
    )

    if (!confirmed) return

    try {
      const result = await scheduleOrderQueueAPI.deleteScheduleOrder(
        queueItem.scheduleOrder.id,
        effectiveUsername
      )

      if (result.error) {
        console.error('Delete error:', result.error)
        toast.error(`Failed to delete order: ${result.error}`)
        return
      }

      // Refresh data
      await loadProductionData()
      await refreshScheduleQueue()
      setUnscheduledOrdersRefresh(prev => prev + 1)

      toast.success('Schedule order deleted successfully')
    } catch (error) {
      console.error('Error deleting schedule order:', error)
      toast.error('Failed to delete schedule order')
    }
  }

  if (!isClient) {
    return <div>Loading...</div>
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading production data...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={() => window.location.reload()}>
              Retry
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <SchedulingRouteGuard requiredLevel="readonly" operation="view">
      <div className="w-full px-4 space-y-6 overflow-x-hidden max-w-full">
        {/* Header with User Access Level */}
        <div className="flex flex-wrap justify-between items-start gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Production Scheduling</h1>
            <p className="text-muted-foreground mt-1 text-sm">Manage production orders and scheduling queue</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-4">
            {/* BOM Consumption Button */}
            <Button
              variant="outline"
              onClick={() => router.push('/operations/bom-consumption')}
            >
              <Package className="h-4 w-4 mr-2" />
              BOM Consumption
            </Button>

            {/* Create Order Button */}
            {canCreateOrders && (
              <Button onClick={() => setIsCreateOrderWizardOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Order
              </Button>
            )}

            {/* User Access Level Badge */}
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <Badge variant="outline" className="capitalize">
                {accessLevel} Access
              </Badge>
            </div>
            {/* User Info */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="h-4 w-4" />
              <span>{effectiveUsername}</span>
            </div>
          </div>
        </div>

        {/* View Toggle - Custom toggle outside Tabs */}
        <div className="mb-6">
          <div className="inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground max-w-[420px] sm:max-w-lg">
            <button
              onClick={() => setCurrentView('schedule')}
              className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 flex-1 ${
                currentView === 'schedule' 
                  ? 'bg-background text-foreground shadow-sm' 
                  : 'hover:bg-background/50'
              }`}
            >
              Schedule Management
            </button>
            <button
              onClick={() => setCurrentView('line')}
              className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 flex-1 ${
                currentView === 'line'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'hover:bg-background/50'
              }`}
            >
              Line View
            </button>
            <button
              onClick={() => setCurrentView('changeover')}
              className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 flex-1 ${
                currentView === 'changeover'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'hover:bg-background/50'
              }`}
            >
              Changeover
            </button>
          </div>
        </div>

        {/* Content based on current view */}
        {currentView === 'schedule' && (
          <div className="space-y-4">
            {/* Mobile Tab Navigation - shown below xl */}
            <div className="xl:hidden flex gap-2 p-2 bg-muted/30 rounded-lg max-w-[280px]">
              <button
                onClick={() => setMobilePanel('schedule')}
                className={`flex-1 py-2 text-sm font-medium rounded ${
                  mobilePanel === 'schedule' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                }`}
              >
                Schedule
              </button>
              <button
                onClick={() => setMobilePanel('orders')}
                className={`flex-1 py-2 text-sm font-medium rounded ${
                  mobilePanel === 'orders' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                }`}
              >
                Orders
              </button>
            </div>

            {/* Mobile View - Single Panel based on tab selection */}
            <div className="xl:hidden h-[calc(100vh-200px)] max-w-full overflow-hidden">
              {mobilePanel === 'orders' && (
                <UnscheduledOrdersPanel
                  onAddToSchedule={handleScheduleMultipleOrders}
                  refreshTrigger={unscheduledOrdersRefresh}
                />
              )}
              {mobilePanel === 'schedule' && (
                <div className="h-full flex flex-col max-w-full overflow-hidden">
                  {/* Mobile filter bar */}
                  <div className="flex items-center justify-between py-2 px-1 border-b flex-shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {filteredScheduleOrderQueues.length} orders
                    </span>
                    <div className="flex items-center gap-2">
                      <Select value={queueFilter} onValueChange={(value: 'queue' | 'active' | 'all') => setQueueFilter(value)}>
                        <SelectTrigger className="w-[120px] h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="queue">Queue</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="all">All</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={refreshScheduleQueue}>
                        Refresh
                      </Button>
                    </div>
                  </div>
                  {/* Mobile card list */}
                  <div className="flex-1 overflow-hidden max-w-full">
                    {/* Empty State */}
                    {filteredScheduleOrderQueues.length === 0 ? (
                      <div className="h-full flex items-center justify-center p-8">
                        <div className="text-center text-muted-foreground">
                          <Package className="h-16 w-16 mx-auto mb-6 opacity-50" />
                          <p className="text-lg font-medium mb-2">No production runs in schedule</p>
                          <p className="text-sm">
                            {queueFilter === 'all' && "Add production orders to the schedule to see them here"}
                            {queueFilter === 'queue' && "No queued production runs (index > 0)"}
                            {queueFilter === 'active' && "No active production runs (index ≤ 0)"}
                          </p>
                        </div>
                      </div>
                    ) : (
                      /* Card View for Mobile */
                      <div className="h-full overflow-auto p-3 space-y-2 max-w-full">
                          {filteredScheduleOrderQueues.map((queueItem, index) => (
                            <div
                              key={queueItem.id}
                              className={`p-3 rounded-lg border cursor-pointer transition-all hover:bg-muted/50 max-w-full overflow-hidden ${
                                selectedScheduleOrder?.id === queueItem.id ? 'bg-primary/10 border-primary/30' : 'bg-card'
                              }`}
                              onClick={() => setSelectedScheduleOrder(queueItem)}
                            >
                              {/* Header row with index and name */}
                              <div className="flex items-center justify-between mb-2 gap-2">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <div className="text-xs font-bold text-foreground bg-muted px-2 py-1 rounded text-center min-w-[28px] flex-shrink-0">
                                    {queueItem.queueIndex ?? 0}
                                  </div>
                                  <span className="text-sm font-medium text-foreground truncate">
                                    {queueItem.scheduleOrder.name || `SHO${queueItem.scheduleOrder.id.slice(-6)}`}
                                  </span>
                                </div>
                                {/* Action buttons */}
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  {canManageQueue && queueItem.queueIndex === 1 && (
                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 hover:bg-green-500/20"
                                      onClick={(e) => { e.stopPropagation(); handleStartOrder(queueItem) }} title="Start Order">
                                      <Play className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                                    </Button>
                                  )}
                                  {canManageQueue && (queueItem.queueIndex || 0) < -1 && (
                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 hover:bg-green-500/20"
                                      onClick={(e) => { e.stopPropagation(); handleCompleteOrder(queueItem) }} title="Mark Complete">
                                      <CheckCircle className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                                    </Button>
                                  )}
                                  {canManageQueue && (
                                    <>
                                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                                        onClick={(e) => { e.stopPropagation(); handleMoveUp(queueItem, index) }}
                                        disabled={index === 0 || movingItems.has(queueItem.id)}>
                                        <ChevronUp className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          const maxQueueIndex = Math.max(...filteredScheduleOrderQueues.map(item => item.queueIndex || 0))
                                          handleMoveDown(queueItem, index, maxQueueIndex)
                                        }}
                                        disabled={(() => {
                                          const maxQueueIndex = Math.max(...filteredScheduleOrderQueues.map(item => item.queueIndex || 0))
                                          return (queueItem.queueIndex || 0) >= maxQueueIndex || movingItems.has(queueItem.id)
                                        })()}>
                                        <ChevronDown className="h-3.5 w-3.5" />
                                      </Button>
                                    </>
                                  )}
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                                    onClick={(e) => { e.stopPropagation(); handleEditScheduleOrder(queueItem) }}>
                                    <Edit className="h-3.5 w-3.5" />
                                  </Button>
                                  {canManageQueue && (queueItem.queueIndex ?? 0) > 0 && (
                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 hover:bg-red-500/20"
                                      onClick={(e) => { e.stopPropagation(); handleDeleteScheduleOrder(queueItem) }} title="Delete Order">
                                      <Trash2 className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                              {/* Info rows - using grid for reliable layout */}
                              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                                <span className="text-muted-foreground">Customer:</span>
                                <span className="text-foreground truncate">
                                  {queueItem.scheduleOrder.customers && queueItem.scheduleOrder.customers.length > 0
                                    ? queueItem.scheduleOrder.customers.map(c => c.name || c.customerCode).filter(Boolean).join(', ')
                                    : 'N/A'}
                                </span>
                                <span className="text-muted-foreground">Recipe:</span>
                                <span className="text-foreground truncate">
                                  {queueItem.scheduleOrder.recipeName ||
                                   (queueItem.scheduleOrder.scheduleOrderRecipe?.Recipe ?
                                     formatRecipeName(queueItem.scheduleOrder.scheduleOrderRecipe.Recipe) : 'N/A')}
                                </span>
                                <span className="text-muted-foreground">Mash Bill:</span>
                                <span className="text-foreground">
                                  {queueItem.scheduleOrder.scheduleOrderRecipe?.customerCode ||
                                   queueItem.scheduleOrder.recipeGroup?.recipe || 'N/A'}
                                </span>
                                <span className="text-muted-foreground">Est. PGs:</span>
                                <span className="text-foreground">
                                  {queueItem.scheduleOrder.totalProofGallons?.toLocaleString() || 'N/A'}
                                </span>
                                <span className="text-muted-foreground">Mash Date:</span>
                                <span className="text-foreground">
                                  {queueItem.scheduleOrder.estimatedMashingStartTime ?
                                    formatDate(queueItem.scheduleOrder.estimatedMashingStartTime) :
                                    (queueItem.scheduleOrder.estimatedStart ? formatDate(queueItem.scheduleOrder.estimatedStart) : 'N/A')}
                                </span>
                                <span className="text-muted-foreground">Barrel Date:</span>
                                <span className="text-foreground">
                                  {queueItem.scheduleOrder.estimatedBarrelingStartTime ?
                                    formatDate(queueItem.scheduleOrder.estimatedBarrelingStartTime) :
                                    (queueItem.scheduleOrder.estimatedEnd ? formatDate(queueItem.scheduleOrder.estimatedEnd) : 'N/A')}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Desktop View - Side by Side Layout */}
            <div className="hidden xl:grid grid-cols-12 gap-4 h-[calc(100vh-180px)]">
              {/* Left Side - Unscheduled Orders Panel */}
              <div className="col-span-3 min-w-0 flex flex-col">
                <UnscheduledOrdersPanel
                  onAddToSchedule={handleScheduleMultipleOrders}
                  refreshTrigger={unscheduledOrdersRefresh}
                />
              </div>

              {/* Right Side - Schedule Queue Section */}
              <div className="col-span-9 min-w-0 flex flex-col">
                <Card className="flex-1 flex flex-col min-w-0">
                  <CardHeader className="flex-shrink-0 py-3 px-4">
                    <div className="flex flex-row items-center justify-between">
                      <div>
                        <CardTitle className="text-base">Production Schedule</CardTitle>
                        <CardDescription className="text-xs">
                          Active production runs {canManageQueue ? '(Drag to reorder)' : '(View only)'}
                        </CardDescription>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Select value={queueFilter} onValueChange={(value: 'queue' | 'active' | 'all') => setQueueFilter(value)}>
                          <SelectTrigger className="w-[140px] h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="queue">Queue (Index &gt; 0)</SelectItem>
                            <SelectItem value="active">Active (Index ≤ 0)</SelectItem>
                            <SelectItem value="all">Show All</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={refreshScheduleQueue}
                        >
                          Refresh
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 overflow-hidden p-0">
                    {/* Empty State */}
                    {filteredScheduleOrderQueues.length === 0 ? (
                      <div className="h-full flex items-center justify-center p-8">
                        <div className="text-center text-muted-foreground">
                          <Package className="h-16 w-16 mx-auto mb-6 opacity-50" />
                          <p className="text-lg font-medium mb-2">No production runs in schedule</p>
                          <p className="text-sm">
                            {queueFilter === 'all' && "Add production orders to the schedule to see them here"}
                            {queueFilter === 'queue' && "No queued production runs (index > 0)"}
                            {queueFilter === 'active' && "No active production runs (index ≤ 0)"}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="h-full overflow-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/50 border-b sticky top-0 z-10">
                            <tr>
                              <th className="px-2 py-1.5 text-left text-[10px] font-medium text-muted-foreground uppercase">Index</th>
                              <th className="px-2 py-1.5 text-left text-[10px] font-medium text-muted-foreground uppercase">Production Run</th>
                              <th className="px-2 py-1.5 text-left text-[10px] font-medium text-muted-foreground uppercase">Customer(s)</th>
                              <th className="px-2 py-1.5 text-left text-[10px] font-medium text-muted-foreground uppercase">Recipe</th>
                              <th className="px-2 py-1.5 text-left text-[10px] font-medium text-muted-foreground uppercase">Mash Bill</th>
                              <th className="px-2 py-1.5 text-left text-[10px] font-medium text-muted-foreground uppercase">Est. PGs</th>
                              <th className="px-2 py-1.5 text-left text-[10px] font-medium text-muted-foreground uppercase">Mash Date</th>
                              <th className="px-2 py-1.5 text-left text-[10px] font-medium text-muted-foreground uppercase">Ferm Start</th>
                              <th className="px-2 py-1.5 text-left text-[10px] font-medium text-muted-foreground uppercase">Ferm End</th>
                              <th className="px-2 py-1.5 text-left text-[10px] font-medium text-muted-foreground uppercase">Distill Date</th>
                              <th className="px-2 py-1.5 text-left text-[10px] font-medium text-muted-foreground uppercase">Barrel Date</th>
                              <th className="px-2 py-1.5 text-left text-[10px] font-medium text-muted-foreground uppercase">Cooks</th>
                              <th className="px-2 py-1.5 text-left text-[10px] font-medium text-muted-foreground uppercase">Ferms</th>
                              <th className="px-2 py-1.5 text-right text-[10px] font-medium text-muted-foreground uppercase">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="bg-background divide-y divide-border">
                            {filteredScheduleOrderQueues.map((queueItem, index) => (
                              <tr
                                key={queueItem.id}
                                className={`transition-all hover:bg-muted/50 cursor-pointer ${
                                  selectedScheduleOrder?.id === queueItem.id ? 'bg-primary/10' : 'bg-background'
                                }`}
                                onClick={() => setSelectedScheduleOrder(queueItem)}
                              >
                                <td className="px-2 py-1.5 whitespace-nowrap">
                                  <div className="text-xs font-bold text-foreground bg-muted px-2 py-1 rounded text-center w-8">
                                    {queueItem.queueIndex ?? 0}
                                  </div>
                                </td>
                                <td className="px-2 py-1.5 whitespace-nowrap text-xs text-foreground">
                                  {queueItem.scheduleOrder.name || `SHO${queueItem.scheduleOrder.id.slice(-6)}`}
                                </td>
                                <td className="px-2 py-1.5 whitespace-nowrap text-xs text-muted-foreground">
                                  {queueItem.scheduleOrder.customers && queueItem.scheduleOrder.customers.length > 0
                                    ? queueItem.scheduleOrder.customers.map(c => c.name || c.customerCode).filter(Boolean).join(', ')
                                    : 'N/A'}
                                </td>
                                <td className="px-2 py-1.5 whitespace-nowrap text-xs text-muted-foreground">
                                  {queueItem.scheduleOrder.recipeName ||
                                   (queueItem.scheduleOrder.scheduleOrderRecipe?.Recipe ?
                                     formatRecipeName(queueItem.scheduleOrder.scheduleOrderRecipe.Recipe) : 'N/A')}
                                </td>
                                <td className="px-2 py-1.5 whitespace-nowrap text-xs text-muted-foreground">
                                  {queueItem.scheduleOrder.scheduleOrderRecipe?.customerCode ||
                                   queueItem.scheduleOrder.recipeGroup?.recipe || 'N/A'}
                                </td>
                                <td className="px-2 py-1.5 whitespace-nowrap text-xs text-muted-foreground text-center">
                                  {queueItem.scheduleOrder.totalProofGallons?.toLocaleString() || 'N/A'}
                                </td>
                                <td className="px-2 py-1.5 whitespace-nowrap text-xs text-muted-foreground">
                                  {queueItem.scheduleOrder.estimatedMashingStartTime ?
                                    formatDate(queueItem.scheduleOrder.estimatedMashingStartTime) :
                                    (queueItem.scheduleOrder.estimatedStart ? formatDate(queueItem.scheduleOrder.estimatedStart) : 'N/A')}
                                </td>
                                <td className="px-2 py-1.5 whitespace-nowrap text-xs text-muted-foreground">
                                  {queueItem.scheduleOrder.estimatedFermentationStartTime ?
                                    formatDate(queueItem.scheduleOrder.estimatedFermentationStartTime) : 'N/A'}
                                </td>
                                <td className="px-2 py-1.5 whitespace-nowrap text-xs text-muted-foreground">
                                  {queueItem.scheduleOrder.estimatedFermentationStartTime && queueItem.scheduleOrder.estimatedFermentationDuration ?
                                    formatDate(new Date(new Date(queueItem.scheduleOrder.estimatedFermentationStartTime).getTime() +
                                      (queueItem.scheduleOrder.estimatedFermentationDuration * 24 * 60 * 60 * 1000)).toISOString()) : 'N/A'}
                                </td>
                                <td className="px-2 py-1.5 whitespace-nowrap text-xs text-muted-foreground">
                                  {queueItem.scheduleOrder.estimatedDistillationStartTime ?
                                    formatDate(queueItem.scheduleOrder.estimatedDistillationStartTime) : 'N/A'}
                                </td>
                                <td className="px-2 py-1.5 whitespace-nowrap text-xs text-muted-foreground">
                                  {queueItem.scheduleOrder.estimatedBarrelingStartTime ?
                                    formatDate(queueItem.scheduleOrder.estimatedBarrelingStartTime) :
                                    (queueItem.scheduleOrder.estimatedEnd ? formatDate(queueItem.scheduleOrder.estimatedEnd) : 'N/A')}
                                </td>
                                <td className="px-2 py-1.5 whitespace-nowrap text-xs text-muted-foreground text-center">
                                  {queueItem.scheduleOrder.totalCooks || queueItem.scheduleOrder.totalBarrels || 'N/A'}
                                </td>
                                <td className="px-2 py-1.5 whitespace-nowrap text-xs text-muted-foreground text-center">
                                  {queueItem.scheduleOrder.totalFermenters ||
                                   (queueItem.scheduleOrder.totalBarrels ? Math.ceil(queueItem.scheduleOrder.totalBarrels / 3) : 'N/A')}
                                </td>
                                <td className="px-2 py-1.5 whitespace-nowrap">
                                  <div className="flex items-center justify-end space-x-1">
                                    {canManageQueue && queueItem.queueIndex === 1 && (
                                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 hover:bg-green-500/20"
                                        onClick={(e) => { e.stopPropagation(); handleStartOrder(queueItem) }} title="Start Order">
                                        <Play className="h-3 w-3 text-green-600 dark:text-green-400" />
                                      </Button>
                                    )}
                                    {canManageQueue && (queueItem.queueIndex || 0) < -1 && (
                                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 hover:bg-green-500/20"
                                        onClick={(e) => { e.stopPropagation(); handleCompleteOrder(queueItem) }} title="Mark Complete">
                                        <CheckCircle className="h-3 w-3 text-green-600 dark:text-green-400" />
                                      </Button>
                                    )}
                                    {canManageQueue && (
                                      <>
                                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 hover:bg-muted"
                                          onClick={(e) => { e.stopPropagation(); handleMoveUp(queueItem, index) }}
                                          disabled={index === 0 || movingItems.has(queueItem.id)}>
                                          <ChevronUp className={`h-3 w-3 text-foreground ${movingItems.has(queueItem.id) ? 'animate-pulse' : ''}`} />
                                        </Button>
                                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 hover:bg-muted"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            const maxQueueIndex = Math.max(...filteredScheduleOrderQueues.map(item => item.queueIndex || 0))
                                            handleMoveDown(queueItem, index, maxQueueIndex)
                                          }}
                                          disabled={(() => {
                                            const maxQueueIndex = Math.max(...filteredScheduleOrderQueues.map(item => item.queueIndex || 0))
                                            return (queueItem.queueIndex || 0) >= maxQueueIndex || movingItems.has(queueItem.id)
                                          })()}>
                                          <ChevronDown className={`h-3 w-3 text-foreground ${movingItems.has(queueItem.id) ? 'animate-pulse' : ''}`} />
                                        </Button>
                                      </>
                                    )}
                                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 hover:bg-muted"
                                      onClick={(e) => { e.stopPropagation(); handleEditScheduleOrder(queueItem) }}>
                                      <Edit className="h-3 w-3 text-foreground" />
                                    </Button>
                                    {canManageQueue && (queueItem.queueIndex ?? 0) > 0 && (
                                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 hover:bg-red-500/20"
                                        onClick={(e) => { e.stopPropagation(); handleDeleteScheduleOrder(queueItem) }} title="Delete Order">
                                        <Trash2 className="h-3 w-3 text-red-600 dark:text-red-400" />
                                      </Button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}

        {currentView === 'line' && (
          <Card>
            <CardHeader>
              <CardTitle>Production Schedule - Line View</CardTitle>
              <CardDescription>
                Real-time view of production areas and their current running orders
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScheduleView />
            </CardContent>
          </Card>
        )}

        {currentView === 'changeover' && (
          <ChangeoverPanel
            canManageChangeover={canManageQueue}
            effectiveUsername={effectiveUsername}
            onQueueChanged={async () => {
              await loadProductionData()
              await refreshScheduleQueue()
            }}
            scheduleOrderQueues={scheduleOrderQueues}
          />
        )}

        {/* Add to Schedule Dialog */}
        <AddToScheduleDialog
          isOpen={isScheduleDialogOpen}
          onClose={() => setIsScheduleDialogOpen(false)}
          productionOrder={selectedProductionOrder}
          createdBy={effectiveUsername}
          onSuccess={() => {
            // Refresh the production data to show updated schedule status
            loadProductionData()
            // Refresh the schedule queue to show the new item
            refreshScheduleQueue()
            // Refresh the unscheduled orders panel
            setUnscheduledOrdersRefresh(prev => prev + 1)
          }}
        />

        {/* Add Multiple Orders to Schedule Dialog */}
        <AddToScheduleDialogMulti
          isOpen={isScheduleDialogMultiOpen}
          onClose={() => {
            setIsScheduleDialogMultiOpen(false)
            setSelectedProductionOrders([])
          }}
          productionOrders={selectedProductionOrders}
          createdBy={effectiveUsername}
          onSuccess={() => {
            // Refresh the unscheduled orders panel
            setUnscheduledOrdersRefresh(prev => prev + 1)
            // Refresh the schedule queue to show the new item
            refreshScheduleQueue()
            // Clear selections
            setSelectedProductionOrders([])
          }}
        />

        {/* Start Order Confirmation Dialog */}
        <StartOrderConfirmDialog
          isOpen={isStartDialogOpen}
          onClose={() => {
            setIsStartDialogOpen(false)
            setSelectedStartOrder(null)
          }}
          onConfirm={handleConfirmStartOrder}
          queueItem={selectedStartOrder}
          activeOrderAtIndex0={scheduleOrderQueues.find(item => item.queueIndex === 0) || null}
          isLoading={startLoading}
        />

        {/* Complete Order Confirmation Dialog */}
        <CompleteOrderConfirmDialog
          isOpen={isCompleteDialogOpen}
          onClose={() => {
            setIsCompleteDialogOpen(false)
            setSelectedCompleteOrder(null)
          }}
          onConfirm={handleConfirmCompleteOrder}
          queueItem={selectedCompleteOrder}
          isLoading={completeLoading}
        />

        {/* Unified Schedule Order Edit Modal */}
        <UnifiedScheduleOrderEditModal
          isOpen={isEditDialogOpen}
          onClose={() => {
            setIsEditDialogOpen(false)
            setSelectedScheduleOrder(null)
          }}
          orderQueue={selectedScheduleOrder}
          onSave={async () => {
            await loadProductionData()
            setUnscheduledOrdersRefresh(prev => prev + 1)
          }}
        />

        {/* Create Production Order Wizard */}
        <ProductionOrderWizard
          isOpen={isCreateOrderWizardOpen}
          onClose={() => setIsCreateOrderWizardOpen(false)}
          onSubmit={handleCreateProductionOrder}
        />
      </div>
    </SchedulingRouteGuard>
  )
} 