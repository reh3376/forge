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
import { CheckCircle, AlertTriangle } from 'lucide-react'

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

interface CompleteOrderConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  queueItem: ScheduleOrderQueue | null
  isLoading?: boolean
}

export function CompleteOrderConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  queueItem,
  isLoading = false
}: CompleteOrderConfirmDialogProps) {
  if (!queueItem) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            Mark Order Complete
          </DialogTitle>
          <DialogDescription>
            You are about to mark this production order as complete.
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
              <div><span className="font-medium">Current Status:</span> {queueItem.scheduleOrder.status}</div>
            </div>
          </div>

          {/* Barrel Filling Confirmation */}
          <Alert className="border-orange-200 bg-orange-50">
            <AlertTriangle className="h-4 w-4 text-orange-600" />
            <AlertDescription className="text-orange-800">
              <div className="font-medium mb-1">Barrel Filling Confirmation Required</div>
              <div className="text-sm">
                Please confirm that <span className="font-medium">all barrel filling is complete</span> for this production run before marking it as complete.
              </div>
            </AlertDescription>
          </Alert>

          {/* Confirmation message */}
          <div className="text-sm text-gray-600">
            Marking this order as complete will:
            <ul className="list-disc list-inside mt-1 space-y-1">
              <li>Update the order status to &quot;Complete&quot;</li>
              <li>Acknowledge that all barrel filling operations are finished</li>
              <li>Move the order out of the active production queue</li>
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
            {isLoading ? 'Marking Complete...' : 'Mark Complete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
} 