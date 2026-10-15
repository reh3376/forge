/**
 * ScheduleOrder Types
 *
 * ScheduleOrder represents HOW/WHEN to produce:
 * - Production run execution
 * - Cook and fermenter tracking
 * - Production timing and phases
 * - Resource allocation
 * - Yield estimates
 *
 * ScheduleOrders group multiple ProductionOrders with the same mash bill
 * into a single production run for execution efficiency.
 */

import type { Customer, Recipe, RecipeGroup, ScheduleOrderStatus, DurationUnits } from './common'
import type { ProductionOrder } from './production-order'

/**
 * Production phase timing information
 */
export interface PhaseTiming {
  estimatedDuration: number | null
  estimatedStartTime: string | null
}

/**
 * Production Order Allocation
 *
 * Maps how a production run's output will be allocated to each ProductionOrder
 */
export interface ProductionOrderAllocation {
  productionOrderId: string
  productionOrderName: string | null
  allocatedBarrels: number
  allocatedProofGallons: number
  allocatedCooks?: number
  allocatedFermenters?: number
}

/**
 * Production Order Allocation Map
 *
 * Contains the complete allocation breakdown for a ScheduleOrder
 */
export interface ProductionOrderAllocationMap {
  totalCooks: number
  totalFermenters: number
  totalExpectedPG: number
  totalExpectedBarrels: number
  allocations: ProductionOrderAllocation[]
}

/**
 * Schedule Order - Production Run Execution
 *
 * Represents an actual production run that executes the distillation process.
 * Groups multiple ProductionOrders with the same mash bill for efficient production.
 *
 * Key Concept: This is the EXECUTION, not the specification.
 * ScheduleOrders track cooks, fermenters, timing, and resource allocation.
 */
export interface ScheduleOrder {
  // Identity
  id: string
  name: string
  recipeName: string
  globalId?: string | null

  // Recipe/Grouping
  recipeGroup?: RecipeGroup | null
  scheduleOrderRecipe?: Recipe | null

  // Customer relationships (many-to-many through ProductionOrders)
  customers?: Customer[]

  // Execution Tracking - THE MOVED FIELDS
  totalCooks: number | null
  totalFermenters: number | null
  plannedCooks?: number | null
  plannedFermenters?: number | null
  executedCooks?: number | null
  executedFermenters?: number | null
  completedCooks?: number | null
  completedFermenters?: number | null

  // Production Estimates & Metrics
  estimatedBarrelsPerFermenter?: number | null
  estimatedPGsPerBbl?: number | null
  estimatedPGsPerBushel?: number | null
  totalGrainWeight?: number | null
  totalBarrels?: number | null
  totalProofGallons?: number | null

  // Overall Timing
  estimatedStart: string
  estimatedEnd: string
  actualStart?: string | null
  actualEnd?: string | null
  duration?: number | null
  durationUnits?: DurationUnits | null

  // Phase Timing Details
  estimatedMashingDuration?: number | null
  estimatedMashingStartTime?: string | null
  estimatedFermentationDuration?: number | null
  estimatedFermentationStartTime?: string | null
  estimatedDistillationDuration?: number | null
  estimatedDistillationStartTime?: string | null
  estimatedBarrelingStartTime?: string | null
  estimatedProcessingStartTime?: string | null
  estimatedTotalProductionDuration?: number | null

  // Status & Relationships
  status: ScheduleOrderStatus
  productionOrders: ProductionOrder[]
  productionOrderAllocation?: ProductionOrderAllocationMap | null

  // Queue position (if in queue)
  scheduleOrderQueues?: Array<{
    id: string
    queueIndex: number | null
  }>

  // Metadata
  createdAt?: string
  updatedAt?: string
  createdBy?: string | null
  updatedBy?: string | null
}

/**
 * Minimal ScheduleOrder for display in queue/cards
 */
export interface ScheduleOrderSummary {
  id: string
  name: string
  recipeName: string
  status: ScheduleOrderStatus
  estimatedStart: string
  estimatedEnd: string
  totalCooks: number | null
  totalFermenters: number | null
  totalBarrels: number | null
  totalProofGallons: number | null
}

/**
 * Input for creating a new ScheduleOrder
 */
export interface CreateScheduleOrderInput {
  name: string
  recipeName: string
  estimatedStart: string
  estimatedEnd: string
  status?: ScheduleOrderStatus
  recipeGroupId?: string
  scheduleOrderRecipeId?: string
  createdBy?: string
}

/**
 * Input for creating a ScheduleOrder from ProductionOrders
 */
export interface CreateScheduleOrderFromProductionOrdersInput {
  productionOrderIds: string[]
  data: CreateScheduleOrderInput
}

/**
 * Input for updating a ScheduleOrder
 */
export interface UpdateScheduleOrderInput {
  name?: string
  recipeName?: string
  status?: ScheduleOrderStatus
  estimatedStart?: string
  estimatedEnd?: string
  actualStart?: string
  actualEnd?: string
  totalCooks?: number
  totalFermenters?: number
  completedCooks?: number
  completedFermenters?: number
  executedCooks?: number
  executedFermenters?: number
  estimatedBarrelsPerFermenter?: number
  estimatedPGsPerBbl?: number
  estimatedPGsPerBushel?: number
  totalGrainWeight?: number
}
