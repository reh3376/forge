'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { formatRecipeName } from '@/lib/utils'
import { 
  Clock, 
  Edit, 
  CheckCircle2,
  Play,
  AlertCircle,
  Pause,
  Calendar,
  Package,
  BarChart3,
  MapPin
} from 'lucide-react'

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

interface RunningOrderDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  orderQueue: ScheduleOrderQueue | null
  cellName: string
  onEditRunningRecipe: (orderQueue: ScheduleOrderQueue) => void
  onEditSORecipe?: (orderQueue: ScheduleOrderQueue) => void
}

export function RunningOrderDetailsModal({
  isOpen,
  onClose,
  orderQueue,
  cellName,
  onEditRunningRecipe,
  onEditSORecipe
}: RunningOrderDetailsModalProps) {
  if (!orderQueue) return null

  const { scheduleOrder } = orderQueue

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
        return <CheckCircle2 className="h-4 w-4" />
      case 'InProgress':
        return <Play className="h-4 w-4" />
      case 'Scheduled':
        return <Clock className="h-4 w-4" />
      case 'Created':
        return <AlertCircle className="h-4 w-4" />
      default:
        return <Pause className="h-4 w-4" />
    }
  }

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-3">
            <Package className="h-5 w-5" />
            Running Order Details
          </DialogTitle>
          <DialogDescription>
            Details for the currently running order in {cellName}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6">
          {/* Status and Basic Info */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">
                  {scheduleOrder.name || `Order ${scheduleOrder.id.slice(-8)}`}
                </CardTitle>
                <Badge className={`${getStatusColor(scheduleOrder.status)} flex items-center gap-1`}>
                  {getStatusIcon(scheduleOrder.status)}
                  {scheduleOrder.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
                    <MapPin className="h-4 w-4" />
                    Manufacturing Cell
                  </div>
                  <p className="text-gray-900">{cellName}</p>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
                    <BarChart3 className="h-4 w-4" />
                    Queue Position
                  </div>
                  <p className="text-gray-900">#{orderQueue.queueIndex}</p>
                </div>
              </div>

              {orderQueue.areas.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
                    <MapPin className="h-4 w-4" />
                    Production Areas
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {orderQueue.areas.map(area => (
                      <Badge key={area.id} variant="outline" className="text-xs">
                        {area.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recipe Information */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Recipe Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-600">Recipe Name</div>
                <div className="text-lg font-semibold text-blue-700 bg-blue-50 px-3 py-2 rounded">
                  {formatRecipeName(scheduleOrder.recipeName)}
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {scheduleOrder.totalBarrels && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-gray-600">Total Barrels</div>
                    <p className="text-gray-900 font-medium">{scheduleOrder.totalBarrels.toLocaleString()} bbls</p>
                  </div>
                )}
                
                {scheduleOrder.totalProofGallons && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-gray-600">Total Proof Gallons</div>
                    <p className="text-gray-900 font-medium">{scheduleOrder.totalProofGallons.toLocaleString()} gal</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Schedule Information */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Schedule Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
                    <Calendar className="h-4 w-4" />
                    Estimated Start
                  </div>
                  <p className="text-gray-900">{formatDateTime(scheduleOrder.estimatedStart)}</p>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
                    <Calendar className="h-4 w-4" />
                    Estimated End
                  </div>
                  <p className="text-gray-900">{formatDateTime(scheduleOrder.estimatedEnd)}</p>
                </div>
                
                {scheduleOrder.actualStart && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
                      <Clock className="h-4 w-4" />
                      Actual Start
                    </div>
                    <p className="text-gray-900">{formatDateTime(scheduleOrder.actualStart)}</p>
                  </div>
                )}
                
                {scheduleOrder.actualEnd && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
                      <Clock className="h-4 w-4" />
                      Actual End
                    </div>
                    <p className="text-gray-900">{formatDateTime(scheduleOrder.actualEnd)}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Technical Details */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Technical Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <span className="font-medium text-gray-600">Order ID:</span>
                  <p className="text-gray-900 text-xs font-mono mt-1">{scheduleOrder.id}</p>
                </div>
                <div>
                  <span className="font-medium text-gray-600">Queue ID:</span>
                  <p className="text-gray-900 text-xs font-mono mt-1">{orderQueue.id}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Separator />

        <div className="flex-shrink-0 flex items-center justify-between pt-4">
          <div className="text-sm text-muted-foreground">
            Last updated: {formatDate(scheduleOrder.estimatedStart)}
          </div>

          <div className="flex space-x-3">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            {onEditSORecipe && (
              <Button
                variant="secondary"
                onClick={() => onEditSORecipe(orderQueue)}
                className="flex items-center gap-2"
              >
                <Edit className="h-4 w-4" />
                Edit Recipe (BOM/Params)
              </Button>
            )}
            <Button
              onClick={() => onEditRunningRecipe(orderQueue)}
              className="flex items-center gap-2"
            >
              <Edit className="h-4 w-4" />
              Edit Running Recipe
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
} 