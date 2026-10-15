'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CalendarIcon, ClockIcon, BarChart3Icon, FlaskConicalIcon } from 'lucide-react'
import { useAddToSchedule } from '@/hooks/useAddToSchedule'

interface ProductionOrder {
  id: string
  name: string | null
  status: 'Complete' | 'Initiated' | 'InProgress' | 'Planned' | 'Committed'
  startDate: string
  endDate: string
  quantity: number
  // Note: Execution tracking fields moved to ScheduleOrder - will be calculated by backend
  recipe: {
    id: string
    Recipe: string
    whiskeyType: string
  }
  customer: {
    id: string
    name?: string
    customerCode?: string
  }
}

interface AddToScheduleDialogProps {
  isOpen: boolean
  onClose: () => void
  productionOrder: ProductionOrder | null
  createdBy: string
  onSuccess?: () => void
}

export function AddToScheduleDialog({
  isOpen,
  onClose,
  productionOrder,
  createdBy,
  onSuccess
}: AddToScheduleDialogProps) {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const { addToSchedule, isLoading } = useAddToSchedule()

  // Initialize form with production order data
  useEffect(() => {
    if (productionOrder) {
      // Convert dates to datetime-local format
      const formatDateForInput = (dateString: string) => {
        const date = new Date(dateString)
        return date.toISOString().slice(0, 16)
      }

      setStartDate(formatDateForInput(productionOrder.startDate))
      setEndDate(formatDateForInput(productionOrder.endDate))
    }
  }, [productionOrder])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!productionOrder || !startDate || !endDate) return

    const scheduleData = {
      startDate: new Date(startDate).toISOString(),
      endDate: new Date(endDate).toISOString()
    }

    const result = await addToSchedule(productionOrder, createdBy, scheduleData)
    
    if (result.success) {
      onSuccess?.()
      onClose()
    }
  }

  const handleClose = () => {
    if (!isLoading) {
      onClose()
    }
  }

  if (!productionOrder) return null

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            Add to Schedule
          </DialogTitle>
          <DialogDescription>
            Set the schedule dates for this production order
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Production Order Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FlaskConicalIcon className="h-5 w-5" />
                Production Order Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Order Name</Label>
                  <p className="font-medium">{productionOrder.name || 'Unnamed Order'}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Status</Label>
                  <Badge variant="outline">{productionOrder.status}</Badge>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Recipe</Label>
                  <p className="font-medium">{productionOrder.recipe.Recipe}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Whiskey Type</Label>
                  <p className="font-medium">{productionOrder.recipe.whiskeyType}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Customer</Label>
                  <p className="font-medium">{productionOrder.customer.name || productionOrder.customer.customerCode || 'N/A'}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Quantity</Label>
                  <p className="font-medium">{productionOrder.quantity}</p>
                </div>
              </div>

              {/* Note about execution tracking */}
              <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-700">
                  <strong>Note:</strong> Execution details (cooks, fermenters, barrel estimates) will be calculated automatically when the Schedule Order is created from this Production Order.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Schedule Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ClockIcon className="h-5 w-5" />
                Schedule Dates
              </CardTitle>
              <CardDescription>
                Set the start and end dates for this production order in the schedule
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="startDate">
                    Start Date & Time <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="startDate"
                    type="datetime-local"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="endDate">
                    End Date & Time <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="endDate"
                    type="datetime-local"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    required
                  />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Production parameters (barrels per fermenter, proof gallons, etc.) will be calculated automatically from the production order data.
              </p>
            </CardContent>
          </Card>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !startDate || !endDate}
              className="flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Adding to Schedule...
                </>
              ) : (
                <>
                  <BarChart3Icon className="h-4 w-4" />
                  Add to Schedule
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
} 