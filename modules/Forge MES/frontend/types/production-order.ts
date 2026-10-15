/**
 * ProductionOrder Types
 *
 * ProductionOrder represents WHAT to produce:
 * - Barrel/customer specifications
 * - Recipe selection
 * - Quantity and proof requirements
 * - Container type
 * - Quality control limits
 *
 * ProductionOrders do NOT contain execution tracking (cooks, fermenters, timing).
 * Execution tracking belongs to ScheduleOrder.
 */

import type { Customer, Recipe, ProductionOrderStatus, ContainerType } from './common'

/**
 * Production Order - Barrel/Customer Specification
 *
 * Represents a request to produce a specific quantity of whiskey
 * for a customer according to recipe specifications.
 *
 * Key Concept: This is the SPECIFICATION, not the execution.
 * Multiple ProductionOrders with the same mash bill can be grouped
 * into a single ScheduleOrder for production.
 */
export interface ProductionOrder {
  // Identity
  id: string
  name: string | null
  globalId?: string | null

  // Specification - WHAT to produce
  customer: Customer
  recipe: Recipe
  quantity: number
  finalProof: number | null
  containerType: ContainerType | null

  // Quality Control
  upperControlLimit?: number | null
  lowerControlLimit?: number | null

  // Status & Scheduling
  status: ProductionOrderStatus
  startDate: string
  endDate: string
  completedQuantity?: number | null

  // Relationship to ScheduleOrder
  scheduleOrderId?: string | null
  scheduleOrder?: {
    id: string
    status: string
    totalCooks: number | null
    totalFermenters: number | null
    estimatedBarrelsPerFermenter: number | null
    estimatedPGsPerBbl: number | null
    estimatedPGsPerBushel: number | null
    totalGrainWeight: number | null
  } | null

  // Metadata
  createdAt?: string
  updatedAt?: string
  createdBy?: string | null
  updatedBy?: string | null
}

/**
 * Minimal ProductionOrder for display in lists/cards
 */
export interface ProductionOrderSummary {
  id: string
  name: string | null
  status: ProductionOrderStatus
  quantity: number
  finalProof: number | null
  containerType: ContainerType | null
  customer: Customer
  recipe: Pick<Recipe, 'id' | 'Recipe' | 'whiskeyType'>
}

/**
 * ProductionOrder with extended recipe details
 * Used in grouping/scheduling contexts
 */
export interface ProductionOrderWithRecipeGroup extends ProductionOrder {
  recipe: Recipe & {
    recipeGroup?: {
      id: string
      recipe: string
    }
  }
}

/**
 * Input for creating a new ProductionOrder
 */
export interface CreateProductionOrderInput {
  name?: string
  customerCode: string
  recipeId: string
  quantity: number
  finalProof: number
  containerType: string
  startDate: string
  endDate: string
  upperControlLimit?: number
  lowerControlLimit?: number
  notes?: string
  priority?: number
}

/**
 * Input for updating a ProductionOrder
 */
export interface UpdateProductionOrderInput {
  name?: string
  quantity?: number
  finalProof?: number
  containerType?: string
  startDate?: string
  endDate?: string
  upperControlLimit?: number
  lowerControlLimit?: number
  status?: ProductionOrderStatus
  completedQuantity?: number
}
