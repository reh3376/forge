'use client'

import { Button } from '@/components/ui/button'
import { CalendarIcon } from 'lucide-react'
import { useAddToSchedule } from '@/hooks/useAddToSchedule'

interface ProductionOrder {
  id: string
  name: string | null
  status: 'Complete' | 'Initiated' | 'InProgress' | 'Planned' | 'Committed'
  startDate: string
  endDate: string
  quantity: number
  totalCooks: number | null
  totalFermenters: number | null
  estimatedBarrelsPerFermenter: number | null
  estimatedPGsPerBbl: number | null
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

interface AddToScheduleButtonProps {
  productionOrder: ProductionOrder
  createdBy: string
  onSuccess?: () => void
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'default' | 'sm' | 'lg'
  disabled?: boolean
}

export default function AddToScheduleButton({
  productionOrder,
  createdBy,
  onSuccess,
  variant = 'default',
  size = 'default',
  disabled = false
}: AddToScheduleButtonProps) {
  const { addToSchedule, isLoading } = useAddToSchedule()

  const handleAddToSchedule = async () => {
    // Use production order dates as defaults
    const scheduleData = {
      startDate: productionOrder.startDate,
      endDate: productionOrder.endDate
    }

    const result = await addToSchedule(productionOrder, createdBy, scheduleData)
    
    if (result.success) {
      onSuccess?.()
    }
  }

  return (
    <Button
      onClick={handleAddToSchedule}
      disabled={isLoading || disabled}
      variant={variant}
      size={size}
    >
      {isLoading ? (
        <div className="flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
          Adding...
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-4 w-4" />
          Add to Schedule
        </div>
      )}
    </Button>
  )
} 