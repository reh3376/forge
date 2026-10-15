/**
 * Aggregate Calculator Utilities
 *
 * Calculates production run aggregates from ProductionOrders
 * - Total barrels and proof gallons
 * - Estimated cooks and fermenters
 * - Grain requirements
 */

import type { ProductionOrderWithRecipeGroup } from '@/types'

/**
 * Production run aggregate calculations
 */
export interface ProductionAggregates {
  totalBarrels: number
  totalProofGallons: number
  estimatedCooks: number
  estimatedFermenters: number
  estimatedGrainWeight: number
  averageProof: number
  uniqueCustomers: number
  mashBill: string
}

/**
 * Yield metrics from backend (via ProductionMetric / YieldEstimation service)
 * When provided, these replace the hardcoded defaults.
 */
export interface YieldMetrics {
  pgPerBarrel?: number          // Proof gallons per barrel
  barrelsPerFermenter?: number  // Barrels per fermenter
  cooksPerFermenter?: number    // Cooks per fermenter
  yieldRate?: number            // PG per grain unit (bushel)
  grainPerCook?: number         // Grain weight per cook (lbs)
  lbsPerBushel?: number         // Lbs per bushel (constant)
  avgBarrelFill?: number        // Avg barrel fill (gallons)
}

/**
 * Default production assumptions (from ops spreadsheet)
 * These are used as fallbacks when backend metrics are not available.
 */
const DEFAULT_METRICS: Required<YieldMetrics> = {
  pgPerBarrel: 66.34,           // (125/100) * 53.07
  barrelsPerFermenter: 100,     // ~100.7 from spreadsheet
  cooksPerFermenter: 3,         // 3 cooks per fermenter
  yieldRate: 5.2,               // 5.2 PG/GU for bourbon
  grainPerCook: 23000,          // 23,000 lbs per cook
  lbsPerBushel: 56,             // Standard bushel weight
  avgBarrelFill: 53.07,         // Standard 53-gallon barrel avg fill
}

function resolveMetrics(overrides?: YieldMetrics): Required<YieldMetrics> {
  return { ...DEFAULT_METRICS, ...overrides }
}

/**
 * Calculate total proof gallons from barrels and proof
 */
export function calculateProofGallons(
  barrels: number,
  proof: number,
  metrics?: YieldMetrics,
): number {
  const m = resolveMetrics(metrics)
  return barrels * m.pgPerBarrel * (proof / 100) / (125 / 100)
  // Simplified: barrels * (proof / 100) * avgBarrelFill
}

/**
 * Calculate estimated fermenters needed
 */
export function calculateEstimatedFermenters(
  totalBarrels: number,
  barrelsPerFermenter?: number,
  metrics?: YieldMetrics,
): number {
  const bpf = barrelsPerFermenter || resolveMetrics(metrics).barrelsPerFermenter
  return Math.ceil(totalBarrels / bpf)
}

/**
 * Calculate estimated cooks needed
 */
export function calculateEstimatedCooks(
  estimatedFermenters: number,
  cooksPerFermenter?: number,
  metrics?: YieldMetrics,
): number {
  const cpf = cooksPerFermenter || resolveMetrics(metrics).cooksPerFermenter
  return Math.ceil(estimatedFermenters * cpf)
}

/**
 * Calculate estimated grain weight
 */
export function calculateEstimatedGrainWeight(
  estimatedCooks: number,
  bushelsPerCook?: number,
  metrics?: YieldMetrics,
): number {
  const m = resolveMetrics(metrics)
  // If bushelsPerCook provided, use it; otherwise derive from grainPerCook
  const bpc = bushelsPerCook || (m.grainPerCook / m.lbsPerBushel)
  return estimatedCooks * bpc * m.lbsPerBushel
}

/**
 * Calculate all aggregates for a group of ProductionOrders
 */
export function calculateProductionAggregates(
  orders: ProductionOrderWithRecipeGroup[],
  metrics?: YieldMetrics,
): ProductionAggregates | null {
  if (orders.length === 0) {
    return null
  }

  const m = resolveMetrics(metrics)

  // Calculate totals
  const totalBarrels = orders.reduce((sum, o) => sum + o.quantity, 0)

  // Calculate weighted average proof
  let totalProofBarrels = 0
  let totalProofGallons = 0

  for (const order of orders) {
    const proof = order.finalProof || 125 // Default to 125 if not specified
    totalProofBarrels += order.quantity * proof
    // PG = barrels * (proof/100) * avgBarrelFill
    totalProofGallons += order.quantity * (proof / 100) * m.avgBarrelFill
  }

  const averageProof = totalBarrels > 0 ? totalProofBarrels / totalBarrels : 125

  // Get unique customers
  const uniqueCustomers = new Set(
    orders.map(o => o.customer.customerCode || o.customer.name || o.customer.id)
  ).size

  // Get mash bill
  const mashBill = orders[0].recipe.recipeGroup?.recipe || orders[0].recipe.Recipe

  // Calculate production requirements
  const estimatedFermenters = calculateEstimatedFermenters(totalBarrels, undefined, metrics)
  const estimatedCooks = calculateEstimatedCooks(estimatedFermenters, undefined, metrics)
  const estimatedGrainWeight = calculateEstimatedGrainWeight(estimatedCooks, undefined, metrics)

  return {
    totalBarrels,
    totalProofGallons: Math.round(totalProofGallons),
    estimatedCooks,
    estimatedFermenters,
    estimatedGrainWeight: Math.round(estimatedGrainWeight),
    averageProof: Math.round(averageProof * 10) / 10, // Round to 1 decimal
    uniqueCustomers,
    mashBill
  }
}

/**
 * Format aggregates for display
 */
export function formatAggregates(aggregates: ProductionAggregates): {
  label: string
  value: string | number
}[] {
  return [
    {
      label: 'Total Barrels',
      value: aggregates.totalBarrels
    },
    {
      label: 'Total Proof Gallons',
      value: `~${aggregates.totalProofGallons.toLocaleString()} PG`
    },
    {
      label: 'Average Proof',
      value: `${aggregates.averageProof}°`
    },
    {
      label: 'Estimated Cooks',
      value: aggregates.estimatedCooks
    },
    {
      label: 'Estimated Fermenters',
      value: aggregates.estimatedFermenters
    },
    {
      label: 'Estimated Grain',
      value: `${(aggregates.estimatedGrainWeight / 1000).toFixed(1)}k lbs`
    },
    {
      label: 'Customers',
      value: aggregates.uniqueCustomers
    }
  ]
}
