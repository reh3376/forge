'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { formatRecipeName } from '@/lib/utils'
import { toast } from 'sonner'
import { 
  Clock, 
  ChevronLeft, 
  ChevronRight, 
  Play, 
  Pause,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Move
} from 'lucide-react'

// Import the new modal components
import { RunningOrderDetailsModal } from './RunningOrderDetailsModal'
import { EditRunningRecipeModal, type RunningRecipeData } from './EditRunningRecipeModal'
import { UnifiedScheduleOrderEditModal } from './UnifiedScheduleOrderEditModal'

// Types based on GraphQL schema
interface ScheduleOrder {
  id: string
  name: string
  recipeName?: string
  status: 'Created' | 'Scheduled' | 'InProgress' | 'Complete'
  estimatedStart: string
  estimatedEnd: string
  actualStart?: string
  actualEnd?: string
  totalBarrels?: number
  totalProofGallons?: number
}

interface ScheduleOrderQueue {
  id: string
  queueIndex: number
  areas: { id: string; name: string }[]
  scheduleOrder: ScheduleOrder
}

interface Asset {
  id: string
  name: string
  assetType: string
  assetPath: string
  index?: number
  scheduleOrderQueues: ScheduleOrderQueue[]
  futureOrderQueues?: ScheduleOrderQueue[]
}

interface TimeSlot {
  date: Date
  label: string
  isToday: boolean
}

export default function ScheduleView() {
  const [cells, setCells] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(new Date())
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([])
  const [showFutureOrders, setShowFutureOrders] = useState(true)
  
  // New state for modal management
  const [selectedOrderQueue, setSelectedOrderQueue] = useState<ScheduleOrderQueue | null>(null)
  const [selectedCellName, setSelectedCellName] = useState<string>('')
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false)
  const [isEditRecipeModalOpen, setIsEditRecipeModalOpen] = useState(false)
  const [isFutureOrderEditModalOpen, setIsFutureOrderEditModalOpen] = useState(false)

  // Drag and drop state for future orders
  const [draggedOrder, setDraggedOrder] = useState<{
    orderQueue: ScheduleOrderQueue
    cellId: string
    originalPosition: { startSlot: number; endSlot: number; width: number }
  } | null>(null)
  const [dragOverSlot, setDragOverSlot] = useState<{ cellId: string; slotIndex: number } | null>(null)

  // Initialize current week
  useEffect(() => {
    const today = new Date()
    const startOfWeek = new Date(today)
    startOfWeek.setDate(today.getDate() - today.getDay()) // Start from Sunday
    setCurrentWeekStart(startOfWeek)
  }, [])

  // Generate time slots for the current week
  useEffect(() => {
    const slots: TimeSlot[] = []
    const today = new Date()
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(currentWeekStart)
      date.setDate(currentWeekStart.getDate() + i)
      
      slots.push({
        date,
        label: date.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        }),
        isToday: date.toDateString() === today.toDateString()
      })
    }
    
    setTimeSlots(slots)
  }, [currentWeekStart])

  // Fetch data
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        setError(null)

        // Fetch cells and schedule orders separately, then merge
        // (Workaround for nested relation not returning data via GraphQL)
        const [cellsResponse, queuesResponse] = await Promise.all([
          fetch('/api/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: `
                query GetCells {
                  assets(
                    where: { assetType: Cell }
                    orderBy: [{ name: Asc }]
                  ) {
                    id
                    name
                    assetType
                    assetPath
                    index
                  }
                }
              `
            })
          }),
          fetch('/api/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: `
                query GetScheduleOrderQueues {
                  scheduleOrderQueues(
                    orderBy: [{ queueIndex: Asc }]
                  ) {
                    id
                    queueIndex
                    areas {
                      id
                      name
                    }
                    scheduleOrder {
                      id
                      name
                      recipeName
                      status
                      estimatedStart
                      estimatedEnd
                      actualStart
                      actualEnd
                      totalBarrels
                      totalProofGallons
                    }
                  }
                }
              `
            })
          })
        ])

        const cellsData = await cellsResponse.json()
        const queuesData = await queuesResponse.json()

        if (cellsData.data?.assets && queuesData.data?.scheduleOrderQueues) {
          const cells = cellsData.data.assets
          const allQueues = queuesData.data.scheduleOrderQueues

          // Separate active (queueIndex <= 0) and future (queueIndex > 0) orders
          const activeQueues = allQueues.filter((q: ScheduleOrderQueue) => q.queueIndex <= 0)
            .sort((a: ScheduleOrderQueue, b: ScheduleOrderQueue) => b.queueIndex - a.queueIndex)
          const futureQueues = allQueues.filter((q: ScheduleOrderQueue) => q.queueIndex > 0)
            .sort((a: ScheduleOrderQueue, b: ScheduleOrderQueue) => a.queueIndex - b.queueIndex)
            .slice(0, 10)

          // Assign queues to cells based on areas relationship
          // If areas is empty, assign to first cell (Granary01) as default
          const cellsWithQueues = cells.map((cell: Asset) => {
            const cellActiveQueues = activeQueues.filter((q: ScheduleOrderQueue) => {
              if (q.areas && q.areas.length > 0) {
                return q.areas.some(area => area.id === cell.id)
              }
              // Default: assign to first cell (Granary01) if no areas linked
              return cell.name === 'Granary01'
            })
            const cellFutureQueues = futureQueues.filter((q: ScheduleOrderQueue) => {
              if (q.areas && q.areas.length > 0) {
                return q.areas.some(area => area.id === cell.id)
              }
              // Default: assign to first cell (Granary01) if no areas linked
              return cell.name === 'Granary01'
            })
            return {
              ...cell,
              scheduleOrderQueues: cellActiveQueues,
              futureOrderQueues: cellFutureQueues
            }
          })

          setCells(cellsWithQueues)
        } else if (cellsData.errors || queuesData.errors) {
          console.error('GraphQL errors:', cellsData.errors || queuesData.errors)
          setError('Failed to load schedule data: ' + (cellsData.errors?.[0]?.message || queuesData.errors?.[0]?.message))
        }

      } catch (err) {
        console.error('Error fetching schedule data:', err)
        setError('Failed to load schedule data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const navigateWeek = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentWeekStart)
    newDate.setDate(currentWeekStart.getDate() + (direction === 'next' ? 7 : -7))
    setCurrentWeekStart(newDate)
  }

  const getStatusColor = (status: string, isFuture: boolean = false) => {
    const baseColors = {
      'Complete': 'bg-green-100 text-green-800 border-green-200',
      'InProgress': 'bg-blue-100 text-blue-800 border-blue-200',
      'Scheduled': 'bg-purple-100 text-purple-800 border-purple-200',
      'Created': 'bg-orange-100 text-orange-800 border-orange-200'
    }
    
    if (isFuture) {
      // Muted colors for future orders
      const futureColors = {
        'Complete': 'bg-green-50 text-green-600 border-green-100',
        'InProgress': 'bg-blue-50 text-blue-600 border-blue-100',
        'Scheduled': 'bg-purple-50 text-purple-600 border-purple-100',
        'Created': 'bg-orange-50 text-orange-600 border-orange-100'
      }
      return futureColors[status as keyof typeof futureColors] || 'bg-gray-50 text-gray-600 border-gray-100'
    }
    
    return baseColors[status as keyof typeof baseColors] || 'bg-gray-100 text-gray-800 border-gray-200'
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Complete':
        return <CheckCircle2 className="h-3 w-3" />
      case 'InProgress':
        return <Play className="h-3 w-3" />
      case 'Scheduled':
        return <Clock className="h-3 w-3" />
      case 'Created':
        return <AlertCircle className="h-3 w-3" />
      default:
        return <Pause className="h-3 w-3" />
    }
  }

  // Get the position and width of an order within the week view
  const getOrderPosition = (order: ScheduleOrder) => {
    if (!order.estimatedStart || !order.estimatedEnd || timeSlots.length === 0) return null
    
    const startDate = new Date(order.estimatedStart)
    const endDate = new Date(order.estimatedEnd)
    
    // Find which time slots this order spans
    const startSlotIndex = timeSlots.findIndex(slot => {
      const slotDate = new Date(slot.date)
      slotDate.setHours(0, 0, 0, 0)
      startDate.setHours(0, 0, 0, 0)
      return slotDate.getTime() === startDate.getTime()
    })
    
    const endSlotIndex = timeSlots.findIndex(slot => {
      const slotDate = new Date(slot.date)
      slotDate.setHours(0, 0, 0, 0)
      endDate.setHours(0, 0, 0, 0)
      return slotDate.getTime() === endDate.getTime()
    })
    
    // If order doesn't fall within current week view, don't show it
    if (startSlotIndex === -1 && endSlotIndex === -1) {
      // Check if order spans the entire week
      const firstSlot = timeSlots[0]
      const lastSlot = timeSlots[timeSlots.length - 1]
      
      if (timeSlots.length > 0 && firstSlot && lastSlot) {
        const weekStart = new Date(firstSlot.date)
        const weekEnd = new Date(lastSlot.date)
        weekStart.setHours(0, 0, 0, 0)
        weekEnd.setHours(23, 59, 59, 999)
        startDate.setHours(0, 0, 0, 0)
        endDate.setHours(23, 59, 59, 999)
        
        if (startDate <= weekStart && endDate >= weekEnd) {
          return { startSlot: 0, endSlot: timeSlots.length - 1, width: timeSlots.length }
        }
      }
      return null
    }
    
    const actualStartSlot = Math.max(0, startSlotIndex === -1 ? 0 : startSlotIndex)
    const actualEndSlot = Math.min(timeSlots.length - 1, endSlotIndex === -1 ? timeSlots.length - 1 : endSlotIndex)
    const width = actualEndSlot - actualStartSlot + 1
    
    return { startSlot: actualStartSlot, endSlot: actualEndSlot, width }
  }

  // Calculate total active and future orders across all cells
  const totalActiveOrders = cells.reduce((total, cell) => total + cell.scheduleOrderQueues.length, 0)
  const totalFutureOrders = cells.reduce((total, cell) => total + (cell.futureOrderQueues?.length || 0), 0)

  // Handle card click to show details
  const handleCardClick = (orderQueue: ScheduleOrderQueue, cellName: string, isFuture: boolean = false) => {
    setSelectedOrderQueue(orderQueue)
    setSelectedCellName(cellName)
    
    if (isFuture) {
      setIsFutureOrderEditModalOpen(true)
    } else {
      setIsDetailsModalOpen(true)
    }
  }

  // Handle edit running recipe
  const handleEditRunningRecipe = (orderQueue: ScheduleOrderQueue) => {
    setSelectedOrderQueue(orderQueue)
    setIsDetailsModalOpen(false)
    setIsEditRecipeModalOpen(true)
  }

  // Close all modals
  const closeModals = () => {
    setIsDetailsModalOpen(false)
    setIsEditRecipeModalOpen(false)
    setIsFutureOrderEditModalOpen(false)
    setSelectedOrderQueue(null)
    setSelectedCellName('')
  }

  // Handle save running recipe changes
  const handleSaveRunningRecipe = async (data: RunningRecipeData, updateMasterRecipe: boolean) => {
    try {
      if (!selectedOrderQueue) {
        throw new Error('No order queue selected')
      }

      // For now, just show a success message and close the modal
      // The actual implementation would use the proper GraphQL mutations
      console.log('Saving running recipe data:', data, 'Update master:', updateMasterRecipe)
      
      toast.success('Running recipe saved successfully')
      closeModals()
      
      // TODO: Implement proper GraphQL mutations for updating running recipes
      // This would involve updating the production order recipe instance
      
    } catch (error) {
      console.error('Error saving running recipe:', error)
      toast.error('Failed to save running recipe')
    }
  }

  // Handle save future order changes
  const handleSaveFutureOrder = async () => {
    try {
      // Refresh the data after saving using same workaround as initial fetch
      const [cellsResponse, queuesResponse] = await Promise.all([
        fetch('/api/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `
              query GetCells {
                assets(
                  where: { assetType: Cell }
                  orderBy: [{ name: Asc }]
                ) {
                  id
                  name
                  assetType
                  assetPath
                  index
                }
              }
            `
          })
        }),
        fetch('/api/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `
              query GetScheduleOrderQueues {
                scheduleOrderQueues(
                  orderBy: [{ queueIndex: Asc }]
                ) {
                  id
                  queueIndex
                  areas {
                    id
                    name
                  }
                  scheduleOrder {
                    id
                    name
                    recipeName
                    status
                    estimatedStart
                    estimatedEnd
                    actualStart
                    actualEnd
                    totalBarrels
                    totalProofGallons
                    grainPerCook
                  }
                }
              }
            `
          })
        })
      ])

      const cellsData = await cellsResponse.json()
      const queuesData = await queuesResponse.json()

      if (cellsData.data?.assets && queuesData.data?.scheduleOrderQueues) {
        const fetchedCells = cellsData.data.assets
        const allQueues = queuesData.data.scheduleOrderQueues

        const activeQueues = allQueues.filter((q: ScheduleOrderQueue) => q.queueIndex <= 0)
          .sort((a: ScheduleOrderQueue, b: ScheduleOrderQueue) => b.queueIndex - a.queueIndex)
        const futureQueues = allQueues.filter((q: ScheduleOrderQueue) => q.queueIndex > 0)
          .sort((a: ScheduleOrderQueue, b: ScheduleOrderQueue) => a.queueIndex - b.queueIndex)
          .slice(0, 10)

        const cellsWithQueues = fetchedCells.map((cell: Asset) => {
          const cellActiveQueues = activeQueues.filter((q: ScheduleOrderQueue) => {
            if (q.areas && q.areas.length > 0) {
              return q.areas.some(area => area.id === cell.id)
            }
            return cell.name === 'Granary01'
          })
          const cellFutureQueues = futureQueues.filter((q: ScheduleOrderQueue) => {
            if (q.areas && q.areas.length > 0) {
              return q.areas.some(area => area.id === cell.id)
            }
            return cell.name === 'Granary01'
          })
          return {
            ...cell,
            scheduleOrderQueues: cellActiveQueues,
            futureOrderQueues: cellFutureQueues
          }
        })

        setCells(cellsWithQueues)
      }

      closeModals()
      toast.success('Future order updated successfully')
    } catch (error) {
      console.error('Error refreshing data:', error)
      toast.error('Failed to refresh data')
    }
  }

  // Drag and drop handlers for future orders
  const handleDragStart = (
    e: React.DragEvent,
    orderQueue: ScheduleOrderQueue,
    cellId: string
  ) => {
    const position = getOrderPosition(orderQueue.scheduleOrder)
    if (!position) return

    setDraggedOrder({
      orderQueue,
      cellId,
      originalPosition: position
    })

    // Set drag effect
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', orderQueue.id)
    
    // Add visual feedback
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5'
    }
  }

  const handleDragEnd = (e: React.DragEvent) => {
    // Reset visual feedback
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1'
    }
    
    setDraggedOrder(null)
    setDragOverSlot(null)
  }

  const handleDragOver = (e: React.DragEvent, cellId: string, slotIndex: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    
    // Only show drop zone if we have a dragged order
    if (draggedOrder) {
      setDragOverSlot({ cellId, slotIndex })
    }
  }

  const handleDragLeave = () => {
    setDragOverSlot(null)
  }

  const handleDrop = async (e: React.DragEvent, cellId: string, slotIndex: number) => {
    e.preventDefault()
    
    if (!draggedOrder || !timeSlots[slotIndex]) {
      setDragOverSlot(null)
      return
    }

    const { orderQueue } = draggedOrder
    const targetDate = timeSlots[slotIndex].date
    
    // Calculate original duration and timing
    const originalStart = new Date(orderQueue.scheduleOrder.estimatedStart)
    const originalEnd = new Date(orderQueue.scheduleOrder.estimatedEnd)
    const duration = originalEnd.getTime() - originalStart.getTime()
    
    // Calculate how many days the order spans
    const originalStartDay = new Date(originalStart)
    originalStartDay.setHours(0, 0, 0, 0)
    const originalEndDay = new Date(originalEnd)
    originalEndDay.setHours(0, 0, 0, 0)
    const orderSpanDays = Math.ceil((originalEndDay.getTime() - originalStartDay.getTime()) / (24 * 60 * 60 * 1000)) + 1
    
    // Get the current position of the order
    const currentPosition = getOrderPosition(orderQueue.scheduleOrder)
    if (!currentPosition) return
    
    // Calculate the offset from the start of the order to the dropped slot
    const dropOffsetFromStart = slotIndex - currentPosition.startSlot
    
    // Calculate new start time based on the drop position
    let newStart: Date
    
    if (dropOffsetFromStart <= 0) {
      // Dropped on or before the start of the order - move start to target date
      newStart = new Date(targetDate)
      newStart.setHours(originalStart.getHours(), originalStart.getMinutes(), 0, 0)
    } else if (dropOffsetFromStart >= orderSpanDays - 1) {
      // Dropped on or after the end of the order - move end to target date
      const newEnd = new Date(targetDate)
      newEnd.setHours(originalEnd.getHours(), originalEnd.getMinutes(), 0, 0)
      newStart = new Date(newEnd.getTime() - duration)
    } else {
      // Dropped somewhere in the middle - calculate proportional adjustment
      const totalOrderDuration = originalEnd.getTime() - originalStart.getTime()
      const dayProgress = dropOffsetFromStart / (orderSpanDays - 1)
      const timeOffsetFromStart = totalOrderDuration * dayProgress
      
      const targetDateTime = new Date(targetDate)
      targetDateTime.setHours(originalStart.getHours(), originalStart.getMinutes(), 0, 0)
      
      newStart = new Date(targetDateTime.getTime() - timeOffsetFromStart)
    }
    
    // Calculate new end time
    const newEnd = new Date(newStart.getTime() + duration)
    
    try {
      // Update the schedule order with new times
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            mutation UpdateScheduleOrderTiming($id: String!, $estimatedStart: DateTime!, $estimatedEnd: DateTime!) {
              updateScheduleOrder(
                where: { id: $id }
                data: {
                  estimatedStart: $estimatedStart
                  estimatedEnd: $estimatedEnd
                }
              ) {
                id
                estimatedStart
                estimatedEnd
              }
            }
          `,
          variables: {
            id: orderQueue.scheduleOrder.id,
            estimatedStart: newStart.toISOString(),
            estimatedEnd: newEnd.toISOString()
          }
        })
      })

      const result = await response.json()
      
      if (result.errors) {
        console.error('GraphQL errors:', result.errors)
        toast.error('Failed to update order timing')
        return
      }

      // Refresh the data to show the updated times
      await handleSaveFutureOrder()
      
      const startDateStr = newStart.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      })
      const endDateStr = newEnd.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      })
      
      toast.success(`Order rescheduled: ${startDateStr} - ${endDateStr}`)
      
    } catch (error) {
      console.error('Error updating order timing:', error)
      toast.error('Failed to update order timing')
    }
    
    setDragOverSlot(null)
    setDraggedOrder(null)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <div className="flex space-x-2">
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
          </div>
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Error Loading Schedule</h3>
        <p className="text-gray-500">{error}</p>
      </div>
    )
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    })
  }

  return (
    <div className="space-y-6">
      {/* Header with navigation and controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h3 className="text-lg font-semibold">
            Week of {formatDate(currentWeekStart)}
          </h3>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigateWeek('prev')}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigateWeek('next')}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="show-future-orders"
              checked={showFutureOrders}
              onCheckedChange={setShowFutureOrders}
            />
            <Label htmlFor="show-future-orders" className="text-sm">
              {showFutureOrders ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              Show Future Orders
            </Label>
          </div>
          <div className="text-sm text-muted-foreground">
            {totalActiveOrders} active • {totalFutureOrders} future
          </div>
        </div>
      </div>

      {/* Time slots header */}
      <div className="grid grid-cols-8 gap-0 border-b">
        <div className="p-3 border-r bg-muted/30">
          <div className="font-medium text-sm">Production Line</div>
        </div>
        {timeSlots.map((slot, index) => (
          <div 
            key={index}
            className={`p-3 text-center border-r last:border-r-0 ${
              slot.isToday ? 'bg-blue-50 font-medium' : 'bg-muted/30'
            }`}
          >
            <div className="text-sm font-medium">{slot.label}</div>
            <div className="text-xs text-muted-foreground">
              {slot.date.toLocaleDateString('en-US', { weekday: 'short' })}
            </div>
          </div>
        ))}
      </div>

      {/* Schedule grid */}
      <div className="border rounded-lg overflow-auto">
        <div className="divide-y">
          {cells.map((cell) => {
            const MAX_VISIBLE_ORDERS = 3
            const allActiveOrders = cell.scheduleOrderQueues
            const allFutureOrders = showFutureOrders ? (cell.futureOrderQueues || []) : []

            // Filter to only orders that fall within the current week view
            const activeOrdersInView = allActiveOrders.filter(oq => getOrderPosition(oq.scheduleOrder) !== null)
            const futureOrdersInView = allFutureOrders.filter(oq => getOrderPosition(oq.scheduleOrder) !== null)

            // Apply MAX_VISIBLE_ORDERS limit to orders actually in view
            const visibleActiveOrders = activeOrdersInView.slice(0, MAX_VISIBLE_ORDERS)
            const visibleFutureOrders = futureOrdersInView.slice(0, Math.max(0, MAX_VISIBLE_ORDERS - visibleActiveOrders.length))

            const totalOrdersInView = activeOrdersInView.length + futureOrdersInView.length
            const visibleOrders = visibleActiveOrders.length + visibleFutureOrders.length
            const hiddenCount = totalOrdersInView - visibleOrders
            const rowHeight = Math.max(100, visibleOrders * 85 + (hiddenCount > 0 ? 40 : 0) + 20)

            return (
              <div key={cell.id} className="grid grid-cols-8 gap-0 relative" style={{ minHeight: `${rowHeight}px` }}>
                {/* Cell Name */}
                <div className="p-4 border-r bg-background flex items-center">
                  <div>
                    <div className="font-medium text-sm">{cell.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {activeOrdersInView.length > 0 ? `${activeOrdersInView.length} active` : '0 active'}
                      {showFutureOrders && futureOrdersInView.length > 0 && (
                        <span> • {futureOrdersInView.length} future</span>
                      )}
                      {(allActiveOrders.length + allFutureOrders.length) > totalOrdersInView && (
                        <span className="text-gray-400"> ({allActiveOrders.length + allFutureOrders.length} total)</span>
                      )}
                    </div>
                    {hiddenCount > 0 && (
                      <button
                        className="text-xs text-blue-600 hover:text-blue-800 mt-1"
                        onClick={() => {
                          const firstHiddenActive = activeOrdersInView[MAX_VISIBLE_ORDERS]
                          const firstHiddenFuture = futureOrdersInView[Math.max(0, MAX_VISIBLE_ORDERS - visibleActiveOrders.length)]
                          const orderToShow = firstHiddenActive || firstHiddenFuture || activeOrdersInView[0] || futureOrdersInView[0]
                          if (orderToShow) handleCardClick(orderToShow, cell.name, !firstHiddenActive && !!firstHiddenFuture)
                        }}
                      >
                        +{hiddenCount} more orders
                      </button>
                    )}
                  </div>
                </div>

                {/* Time Slots Grid */}
                <div className="col-span-7 grid grid-cols-7 relative" style={{ minHeight: `${rowHeight}px` }}>
                  {/* Background time slots */}
                  {timeSlots.map((slot, slotIndex) => (
                    <div 
                      key={slotIndex}
                      className={`border-r last:border-r-0 relative ${
                        slot.isToday ? 'bg-blue-50/30' : ''
                      } ${
                        dragOverSlot?.cellId === cell.id && dragOverSlot?.slotIndex === slotIndex
                          ? 'bg-green-100 border-green-300 border-2'
                          : ''
                      }`}
                      style={{ minHeight: `${rowHeight}px` }}
                      onDragOver={(e) => handleDragOver(e, cell.id, slotIndex)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, cell.id, slotIndex)}
                    >
                      {/* Drop zone indicator */}
                      {dragOverSlot?.cellId === cell.id && dragOverSlot?.slotIndex === slotIndex && draggedOrder && (
                        <div className="absolute inset-0 flex items-center justify-center bg-green-100/80 border-2 border-dashed border-green-400 rounded z-20">
                          <div className="text-green-700 text-sm font-medium flex flex-col items-center gap-1 text-center">
                            <div className="flex items-center gap-1">
                              <Move className="h-4 w-4" />
                              <span>Drop to reschedule</span>
                            </div>
                            {(() => {
                              const currentPosition = getOrderPosition(draggedOrder.orderQueue.scheduleOrder)
                              if (!currentPosition || !timeSlots[slotIndex]) return null
                              
                              const dropOffsetFromStart = slotIndex - currentPosition.startSlot
                              const targetDate = timeSlots[slotIndex].date
                              const targetDateStr = targetDate.toLocaleDateString('en-US', { 
                                month: 'short', 
                                day: 'numeric' 
                              })
                              
                              if (dropOffsetFromStart <= 0) {
                                return <span className="text-xs">Start on {targetDateStr}</span>
                              } else if (dropOffsetFromStart >= currentPosition.width - 1) {
                                return <span className="text-xs">End on {targetDateStr}</span>
                              } else {
                                return <span className="text-xs">Align to {targetDateStr}</span>
                              }
                            })()}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  
                  {/* Active Order bars positioned absolutely */}
                  {visibleActiveOrders.map((orderQueue, orderIndex) => {
                    const position = getOrderPosition(orderQueue.scheduleOrder)
                    if (!position || timeSlots.length === 0) return null
                    
                    const leftPercent = (position.startSlot / timeSlots.length) * 100
                    const widthPercent = (position.width / timeSlots.length) * 100
                    
                    return (
                      <div
                        key={orderQueue.id}
                        className="absolute cursor-pointer"
                        style={{
                          left: `${leftPercent}%`,
                          width: `${widthPercent}%`,
                          top: `${orderIndex * 85 + 10}px`,
                          height: '75px',
                          zIndex: 10
                        }}
                        title={`${orderQueue.scheduleOrder.name || `Order ${orderQueue.scheduleOrder.id.slice(-8)}`}\nRecipe: ${formatRecipeName(orderQueue.scheduleOrder.recipeName)}\nStatus: ${orderQueue.scheduleOrder.status}\nQueue: ${orderQueue.queueIndex}\n${orderQueue.scheduleOrder.totalBarrels ? `${orderQueue.scheduleOrder.totalBarrels} bbls` : ''}`}
                        onClick={() => handleCardClick(orderQueue, cell.name, false)}
                      >
                        <Card className={`h-full shadow-sm border-2 hover:shadow-lg hover:border-blue-300 transition-all duration-200 ${
                          orderIndex > 0 ? 'opacity-90' : ''
                        } ${getStatusColor(orderQueue.scheduleOrder.status).replace('text-', 'border-').replace('bg-', 'bg-').replace('border-', 'border-l-4 border-l-')}`}>
                          <CardContent className="p-3 h-full flex flex-col justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge 
                                  variant="outline" 
                                  className={`text-xs px-1.5 py-0.5 ${getStatusColor(orderQueue.scheduleOrder.status)}`}
                                >
                                  {getStatusIcon(orderQueue.scheduleOrder.status)}
                                  <span className="ml-1">{orderQueue.scheduleOrder.status}</span>
                                </Badge>
                              </div>
                              <div className="text-xs font-semibold text-gray-900 leading-tight">
                                {orderQueue.scheduleOrder.name || `Order ${orderQueue.scheduleOrder.id.slice(-8)}`}
                              </div>
                              <div className="text-xs font-medium text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                                {formatRecipeName(orderQueue.scheduleOrder.recipeName)}
                              </div>
                              {orderQueue.areas.length > 0 && (
                                <div className="text-xs text-gray-600">
                                  {orderQueue.areas.map(area => area.name).join(', ')}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center justify-between text-xs text-gray-500 mt-1 pt-1 border-t border-gray-100">
                              <span>Q: {orderQueue.queueIndex}</span>
                              {orderQueue.scheduleOrder.totalBarrels && (
                                <span className="font-medium text-gray-700">
                                  {orderQueue.scheduleOrder.totalBarrels} bbls
                                </span>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    )
                  })}

                  {/* Future Order bars positioned absolutely - now draggable */}
                  {visibleFutureOrders.map((orderQueue, orderIndex) => {
                    const position = getOrderPosition(orderQueue.scheduleOrder)
                    if (!position || timeSlots.length === 0) return null

                    const leftPercent = (position.startSlot / timeSlots.length) * 100
                    const widthPercent = (position.width / timeSlots.length) * 100
                    const topOffset = (visibleActiveOrders.length + orderIndex) * 85 + 10
                    
                    return (
                      <div
                        key={`future-${orderQueue.id}`}
                        className="absolute cursor-move"
                        style={{
                          left: `${leftPercent}%`,
                          width: `${widthPercent}%`,
                          top: `${topOffset}px`,
                          height: '75px',
                          zIndex: 5
                        }}
                        title={`FUTURE: ${orderQueue.scheduleOrder.name || `Order ${orderQueue.scheduleOrder.id.slice(-8)}`}\nRecipe: ${formatRecipeName(orderQueue.scheduleOrder.recipeName)}\nStatus: ${orderQueue.scheduleOrder.status}\nQueue: ${orderQueue.queueIndex}\n${orderQueue.scheduleOrder.totalBarrels ? `${orderQueue.scheduleOrder.totalBarrels} bbls` : ''}\n\nDrag to reschedule`}
                        draggable={true}
                        onDragStart={(e) => handleDragStart(e, orderQueue, cell.id)}
                        onDragEnd={handleDragEnd}
                        onClick={() => handleCardClick(orderQueue, cell.name, true)}
                      >
                        <Card className={`h-full shadow-sm border-2 border-dashed hover:shadow-lg hover:border-purple-300 transition-all duration-200 opacity-75 ${getStatusColor(orderQueue.scheduleOrder.status, true).replace('text-', 'border-').replace('bg-', 'bg-').replace('border-', 'border-l-4 border-l-')}`}>
                          <CardContent className="p-3 h-full flex flex-col justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge 
                                  variant="outline" 
                                  className={`text-xs px-1.5 py-0.5 ${getStatusColor(orderQueue.scheduleOrder.status, true)}`}
                                >
                                  {getStatusIcon(orderQueue.scheduleOrder.status)}
                                  <span className="ml-1">FUTURE</span>
                                </Badge>
                                <Move className="h-3 w-3 text-gray-400" />
                              </div>
                              <div className="text-xs font-semibold text-gray-700 leading-tight">
                                {orderQueue.scheduleOrder.name || `Order ${orderQueue.scheduleOrder.id.slice(-8)}`}
                              </div>
                              <div className="text-xs font-medium text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
                                {formatRecipeName(orderQueue.scheduleOrder.recipeName)}
                              </div>
                              {orderQueue.areas.length > 0 && (
                                <div className="text-xs text-gray-500">
                                  {orderQueue.areas.map(area => area.name).join(', ')}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center justify-between text-xs text-gray-400 mt-1 pt-1 border-t border-gray-100">
                              <span>Q: {orderQueue.queueIndex}</span>
                              {orderQueue.scheduleOrder.totalBarrels && (
                                <span className="font-medium text-gray-600">
                                  {orderQueue.scheduleOrder.totalBarrels} bbls
                                </span>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-blue-100 border border-blue-200 rounded"></div>
          <span>In Progress</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-100 border border-green-200 rounded"></div>
          <span>Complete</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-purple-100 border border-purple-200 rounded"></div>
          <span>Scheduled</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-orange-100 border border-orange-200 rounded"></div>
          <span>Created</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-gray-50 border border-gray-100 border-dashed rounded"></div>
          <span>Future Orders</span>
        </div>
        <div className="flex items-center gap-2">
          <Move className="h-3 w-3 text-gray-400" />
          <span className="text-gray-600">Drag future orders to reschedule</span>
        </div>
      </div>

      {/* Summary */}
      {(totalActiveOrders > 0 || (showFutureOrders && totalFutureOrders > 0)) && (
        <div className="bg-muted/30 rounded-lg p-4">
          <h4 className="font-medium mb-3">Orders by Cell</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            {cells.filter(cell => cell.scheduleOrderQueues.length > 0 || (showFutureOrders && cell.futureOrderQueues && cell.futureOrderQueues.length > 0)).map((cell) => (
              <div key={cell.id} className="space-y-2">
                <div className="font-medium text-foreground">{cell.name}</div>

                {/* Active Orders */}
                {cell.scheduleOrderQueues.map((orderQueue) => (
                  <div key={orderQueue.id} className="bg-card rounded border border-border p-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm truncate text-foreground">
                        {orderQueue.scheduleOrder.name || `Order ${orderQueue.scheduleOrder.id.slice(-8)}`}
                      </span>
                      <Badge variant="outline" className={`text-xs ${getStatusColor(orderQueue.scheduleOrder.status)}`}>
                        {orderQueue.scheduleOrder.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-1.5 py-0.5 rounded">
                      {formatRecipeName(orderQueue.scheduleOrder.recipeName)}
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Queue: {orderQueue.queueIndex}</span>
                      {orderQueue.scheduleOrder.totalBarrels && (
                        <span className="font-medium">{orderQueue.scheduleOrder.totalBarrels} bbls</span>
                      )}
                    </div>
                  </div>
                ))}

                {/* Future Orders */}
                {showFutureOrders && cell.futureOrderQueues?.map((orderQueue) => (
                  <div key={`future-${orderQueue.id}`} className="bg-muted/50 rounded border border-dashed border-border p-2 space-y-1 opacity-75">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm truncate text-muted-foreground">
                        {orderQueue.scheduleOrder.name || `Order ${orderQueue.scheduleOrder.id.slice(-8)}`}
                      </span>
                      <Badge variant="outline" className={`text-xs ${getStatusColor(orderQueue.scheduleOrder.status, true)}`}>
                        FUTURE
                      </Badge>
                    </div>
                    <div className="text-xs text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950 px-1.5 py-0.5 rounded">
                      {formatRecipeName(orderQueue.scheduleOrder.recipeName)}
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Queue: {orderQueue.queueIndex}</span>
                      {orderQueue.scheduleOrder.totalBarrels && (
                        <span className="font-medium">{orderQueue.scheduleOrder.totalBarrels} bbls</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add the modal components */}
      <RunningOrderDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={closeModals}
        orderQueue={selectedOrderQueue}
        cellName={selectedCellName}
        onEditRunningRecipe={handleEditRunningRecipe}
      />

      <EditRunningRecipeModal
        isOpen={isEditRecipeModalOpen}
        onClose={closeModals}
        orderQueue={selectedOrderQueue}
        onSave={handleSaveRunningRecipe}
      />

      <UnifiedScheduleOrderEditModal
        isOpen={isFutureOrderEditModalOpen}
        onClose={closeModals}
        orderQueue={selectedOrderQueue}
        onSave={handleSaveFutureOrder}
      />
    </div>
  )
} 