'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertTriangle, Play } from 'lucide-react'

interface ScheduleOrderQueue {
  id: string
  queueIndex: number | null
  scheduleOrder: {
    id: string
    name: string
    recipeName?: string
    status: string
  }
}

interface StartOrderConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  queueItem: ScheduleOrderQueue | null
  activeOrderAtIndex0: ScheduleOrderQueue | null
  isLoading?: boolean
}

export function StartOrderConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  queueItem,
  activeOrderAtIndex0,
  isLoading = false
}: StartOrderConfirmDialogProps) {
  if (!queueItem) return null

  const hasActiveOrderAtIndex0 = activeOrderAtIndex0 && 
    (activeOrderAtIndex0.scheduleOrder.status === 'InProgress' || 
     activeOrderAtIndex0.scheduleOrder.status === 'Scheduled')

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-5 w-5 text-green-600" />
            Start Production Order
          </DialogTitle>
          <DialogDescription>
            You are about to start the production order at queue position 1.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Order Details */}
          <div className="bg-gray-50 p-3 rounded-lg">
            <h4 className="font-medium text-sm text-gray-900 mb-2">Order Details</h4>
            <div className="space-y-1 text-sm text-gray-600">
              <div><span className="font-medium">Name:</span> {queueItem.scheduleOrder.name}</div>
              {queueItem.scheduleOrder.recipeName && (
                <div><span className="font-medium">Recipe:</span> {queueItem.scheduleOrder.recipeName}</div>
              )}
              <div><span className="font-medium">Queue Position:</span> {queueItem.queueIndex}</div>
            </div>
          </div>

          {/* Warning if there's an active order at index 0 */}
          {hasActiveOrderAtIndex0 && (
            <Alert className="border-orange-200 bg-orange-50">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              <AlertDescription className="text-orange-800">
                <div className="font-medium mb-1">Active Order Override Warning</div>
                <div className="text-sm">
                  This will override recipe <span className="font-medium">
                    {activeOrderAtIndex0.scheduleOrder.recipeName || activeOrderAtIndex0.scheduleOrder.name}
                  </span> currently running at Mashing. The next cook will pull in this new recipe from queue position 1.
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Confirmation message */}
          <div className="text-sm text-gray-600">
            Starting this order will:
            <ul className="list-disc list-inside mt-1 space-y-1">
              <li>Create a production order recipe instance</li>
              <li>Update the order status to &quot;In Progress&quot;</li>
              {hasActiveOrderAtIndex0 && (
                <li className="text-orange-700 font-medium">
                  Queue this recipe to replace the current mashing recipe
                </li>
              )}
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button 
            onClick={onConfirm} 
            disabled={isLoading}
            className="bg-green-600 hover:bg-green-700"
          >
            {isLoading ? 'Starting...' : 'Start Order'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
} 