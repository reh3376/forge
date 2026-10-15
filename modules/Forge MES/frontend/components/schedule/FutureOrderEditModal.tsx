'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { useCurrentUserEmail } from '@/lib/utils/user-context'
import {
  Clock,
  Edit,
  CheckCircle2,
  Play,
  AlertCircle,
  Pause,
  Trash2,
  FlaskConical
} from 'lucide-react'
import { UnifiedGraphQLClient } from '@/lib/api/unified-graphql-client'
import { gql } from '@apollo/client'
import { scheduleOrderQueueAPI } from '@/lib/api/schedule-order-queue'

// GraphQL mutations
const UPDATE_SCHEDULE_ORDER = gql`
  mutation UpdateScheduleOrder($where: ScheduleOrderWhereUniqueInput!, $data: ScheduleOrderUpdateInput!) {
    updateScheduleOrder(where: $where, data: $data) {
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
      duration
      durationUnits
      estimatedMashingDuration
      estimatedMashingStartTime
      estimatedFermentationDuration
      estimatedFermentationStartTime
      estimatedDistillationDuration
      estimatedDistillationStartTime
      estimatedBarrelingStartTime
      estimatedProcessingStartTime
      estimatedTotalProductionDuration
    }
  }
`

const UPDATE_PRODUCTION_ORDER = gql`
  mutation UpdateProductionOrder($where: ProductionOrderWhereUniqueInput!, $data: ProductionOrderUpdateInput!) {
    updateProductionOrder(where: $where, data: $data) {
      id
      name
      status
      quantity
      containerType
      finalProof
    }
  }
`

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
  duration?: number
  durationUnits?: string
  estimatedMashingDuration?: number
  estimatedMashingStartTime?: string
  estimatedFermentationDuration?: number
  estimatedFermentationStartTime?: string
  estimatedDistillationDuration?: number
  estimatedDistillationStartTime?: string
  estimatedBarrelingStartTime?: string
  estimatedProcessingStartTime?: string
  estimatedTotalProductionDuration?: number
  // Execution tracking fields at ScheduleOrder level
  totalCooks?: number
  totalFermenters?: number
  completedCooks?: number
  completedFermenters?: number
  executedCooks?: number
  executedFermenters?: number
  estimatedBarrelsPerFermenter?: number
  estimatedPGsPerBbl?: number
  estimatedPGsPerBushel?: number
  totalGrainWeight?: number
  // ProductionOrders contain barrel specifications only
  productionOrders?: Array<{
    id: string
    name: string | null
    status: string
    quantity: number | null
    containerType: string | null
    finalProof: number | null
    recipe?: {
      id: string
      Recipe: string
      whiskeyType: string
      customerCode?: string
    }
    customer?: {
      id: string
      name?: string
      customerCode?: string
    }
  }>
}

interface ScheduleOrderQueue {
  id: string
  queueIndex: number
  areas: { id: string; name: string }[]
  scheduleOrder: ScheduleOrder
}

interface FutureOrderEditModalProps {
  isOpen: boolean
  onClose: () => void
  orderQueue: ScheduleOrderQueue | null
  cellName: string
  onSave: () => Promise<void>
  onEditSORecipe?: (orderQueue: ScheduleOrderQueue) => void
}

// Create the GraphQL client instance with JWT authentication
const graphqlClient = new UnifiedGraphQLClient({
  useJWTAuth: true,
  enableRetry: true,
})

export function FutureOrderEditModal({
  isOpen,
  onClose,
  orderQueue,
  cellName,
  onSave,
  onEditSORecipe
}: FutureOrderEditModalProps) {
  // Get current user email for audit trails
  const userEmail = useCurrentUserEmail()

  const [formData, setFormData] = useState({
    name: '',
    recipeName: '',
    status: '',
    estimatedStart: '',
    estimatedEnd: '',
    totalBarrels: '',
    totalProofGallons: ''
  })

  const [productionOrders, setProductionOrders] = useState<Array<{
    id: string
    name: string | null
    status: string
    quantity: number | null
    totalCooks: number | null
    totalFermenters: number | null
    completedCooks: number | null
    completedFermenters: number | null
    executedCooks: number | null
    executedFermenters: number | null
    estimatedBarrelsPerFermenter: number | null
    estimatedPGsPerBbl: number | null
    estimatedPGsPerBushel: number | null
    containerType: string | null
    finalProof: number | null
    totalGrainWeight: number | null
    recipe?: {
      id: string
      Recipe: string
      whiskeyType: string
      customerCode?: string
    }
    customer?: {
      id: string
      name?: string
      customerCode?: string
    }
  }>>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (orderQueue?.scheduleOrder) {
      const order = orderQueue.scheduleOrder
      setFormData({
        name: order.name || '',
        recipeName: order.recipeName || '',
        status: order.status || '',
        estimatedStart: order.estimatedStart ? new Date(order.estimatedStart).toISOString().slice(0, 16) : '',
        estimatedEnd: order.estimatedEnd ? new Date(order.estimatedEnd).toISOString().slice(0, 16) : '',
        totalBarrels: order.totalBarrels?.toString() || '',
        totalProofGallons: order.totalProofGallons?.toString() || ''
      })
      setProductionOrders(order.productionOrders || [])
    }
  }, [orderQueue])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Complete':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'InProgress':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'Scheduled':
        return 'bg-purple-100 text-purple-800 border-purple-200'
      case 'Created':
        return 'bg-orange-100 text-orange-800 border-orange-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
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

  const handleSave = async () => {
    if (!orderQueue) return

    setIsLoading(true)
    try {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            mutation UpdateScheduleOrder(
              $id: String!
              $name: String
              $recipeName: String
              $status: String
              $estimatedStart: DateTime
              $estimatedEnd: DateTime
              $totalBarrels: Float
              $totalProofGallons: Float
              $updatedBy: String
            ) {
              updateScheduleOrder(
                where: { id: $id }
                data: {
                  name: $name
                  recipeName: $recipeName
                  status: $status
                  estimatedStart: $estimatedStart
                  estimatedEnd: $estimatedEnd
                  totalBarrels: $totalBarrels
                  totalProofGallons: $totalProofGallons
                  updatedBy: $updatedBy
                }
              ) {
                id
                name
                recipeName
                status
                estimatedStart
                estimatedEnd
                totalBarrels
                totalProofGallons
                updatedBy
              }
            }
          `,
          variables: {
            id: orderQueue.scheduleOrder.id,
            name: formData.name || null,
            recipeName: formData.recipeName || null,
            status: formData.status || null,
            estimatedStart: formData.estimatedStart ? new Date(formData.estimatedStart).toISOString() : null,
            estimatedEnd: formData.estimatedEnd ? new Date(formData.estimatedEnd).toISOString() : null,
            totalBarrels: formData.totalBarrels ? parseFloat(formData.totalBarrels) : null,
            totalProofGallons: formData.totalProofGallons ? parseFloat(formData.totalProofGallons) : null,
            updatedBy: userEmail // Use logged-in user's email from Entra ID
          }
        })
      })

      const result = await response.json()

      if (result.errors) {
        console.error('GraphQL errors:', result.errors)
        toast.error('Failed to update future order')
        return
      }

      toast.success('Future order updated successfully')
      await onSave()
      onClose()
    } catch (error) {
      console.error('Error updating future order:', error)
      toast.error('Failed to update future order')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!orderQueue) return

    // Confirmation dialog
    const confirmed = confirm(
      `Delete this schedule order?\n\n` +
      `This will:\n` +
      `• Remove from queue (Position ${orderQueue.queueIndex})\n` +
      `• Unlink ${productionOrders.length} production order(s)\n` +
      `• Delete all recipe data\n` +
      `• Resequence remaining queue items\n\n` +
      `Production orders will be marked as available for rescheduling.\n\n` +
      `This cannot be undone. Continue?`
    )

    if (!confirmed) return

    setIsLoading(true)
    try {
      const result = await scheduleOrderQueueAPI.deleteScheduleOrder(
        orderQueue.scheduleOrder.id,
        userEmail
      )

      if (result.error) {
        console.error('Delete error:', result.error)
        toast.error(`Failed to delete order: ${result.error}`)
        return
      }

      toast.success('Schedule order deleted successfully')
      await onSave() // Refresh the schedule view
      onClose()
    } catch (error) {
      console.error('Error deleting schedule order:', error)
      toast.error('Failed to delete schedule order')
    } finally {
      setIsLoading(false)
    }
  }

  if (!orderQueue) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-3">
              <Edit className="h-5 w-5" />
              Edit Future Order Details
            </DialogTitle>
            {onEditSORecipe && orderQueue && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEditSORecipe(orderQueue)}
                disabled={isLoading}
                className="flex items-center gap-2 bg-blue-50 hover:bg-blue-100 border-blue-200"
              >
                <FlaskConical className="h-4 w-4" />
                Edit Recipe Instance
              </Button>
            )}
          </div>
          <DialogDescription>
            Modify the future order scheduled for {cellName} - Queue Position {orderQueue.queueIndex}
          </DialogDescription>
        </DialogHeader>
        
        <form id="future-order-edit-form" className="space-y-6">
          {/* Status and Basic Info */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">
                  {orderQueue.scheduleOrder.name || `Order ${orderQueue.scheduleOrder.id.slice(-8)}`}
                </CardTitle>
                <Badge className={`${getStatusColor(orderQueue.scheduleOrder.status)} flex items-center gap-1`}>
                  {getStatusIcon(orderQueue.scheduleOrder.status)}
                  FUTURE - {orderQueue.scheduleOrder.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Order Name</Label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="recipeName">Recipe Name</Label>
                  <Input
                    id="recipeName"
                    name="recipeName"
                    value={formData.recipeName}
                    onChange={(e) => setFormData(prev => ({ ...prev, recipeName: e.target.value }))}
                    className="w-full"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select name="status" value={formData.status} onValueChange={(value) => setFormData(prev => ({ ...prev, status: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Created">Created</SelectItem>
                      <SelectItem value="Scheduled">Scheduled</SelectItem>
                      <SelectItem value="InProgress">In Progress</SelectItem>
                      <SelectItem value="Complete">Complete</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="estimatedStart">Estimated Start</Label>
                  <Input
                    id="estimatedStart"
                    name="estimatedStart"
                    type="datetime-local"
                    value={formData.estimatedStart}
                    onChange={(e) => setFormData(prev => ({ ...prev, estimatedStart: e.target.value }))}
                    className="w-full"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="estimatedEnd">Estimated End</Label>
                  <Input
                    id="estimatedEnd"
                    name="estimatedEnd"
                    type="datetime-local"
                    value={formData.estimatedEnd}
                    onChange={(e) => setFormData(prev => ({ ...prev, estimatedEnd: e.target.value }))}
                    className="w-full"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="totalBarrels">Total Barrels</Label>
                  <Input
                    id="totalBarrels"
                    name="totalBarrels"
                    type="number"
                    step="0.1"
                    value={formData.totalBarrels}
                    onChange={(e) => setFormData(prev => ({ ...prev, totalBarrels: e.target.value }))}
                    className="w-full"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="totalProofGallons">Total Proof Gallons</Label>
                  <Input
                    id="totalProofGallons"
                    name="totalProofGallons"
                    type="number"
                    step="0.1"
                    value={formData.totalProofGallons}
                    onChange={(e) => setFormData(prev => ({ ...prev, totalProofGallons: e.target.value }))}
                    className="w-full"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Production Orders */}
          {productionOrders.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg text-orange-600">Production Orders</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {productionOrders.map((po, index) => (
                    <div key={po.id} className="border rounded p-4 bg-gray-50">
                      <h4 className="font-semibold mb-3 text-gray-800">
                        Production Order {index + 1}: {po.name || `PO-${po.id.slice(-6)}`}
                      </h4>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor={`po-name-${index}`}>Name</Label>
                          <Input
                            id={`po-name-${index}`}
                            name={`po-name-${index}`}
                            value={po.name || ''}
                            onChange={(e) => {
                              const updatedOrders = [...productionOrders]
                              updatedOrders[index].name = e.target.value || null
                              setProductionOrders(updatedOrders)
                            }}
                            className="w-full"
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor={`po-status-${index}`}>Status</Label>
                          <Select name={`po-status-${index}`} value={po.status} onValueChange={(value) => {
                            const updatedOrders = [...productionOrders]
                            updatedOrders[index].status = value
                            setProductionOrders(updatedOrders)
                          }}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Created">Created</SelectItem>
                              <SelectItem value="Scheduled">Scheduled</SelectItem>
                              <SelectItem value="InProgress">In Progress</SelectItem>
                              <SelectItem value="Complete">Complete</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor={`po-quantity-${index}`}>Quantity</Label>
                          <Input
                            id={`po-quantity-${index}`}
                            name={`po-quantity-${index}`}
                            type="number"
                            step="0.1"
                            value={po.quantity?.toString() || ''}
                            onChange={(e) => {
                              const updatedOrders = [...productionOrders]
                              updatedOrders[index].quantity = e.target.value ? parseFloat(e.target.value) : null
                              setProductionOrders(updatedOrders)
                            }}
                            className="w-full"
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor={`po-container-type-${index}`}>Container Type</Label>
                          <Select name={`po-container-type-${index}`} value={po.containerType || ''} onValueChange={(value) => {
                            const updatedOrders = [...productionOrders]
                            updatedOrders[index].containerType = value || null
                            setProductionOrders(updatedOrders)
                          }}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Barrel">Barrel</SelectItem>
                              <SelectItem value="Tank">Tank</SelectItem>
                              <SelectItem value="Tote">Tote</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor={`po-total-cooks-${index}`}>Total Cooks</Label>
                          <Input
                            id={`po-total-cooks-${index}`}
                            name={`po-total-cooks-${index}`}
                            type="number"
                            value={po.completedCooks?.toString() || ''}
                            onChange={(e) => {
                              const updatedOrders = [...productionOrders]
                              updatedOrders[index].completedCooks = e.target.value ? parseInt(e.target.value) : null
                              setProductionOrders(updatedOrders)
                            }}
                            className="w-full"
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor={`po-total-fermenters-${index}`}>Total Fermenters</Label>
                          <Input
                            id={`po-total-fermenters-${index}`}
                            name={`po-total-fermenters-${index}`}
                            type="number"
                            value={po.completedFermenters?.toString() || ''}
                            onChange={(e) => {
                              const updatedOrders = [...productionOrders]
                              updatedOrders[index].completedFermenters = e.target.value ? parseInt(e.target.value) : null
                              setProductionOrders(updatedOrders)
                            }}
                            className="w-full"
                          />
                        </div>
                      </div>

                      {/* Recipe and Customer Info (Read-only) */}
                      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {po.recipe && (
                          <>
                            <div className="space-y-1">
                              <Label className="text-xs font-medium">Recipe</Label>
                              <div className="text-sm text-gray-600 p-2 bg-gray-100 rounded">{po.recipe.Recipe}</div>
                            </div>
                            
                            <div className="space-y-1">
                              <Label className="text-xs font-medium">Whiskey Type</Label>
                              <div className="text-sm text-gray-600 p-2 bg-gray-100 rounded">{po.recipe.whiskeyType}</div>
                            </div>
                          </>
                        )}
                        
                        {po.customer && (
                          <>
                            <div className="space-y-1">
                              <Label className="text-xs font-medium">Customer</Label>
                              <div className="text-sm text-gray-600 p-2 bg-gray-100 rounded">{po.customer.name}</div>
                            </div>
                            
                            <div className="space-y-1">
                              <Label className="text-xs font-medium">Customer Code</Label>
                              <div className="text-sm text-gray-600 font-mono p-2 bg-gray-100 rounded">{po.customer.customerCode}</div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </form>

        <DialogFooter className="flex justify-between pt-4 border-t">
          <div className="flex space-x-2">
            {onEditSORecipe && orderQueue && (
              <Button
                variant="secondary"
                onClick={() => onEditSORecipe(orderQueue)}
                disabled={isLoading}
                className="flex items-center gap-2"
              >
                <Edit className="h-4 w-4" />
                Edit Recipe (BOM/Params)
              </Button>
            )}
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isLoading || orderQueue?.queueIndex === 0}
              className="flex items-center gap-2"
              title={orderQueue?.queueIndex === 0 ? 'Cannot delete currently running order (queue index 0)' : 'Delete this schedule order'}
            >
              <Trash2 className="h-4 w-4" />
              Delete Order
            </Button>
          </div>
          <div className="flex space-x-2">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isLoading}
            >
              {isLoading ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
} 