'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Package, Search, Filter, Calendar, User, FlaskConical, AlertCircle, CheckCircle2, Info, XCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { UnifiedGraphQLClient } from '@/lib/api/unified-graphql-client'
import { GET_UNSCHEDULED_ORDERS, UPDATE_PRODUCTION_ORDER } from '@/lib/api/production-order-queries'
import { toast } from 'sonner'
import { validateOrderGrouping, isOrderCompatible, generateGroupingSuggestion } from '@/lib/scheduling/grouping-validation'
import { calculateProductionAggregates, formatAggregates } from '@/lib/scheduling/aggregate-calculator'
import type { ProductionOrderWithRecipeGroup } from '@/types'

interface ProductionOrder {
  id: string
  name: string | null
  status: string
  quantity: number
  finalProof: number | null
  containerType: string | null
  createdAt: string
  startDate: string
  endDate: string
  customer: {
    id: string
    name?: string
    customerCode?: string
  }
  recipe: {
    id: string
    Recipe: string
    whiskeyType: string
    customerCode?: string
    recipeGroup?: {
      id: string
      recipe: string
    }
  }
}

interface UnscheduledOrdersPanelProps {
  onAddToSchedule: (selectedOrders: ProductionOrder[]) => void
  refreshTrigger?: number
}

export function UnscheduledOrdersPanel({ onAddToSchedule, refreshTrigger }: UnscheduledOrdersPanelProps) {
  const [orders, setOrders] = useState<ProductionOrder[]>([])
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [customerFilter, setCustomerFilter] = useState<string>('all')
  const [cancellingOrder, setCancellingOrder] = useState<ProductionOrder | null>(null)
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)

  const graphqlClient = new UnifiedGraphQLClient({
    useJWTAuth: true,
    enableRetry: true,
  })

  const fetchUnscheduledOrders = async () => {
    setLoading(true)
    try {
      const result = await graphqlClient.query(GET_UNSCHEDULED_ORDERS, {
        variables: {
          orderBy: [{ createdAt: 'Desc' }]
        }
      })

      // UnifiedGraphQLClient.query() returns result.data directly, not the full Apollo response
      const data = result as { productionOrders?: any[] }
      if (data?.productionOrders) {
        // Filter for truly unscheduled orders only
        // Exclude ANY order that's already linked to a schedule order (regardless of status)
        const unscheduled = data.productionOrders.filter((order: any) => {
          return !order.scheduleOrder &&
            (order.status === 'Planned' || order.status === 'Committed' || order.status === 'Initiated')
        })
        setOrders(unscheduled)
      }
    } catch (error) {
      console.error('Error fetching unscheduled orders:', error)
      toast.error('Failed to load unscheduled orders')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUnscheduledOrders()
  }, [refreshTrigger])

  const toggleOrderSelection = (orderId: string) => {
    const newSelected = new Set(selectedOrders)
    if (newSelected.has(orderId)) {
      newSelected.delete(orderId)
    } else {
      newSelected.add(orderId)
    }
    setSelectedOrders(newSelected)
  }

  const toggleSelectAll = () => {
    if (selectedOrders.size === filteredOrders.length) {
      setSelectedOrders(new Set())
    } else {
      setSelectedOrders(new Set(filteredOrders.map(o => o.id)))
    }
  }

  const handleAddToSchedule = () => {
    const selected = orders.filter(o => selectedOrders.has(o.id))

    if (selected.length === 0) {
      toast.error('Please select at least one order')
      return
    }

    // Check if all selected orders have the same mash bill (recipe group)
    const mashBills = new Set(selected.map(o => o.recipe.recipeGroup?.recipe || o.recipe.Recipe))
    if (mashBills.size > 1) {
      toast.error('Selected orders must have the same mash bill to be scheduled together')
      return
    }

    onAddToSchedule(selected)
    setSelectedOrders(new Set())
  }

  const openCancelDialog = (e: React.MouseEvent, order: ProductionOrder) => {
    e.stopPropagation()
    setCancellingOrder(order)
    setIsCancelDialogOpen(true)
  }

  const handleCancelOrder = async () => {
    if (!cancellingOrder) return
    setIsCancelling(true)
    try {
      await graphqlClient.mutate(UPDATE_PRODUCTION_ORDER, {
        variables: {
          where: { id: cancellingOrder.id },
          data: { status: 'Cancelled' },
        },
      })
      toast.success(`Order "${cancellingOrder.name || cancellingOrder.id.slice(-6)}" cancelled`)
      setIsCancelDialogOpen(false)
      setCancellingOrder(null)
      // Remove from selected if it was selected
      const newSelected = new Set(selectedOrders)
      newSelected.delete(cancellingOrder.id)
      setSelectedOrders(newSelected)
      // Refresh the list
      fetchUnscheduledOrders()
    } catch (error: any) {
      console.error('Error cancelling order:', error)
      toast.error(error?.message || 'Failed to cancel order')
    } finally {
      setIsCancelling(false)
    }
  }

  // Filter orders based on search and filters
  const filteredOrders = orders.filter(order => {
    // Search filter
    const matchesSearch = !searchTerm ||
      order.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customer.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.recipe.Recipe.toLowerCase().includes(searchTerm.toLowerCase())

    // Status filter
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter

    // Customer filter
    const matchesCustomer = customerFilter === 'all' || order.customer.id === customerFilter

    return matchesSearch && matchesStatus && matchesCustomer
  })

  // Get unique customers for filter
  const uniqueCustomers = Array.from(new Set(orders.map(o => o.customer.id)))
    .map(id => orders.find(o => o.customer.id === id)?.customer)
    .filter(Boolean)

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          Orders to Schedule
        </CardTitle>
        <CardDescription>
          Production orders waiting to be added to the schedule
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col space-y-4">
        {/* Filters */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search orders..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>

          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Planned">Planned</SelectItem>
                <SelectItem value="Committed">Committed</SelectItem>
                <SelectItem value="Initiated">Initiated</SelectItem>
              </SelectContent>
            </Select>

            <Select value={customerFilter} onValueChange={setCustomerFilter}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Customer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Customers</SelectItem>
                {uniqueCustomers.map(customer => (
                  <SelectItem key={customer!.id} value={customer!.id}>
                    {customer!.name || customer!.customerCode}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Action bar */}
        <div className="flex items-center justify-between pb-2 border-b">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={selectedOrders.size > 0 && selectedOrders.size === filteredOrders.length}
              onCheckedChange={toggleSelectAll}
            />
            <span className="text-sm text-muted-foreground">
              {selectedOrders.size > 0 ? `${selectedOrders.size} selected` : 'Select all'}
            </span>
          </div>

          <Button
            onClick={handleAddToSchedule}
            disabled={selectedOrders.size === 0}
            size="sm"
          >
            Add to Schedule ({selectedOrders.size})
          </Button>
        </div>

        {/* Smart Grouping Validation & Aggregates */}
        {selectedOrders.size > 0 && (() => {
          const selected = orders.filter(o => selectedOrders.has(o.id)) as ProductionOrderWithRecipeGroup[]
          const validation = validateOrderGrouping(selected)
          const aggregates = validation.valid ? calculateProductionAggregates(selected) : null
          const suggestion = generateGroupingSuggestion(selected)

          return (
            <div className="space-y-2">
              {/* Validation Alert */}
              {!validation.valid && validation.errors.length > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {validation.errors[0]}
                  </AlertDescription>
                </Alert>
              )}

              {/* Success & Aggregates */}
              {validation.valid && aggregates && (
                <div className="space-y-2">
                  <Alert className="border-green-200 bg-green-50">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-900">
                      <strong>{suggestion}</strong>
                    </AlertDescription>
                  </Alert>

                  {/* Aggregate Stats */}
                  <div className="grid grid-cols-2 gap-2 p-3 bg-muted rounded-lg text-xs">
                    {formatAggregates(aggregates).map((stat, i) => (
                      <div key={i} className="flex justify-between">
                        <span className="text-muted-foreground">{stat.label}:</span>
                        <span className="font-medium">{stat.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Warnings */}
              {validation.warnings.length > 0 && (
                <Alert className="border-yellow-200 bg-yellow-50">
                  <Info className="h-4 w-4 text-yellow-600" />
                  <AlertDescription className="text-yellow-900 text-xs">
                    {validation.warnings[0]}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )
        })()}

        {/* Orders list */}
        <div className="flex-1 overflow-y-auto space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Package className="h-12 w-12 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                {orders.length === 0
                  ? 'No unscheduled orders'
                  : 'No orders match your filters'}
              </p>
            </div>
          ) : (
            filteredOrders.map(order => {
              const selected = orders.filter(o => selectedOrders.has(o.id)) as ProductionOrderWithRecipeGroup[]
              const isCompatible = selectedOrders.size === 0 || isOrderCompatible(order as ProductionOrderWithRecipeGroup, selected)

              return (
                <Card
                  key={order.id}
                  className={`cursor-pointer transition-colors hover:border-primary ${
                    selectedOrders.has(order.id) ? 'border-primary bg-primary/5' : ''
                  } ${!isCompatible && selectedOrders.size > 0 ? 'opacity-50' : ''}`}
                  onClick={() => toggleOrderSelection(order.id)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={selectedOrders.has(order.id)}
                        onCheckedChange={() => toggleOrderSelection(order.id)}
                        onClick={(e) => e.stopPropagation()}
                        disabled={!isCompatible && selectedOrders.size > 0}
                      />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <p className="font-medium truncate">
                              {order.name || `Order ${order.id.slice(-6)}`}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-xs">
                                {order.status}
                              </Badge>
                              {!isCompatible && selectedOrders.size > 0 && (
                                <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-700">
                                  Different Mash Bill
                                </Badge>
                              )}
                              {order.containerType && (
                                <span className="text-xs text-muted-foreground">
                                  {order.containerType}
                                </span>
                              )}
                            </div>
                          </div>
                          {(order.status === 'Planned' || order.status === 'Initiated') && (
                            <button
                              onClick={(e) => openCancelDialog(e, order)}
                              className="text-muted-foreground hover:text-red-600 transition-colors shrink-0"
                              title="Cancel order"
                            >
                              <XCircle className="h-4 w-4" />
                            </button>
                          )}
                        </div>

                      <div className="space-y-1 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          <span className="truncate">
                            {order.customer.name || order.customer.customerCode}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <FlaskConical className="h-3 w-3" />
                          <span className="truncate">
                            {order.recipe.Recipe} ({order.recipe.whiskeyType})
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          <span>
                            {formatDate(order.startDate)} - {formatDate(order.endDate)}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 mt-1">
                          <span>Qty: {order.quantity}</span>
                          {order.finalProof && (
                            <span>Proof: {order.finalProof}°</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              )
            })
          )}
        </div>
      </CardContent>

      {/* Cancel Confirmation Dialog */}
      <Dialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Production Order</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this production order? This action will change the order status to Cancelled.
            </DialogDescription>
          </DialogHeader>
          {cancellingOrder && (
            <div className="space-y-2 text-sm py-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Order:</span>
                <span className="font-medium">{cancellingOrder.name || cancellingOrder.id.slice(-6)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer:</span>
                <span>{cancellingOrder.customer.name || cancellingOrder.customer.customerCode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Recipe:</span>
                <span>{cancellingOrder.recipe.Recipe}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Quantity:</span>
                <span>{cancellingOrder.quantity}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCancelDialogOpen(false)} disabled={isCancelling}>
              Keep Order
            </Button>
            <Button variant="destructive" onClick={handleCancelOrder} disabled={isCancelling}>
              {isCancelling ? 'Cancelling...' : 'Cancel Order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
