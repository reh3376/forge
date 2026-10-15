/**
 * Common Types
 *
 * Shared types used across ProductionOrder and ScheduleOrder entities
 */

/**
 * Production order status
 * Represents the lifecycle state of a barrel/customer specification
 */
export type ProductionOrderStatus =
  | 'Planned'      // Created but not committed
  | 'Committed'    // Committed but not scheduled
  | 'Initiated'    // Added to schedule, not started
  | 'InProgress'   // Production in progress
  | 'Complete'     // Production complete
  | 'Cancelled'    // Cancelled by user

/**
 * Schedule order status
 * Represents the lifecycle state of a production run
 */
export type ScheduleOrderStatus =
  | 'Created'      // Created, not yet scheduled
  | 'Scheduled'    // Added to queue, waiting to start
  | 'InProgress'   // Production in progress
  | 'Complete'     // Production complete

/**
 * Container type for finished goods
 */
export type ContainerType = string // e.g., "Barrel", "Tote", "Tank"

/**
 * Duration units for production phases
 */
export type DurationUnits = 'hours' | 'days' | 'minutes'

/**
 * Customer information
 */
export interface Customer {
  id: string
  name?: string | null
  customerCode?: string | null
}

/**
 * Recipe information
 */
export interface Recipe {
  id: string
  Recipe: string
  whiskeyType: string
  customerCode?: string | null
}

/**
 * Recipe Group (mash bill grouping)
 */
export interface RecipeGroup {
  id: string
  recipe: string
  revision?: string | null
}
