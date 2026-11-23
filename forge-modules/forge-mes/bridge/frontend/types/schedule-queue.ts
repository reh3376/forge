/**
 * ScheduleOrderQueue Types
 *
 * ScheduleOrderQueue manages the production schedule:
 * - Queue ordering and sequencing
 * - Timeline calculation
 * - Queue operations (move up/down, add/remove)
 */

import type { ScheduleOrder } from './schedule-order'

/**
 * Schedule Order Queue Entry
 *
 * Represents a ScheduleOrder's position in the production queue.
 * The queue determines execution order and timeline calculations.
 */
export interface ScheduleOrderQueue {
  // Identity
  id: string

  // Queue position (lower index = earlier in queue)
  queueIndex: number | null

  // The associated ScheduleOrder with full execution details
  scheduleOrder: ScheduleOrder

  // Metadata
  createdAt?: string
  updatedAt?: string
  createdBy?: string | null
  updatedBy?: string | null
}

/**
 * Minimal queue entry for list displays
 */
export interface ScheduleOrderQueueSummary {
  id: string
  queueIndex: number | null
  scheduleOrder: {
    id: string
    name: string
    status: string
    estimatedStart: string
    estimatedEnd: string
  }
}

/**
 * Queue operation result
 */
export interface QueueOperationResult {
  success: boolean
  error?: string
  updatedQueue?: ScheduleOrderQueue[]
}

/**
 * Queue move operation
 */
export interface QueueMoveOperation {
  queueId: string
  currentIndex: number
  newIndex: number
  username: string
}
