// Schedule Order Queue API Client
// Based on OpenAPI spec from backend

import { getAuthHeaders } from '../auth-utils'

// Use the REST proxy instead of direct backend calls
const API_BASE = '/api/rest'

export interface ScheduleOrderQueueCreateInput {
  areas?: Record<string, unknown> // AssetCreateNestedManyWithoutScheduleOrderQueuesInput
  createdBy: string
  globalId?: string
  queueIndex?: number
  scheduleOrder: {
    id: string
  }
  schemaVersion?: string
  updatedBy?: string
}

export interface ScheduleOrderQueueUpdateInput {
  areas?: Record<string, unknown>
  createdBy?: string
  globalId?: string
  queueIndex?: number
  newIndex?: number  // Field expected by backend for queue index updates
  scheduleOrder?: {
    id: string
  }
  schemaVersion?: string
  updatedBy?: string
}

export interface ScheduleOrderQueue {
  id: string
  queueIndex: number | null
  createdBy: string
  updatedBy: string
  globalId: string
  schemaVersion: string
  scheduleOrder: {
    id: string
    name: string
    status: string
    estimatedStart: string
    estimatedEnd: string
    actualStart: string | null
    actualEnd: string | null
    totalBarrels: number | null
    totalProofGallons: number | null
  }
}

export interface ApiResponse<T> {
  data?: T
  error?: string
  message?: string
}

class ScheduleOrderQueueAPI {
  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      // Get authentication headers
      const authHeaders = await getAuthHeaders()
      
      console.log('🔐 ScheduleOrderQueueAPI: Making request via REST proxy to:', `${API_BASE}${endpoint}`)
      console.log('🔐 Auth headers:', Object.keys(authHeaders))
      
      const response = await fetch(`${API_BASE}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
          ...options.headers,
        },
        ...options,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error('🔥 ScheduleOrderQueueAPI: Request failed:', {
          status: response.status,
          statusText: response.statusText,
          errorData,
          endpoint: `${API_BASE}${endpoint}`
        })
        return {
          error: errorData.message || `HTTP ${response.status}: ${response.statusText}`,
        }
      }

      const data = await response.json()
      console.log('✅ ScheduleOrderQueueAPI: Request successful')
      return { data }
    } catch (error) {
      console.error('🔥 ScheduleOrderQueueAPI: Request error:', error)
      return {
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }
    }
  }

  /**
   * Add a schedule order to the pending queue
   */
  async addToPendingQueue(input: ScheduleOrderQueueCreateInput): Promise<ApiResponse<ScheduleOrderQueue>> {
    return this.makeRequest<ScheduleOrderQueue>('/scheduleOrderQueues/add-to-pending-schedule-order-queue', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  }

  /**
   * Update the queue index (position) of a schedule order queue item
   * This is used for moving items up/down in the queue
   */
  async updateQueueIndex(
    id: string,
    input: ScheduleOrderQueueUpdateInput
  ): Promise<ApiResponse<ScheduleOrderQueue>> {
    return this.makeRequest<ScheduleOrderQueue>(`/scheduleOrderQueues/update-schedule-order-queue-index/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  }

  /**
   * Deactivate (remove) a schedule order queue item
   */
  async deactivateQueueItem(
    id: string,
    input: ScheduleOrderQueueUpdateInput
  ): Promise<ApiResponse<ScheduleOrderQueue>> {
    return this.makeRequest<ScheduleOrderQueue>(`/scheduleOrderQueues/deactivate-schedule-order-queue/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  }

  /**
   * Move a queue item up (decrease queue index)
   */
  async moveUp(
    id: string,
    currentIndex: number,
    updatedBy: string
  ): Promise<ApiResponse<ScheduleOrderQueue>> {
    if (currentIndex <= 0) {
      return { error: 'Cannot move item up - already at the top' }
    }

    return this.updateQueueIndex(id, {
      newIndex: currentIndex - 1,
      updatedBy,
    })
  }

  /**
   * Move a queue item down (increase queue index)
   */
  async moveDown(
    id: string,
    currentIndex: number,
    maxIndex: number,
    updatedBy: string
  ): Promise<ApiResponse<ScheduleOrderQueue>> {
    if (currentIndex >= maxIndex) {
      return { error: 'Cannot move item down - already at the bottom' }
    }

    return this.updateQueueIndex(id, {
      newIndex: currentIndex + 1,
      updatedBy,
    })
  }

  /**
   * Schedule a production order by adding it to the queue
   */
  async scheduleProductionOrder(
    scheduleOrderId: string,
    createdBy: string,
    queueIndex?: number
  ): Promise<ApiResponse<ScheduleOrderQueue>> {
    const input: ScheduleOrderQueueCreateInput = {
      scheduleOrder: { id: scheduleOrderId },
      createdBy,
      updatedBy: createdBy,
    }
    
    if (queueIndex !== undefined) {
      input.queueIndex = queueIndex
    }
    
    return this.addToPendingQueue(input)
  }

  /**
   * Remove a schedule order from the queue (deschedule)
   */
  async descheduleOrder(
    queueItemId: string,
    updatedBy: string
  ): Promise<ApiResponse<ScheduleOrderQueue>> {
    return this.deactivateQueueItem(queueItemId, {
      updatedBy,
    })
  }

  /**
   * Delete a schedule order from the queue and permanently remove it
   * - Validates queue index > 0 (prevents deletion of currently running order)
   * - Unlinks ProductionOrders and marks them available for rescheduling
   * - Deletes ScheduleOrderRecipeInstance if exists
   * - Resequences queue indices automatically
   */
  async deleteScheduleOrder(
    scheduleOrderId: string,
    userId: string
  ): Promise<ApiResponse<any>> {
    return this.makeRequest<any>(`/scheduleOrderQueues/deschedule-schedule-order/${scheduleOrderId}`, {
      method: 'DELETE',
      body: JSON.stringify({ userId }),
    })
  }

  /**
   * Start an order at index=1 by creating a production order recipe instance
   * and updating the schedule order status to InProgress
   */
  async startOrder(
    queueItemId: string,
    updatedBy: string
  ): Promise<ApiResponse<ScheduleOrderQueue>> {
    return this.makeRequest<ScheduleOrderQueue>(`/scheduleOrderQueues/start-order/${queueItemId}`, {
      method: 'POST',
      body: JSON.stringify({
        updatedBy,
      }),
    })
  }
}

// Export singleton instance
export const scheduleOrderQueueAPI = new ScheduleOrderQueueAPI()

// Export utility functions for common operations
export const scheduleOrderQueueUtils = {
  /**
   * Calculate the new queue indices when moving an item
   */
  calculateNewIndices(
    items: Array<{ id: string; queueIndex: number | null }>,
    fromIndex: number,
    toIndex: number
  ): Array<{ id: string; newIndex: number }> {
    const updates: Array<{ id: string; newIndex: number }> = []
    
    if (fromIndex === toIndex) return updates

    // Sort items by current queue index
    const sortedItems = [...items].sort((a, b) => (a.queueIndex || 0) - (b.queueIndex || 0))
    
    if (fromIndex < toIndex) {
      // Moving down: shift items up
      for (let i = fromIndex + 1; i <= toIndex; i++) {
        const item = sortedItems[i]
        if (item) {
          updates.push({
            id: item.id,
            newIndex: i - 1,
          })
        }
      }
    } else {
      // Moving up: shift items down
      for (let i = toIndex; i < fromIndex; i++) {
        const item = sortedItems[i]
        if (item) {
          updates.push({
            id: item.id,
            newIndex: i + 1,
          })
        }
      }
    }

    // Add the moved item
    const movedItem = sortedItems[fromIndex]
    if (movedItem) {
      updates.push({
        id: movedItem.id,
        newIndex: toIndex,
      })
    }

    return updates
  },

  /**
   * Get the next available queue index
   */
  getNextQueueIndex(items: Array<{ queueIndex: number | null }>): number {
    const maxIndex = Math.max(...items.map(item => item.queueIndex || 0), -1)
    return maxIndex + 1
  },

  /**
   * Validate queue indices and fix any gaps or duplicates
   */
  validateAndFixIndices(
    items: Array<{ id: string; queueIndex: number | null }>
  ): Array<{ id: string; newIndex: number }> {
    const updates: Array<{ id: string; newIndex: number }> = []
    
    // Sort by current index, handling nulls
    const sortedItems = [...items].sort((a, b) => {
      const aIndex = a.queueIndex ?? Number.MAX_SAFE_INTEGER
      const bIndex = b.queueIndex ?? Number.MAX_SAFE_INTEGER
      return aIndex - bIndex
    })

    // Reassign indices sequentially
    sortedItems.forEach((item, index) => {
      if (item.queueIndex !== index) {
        updates.push({
          id: item.id,
          newIndex: index,
        })
      }
    })

    return updates
  },
} 