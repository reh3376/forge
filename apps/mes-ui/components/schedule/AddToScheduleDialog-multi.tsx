'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CalendarIcon, FlaskConicalIcon, Package, AlertCircle } from 'lucide-react'
import { UnifiedGraphQLClient } from '@/lib/api/unified-graphql-client'
import { CREATE_SCHEDULE_FROM_ORDERS } from '@/lib/api/schedule-grouping-mutations'
import { toast } from 'sonner'

interface ProductionOrder {
  id: string
  name: string | null
  status: string
  quantity: number
  finalProof: number | null
  containerType: string | null
  customer: {
    id: string
    name?: string
    customerCode?: string
  }
  recipe: {
    id: string
    Recipe: string
    whiskeyType: string
    recipeGroup?: {
      id: string
      recipe: string
    }
  }
}

interface AddToScheduleDialogMultiProps {
  isOpen: boolean
  onClose: () => void
  productionOrders: ProductionOrder[]
  createdBy: string
  onSuccess?: () => void
}

export function AddToScheduleDialogMulti({
  isOpen,
  onClose,
  productionOrders,
  createdBy,
  onSuccess
}: AddToScheduleDialogMultiProps) {
  const [scheduleName, setScheduleName] = useState('')
  const [estimatedStart, setEstimatedStart] = useState('')
  const [estimatedEnd, setEstimatedEnd] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const graphqlClient = new UnifiedGraphQLClient({
    useJWTAuth: true,
    enableRetry: true,
  })

  // Initialize form
  useEffect(() => {
    if (productionOrders.length > 0) {
      // Generate default name from recipe
      const recipe = productionOrders[0].recipe.Recipe
      const mashBill = productionOrders[0].recipe.recipeGroup?.recipe || recipe
      setScheduleName(`${mashBill} Run - ${new Date().toLocaleDateString()}`)

      // Set default dates to today
      const now = new Date()
      const tomorrow = new Date(now)
      tomorrow.setDate(tomorrow.getDate() + 7) // Default to 1 week from now

      setEstimatedStart(now.toISOString().slice(0, 16))
      setEstimatedEnd(tomorrow.toISOString().slice(0, 16))
    }
  }, [productionOrders])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!scheduleName || !estimatedStart || !estimatedEnd) {
      toast.error('Please fill in all required fields')
      return
    }

    setIsSubmitting(true)

    try {
      const result = await graphqlClient.mutate(CREATE_SCHEDULE_FROM_ORDERS, {
        variables: {
          productionOrderIds: productionOrders.map(o => o.id),
          data: {
            name: scheduleName,
            recipeName: productionOrders[0].recipe.Recipe,
            estimatedStart: new Date(estimatedStart).toISOString(),
            estimatedEnd: new Date(estimatedEnd).toISOString(),
            createdBy,
            status: 'Created'
          }
        }
      })

      if (result?.createScheduleOrderFromProductionOrders) {
        const scheduleOrder = result.createScheduleOrderFromProductionOrders
        toast.success(`Created "${scheduleName}" with ${productionOrders.length} order(s)`)
        onSuccess?.()
        onClose()
      } else {
        // Log if no data returned but no error thrown
        console.warn('Mutation completed but no schedule order returned:', result)
        toast.error('Schedule order may have been created but response was incomplete. Please refresh.')
      }
    } catch (error) {
      console.error('Error creating schedule order:', error)
      toast.error('Failed to create schedule order')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      onClose()
    }
  }

  if (productionOrders.length === 0) return null

  // Calculate totals
  const totalQuantity = productionOrders.reduce((sum, o) => sum + o.quantity, 0)
  const uniqueCustomers = new Set(productionOrders.map(o => o.customer.name || o.customer.customerCode))
  const mashBill = productionOrders[0].recipe.recipeGroup?.recipe || productionOrders[0].recipe.Recipe

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            Create Production Run
          </DialogTitle>
          <DialogDescription>
            Group {productionOrders.length} production order(s) into a production run for distillate production
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Orders Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Package className="h-5 w-5" />
                Production Orders ({productionOrders.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-4 p-3 bg-muted rounded-lg">
                <div>
                  <Label className="text-xs text-muted-foreground">Mash Bill</Label>
                  <p className="font-medium">{mashBill}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Total Barrels</Label>
                  <p className="font-medium">{totalQuantity}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Customers</Label>
                  <p className="font-medium">{uniqueCustomers.size}</p>
                </div>
              </div>

              {/* Orders list */}
              <div className="space-y-2">
                {productionOrders.map((order, index) => (
                  <div key={order.id} className="flex items-center gap-3 p-2 border rounded">
                    <span className="text-xs text-muted-foreground">#{index + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {order.name || `Order ${order.id.slice(-6)}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {order.customer.name || order.customer.customerCode} • {order.quantity} bbls
                        {order.finalProof && ` • ${order.finalProof}°`}
                        {order.containerType && ` • ${order.containerType}`}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {order.status}
                    </Badge>
                  </div>
                ))}
              </div>

              <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg">
                <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5" />
                <div className="text-sm text-blue-700">
                  <strong>Note:</strong> Execution details (cooks, fermenters, grain weight) will be calculated automatically based on these orders.
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Schedule Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FlaskConicalIcon className="h-5 w-5" />
                Production Run Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="scheduleName">
                  Run Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="scheduleName"
                  value={scheduleName}
                  onChange={(e) => setScheduleName(e.target.value)}
                  placeholder="e.g., Mash Bill #5 - March Run"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="estimatedStart">
                    Estimated Start <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="estimatedStart"
                    type="datetime-local"
                    value={estimatedStart}
                    onChange={(e) => setEstimatedStart(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="estimatedEnd">
                    Estimated End <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="estimatedEnd"
                    type="datetime-local"
                    value={estimatedEnd}
                    onChange={(e) => setEstimatedEnd(e.target.value)}
                    required
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Timeline will be refined during production planning with phase-specific durations
              </p>
            </CardContent>
          </Card>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Production Run'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
