import { useState } from 'react'
import { toast } from 'sonner'

// Types for the production order and schedule creation
interface ProductionOrder {
  id: string
  name: string | null
  status: 'Complete' | 'Initiated' | 'InProgress' | 'Planned' | 'Committed'
  startDate: string
  endDate: string
  quantity: number
  // Note: Execution tracking fields (totalCooks, totalFermenters, etc.) moved to ScheduleOrder
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

interface ScheduleOrderCreateData {
  startDate: string
  endDate: string
}

interface AddToScheduleResult {
  success: boolean
  scheduleOrder?: {
    id: string
    name: string
    status: string
    estimatedStart?: string
    estimatedEnd?: string
    totalBarrels?: number
    totalProofGallons?: number
    recipeName: string
    productionOrders?: Array<{
      id: string
      name: string
    }>
    scheduleOrderQueue?: {
      id: string
      queueIndex: number
    }
  }
  error?: string
}

export const useAddToSchedule = () => {
  const [isLoading, setIsLoading] = useState(false)

  const addToSchedule = async (
    productionOrder: ProductionOrder,
    createdBy: string,
    scheduleData: ScheduleOrderCreateData
  ): Promise<AddToScheduleResult> => {
    setIsLoading(true)
    
    try {
      // Prepare the input for createAndQueueScheduleOrder mutation
      const createAndQueueInput = {
        productionOrderId: productionOrder.id,
        createdBy,
        startDate: scheduleData.startDate,
        endDate: scheduleData.endDate
      }

      // Remove undefined values to keep the input clean
      const cleanInput = Object.fromEntries(
        Object.entries(createAndQueueInput).filter(([, value]) => value !== undefined)
      )

      const query = `
        mutation CreateAndQueueScheduleOrder($data: CreateAndQueueScheduleOrderInput!) {
          createAndQueueScheduleOrder(data: $data) {
            id
            queueIndex
            scheduleOrder {
              id
              name
              recipeName
              status
              estimatedStart
              estimatedEnd
              totalBarrels
              totalProofGallons
              productionOrders {
                id
                name
              }
            }
          }
        }
      `

      const variables = {
        data: cleanInput
      }

      // Debug logging
      console.log('Original scheduleData:', scheduleData)
      console.log('Start Date ISO check:', scheduleData.startDate, 'Valid:', !isNaN(Date.parse(scheduleData.startDate)))
      console.log('End Date ISO check:', scheduleData.endDate, 'Valid:', !isNaN(Date.parse(scheduleData.endDate)))
      console.log('GraphQL Query:', query)
      console.log('GraphQL Variables:', JSON.stringify(variables, null, 2))
      console.log('Clean Input:', cleanInput)

      // Call the GraphQL mutation
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          variables
        })
      })

      const result = await response.json()

      if (result.errors) {
        console.error('GraphQL errors:', result.errors)
        toast.error(`Failed to add to schedule: ${result.errors[0]?.message || 'Unknown error'}`)
        return {
          success: false,
          error: result.errors[0]?.message || 'Unknown error'
        }
      }

      if (result.data?.createAndQueueScheduleOrder) {
        const queueResult = result.data.createAndQueueScheduleOrder
        const scheduleOrder = queueResult.scheduleOrder
        toast.success(`Successfully added "${productionOrder.name || productionOrder.id}" to schedule queue at position ${queueResult.queueIndex || 'unknown'}`)
        
        return {
          success: true,
          scheduleOrder: {
            ...scheduleOrder,
            scheduleOrderQueue: {
              id: queueResult.id,
              queueIndex: queueResult.queueIndex
            }
          }
        }
      } else {
        toast.error('Failed to create schedule order')
        return {
          success: false,
          error: 'No data returned from mutation'
        }
      }

    } catch (error) {
      console.error('Error adding to schedule:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      toast.error(`Failed to add to schedule: ${errorMessage}`)
      
      return {
        success: false,
        error: errorMessage
      }
    } finally {
      setIsLoading(false)
    }
  }

  return {
    addToSchedule,
    isLoading
  }
} 