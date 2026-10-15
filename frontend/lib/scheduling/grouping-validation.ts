/**
 * Grouping Validation Utilities
 *
 * Validates that ProductionOrders can be grouped together into a ScheduleOrder
 * Key rule: All orders must have the same mash bill (recipe group)
 */

import type { ProductionOrderWithRecipeGroup } from '@/types'

/**
 * Get the mash bill identifier for a ProductionOrder
 * Uses recipeGroup.recipe if available, otherwise falls back to Recipe name
 */
export function getMashBill(order: ProductionOrderWithRecipeGroup): string {
  return order.recipe.recipeGroup?.recipe || order.recipe.Recipe
}

/**
 * Validation result for grouping orders
 */
export interface GroupingValidationResult {
  valid: boolean
  mashBill?: string
  errors: string[]
  warnings: string[]
}

/**
 * Validate that all selected orders have the same mash bill
 */
export function validateOrderGrouping(
  orders: ProductionOrderWithRecipeGroup[]
): GroupingValidationResult {
  const result: GroupingValidationResult = {
    valid: true,
    errors: [],
    warnings: []
  }

  if (orders.length === 0) {
    result.valid = false
    result.errors.push('No orders selected')
    return result
  }

  // Get unique mash bills from selected orders
  const mashBills = new Set(orders.map(getMashBill))

  if (mashBills.size > 1) {
    result.valid = false
    result.errors.push(
      `Selected orders have different mash bills: ${Array.from(mashBills).join(', ')}. ` +
      'All orders in a production run must use the same mash bill.'
    )
    return result
  }

  // Set the validated mash bill
  result.mashBill = Array.from(mashBills)[0]

  // Check if all orders have the same customer (warning only)
  const customers = new Set(
    orders.map(o => o.customer.customerCode || o.customer.name || o.customer.id)
  )

  if (customers.size > 1) {
    result.warnings.push(
      `Selected orders are for ${customers.size} different customers. ` +
      'This is allowed but ensure proper allocation tracking.'
    )
  }

  return result
}

/**
 * Check if a ProductionOrder is compatible with a group of already-selected orders
 */
export function isOrderCompatible(
  order: ProductionOrderWithRecipeGroup,
  selectedOrders: ProductionOrderWithRecipeGroup[]
): boolean {
  if (selectedOrders.length === 0) {
    return true // First selection is always compatible
  }

  const selectedMashBill = getMashBill(selectedOrders[0])
  const orderMashBill = getMashBill(order)

  return selectedMashBill === orderMashBill
}

/**
 * Filter orders to only show compatible ones
 */
export function filterCompatibleOrders(
  allOrders: ProductionOrderWithRecipeGroup[],
  selectedOrders: ProductionOrderWithRecipeGroup[]
): {
  compatible: ProductionOrderWithRecipeGroup[]
  incompatible: ProductionOrderWithRecipeGroup[]
} {
  if (selectedOrders.length === 0) {
    return {
      compatible: allOrders,
      incompatible: []
    }
  }

  const selectedMashBill = getMashBill(selectedOrders[0])

  const compatible: ProductionOrderWithRecipeGroup[] = []
  const incompatible: ProductionOrderWithRecipeGroup[] = []

  for (const order of allOrders) {
    if (getMashBill(order) === selectedMashBill) {
      compatible.push(order)
    } else {
      incompatible.push(order)
    }
  }

  return { compatible, incompatible }
}

/**
 * Generate suggestion text for grouping
 */
export function generateGroupingSuggestion(
  selectedOrders: ProductionOrderWithRecipeGroup[]
): string | null {
  if (selectedOrders.length === 0) {
    return null
  }

  const validation = validateOrderGrouping(selectedOrders)

  if (!validation.valid) {
    return null
  }

  const orderCount = selectedOrders.length
  const totalBarrels = selectedOrders.reduce((sum, o) => sum + o.quantity, 0)
  const customers = new Set(
    selectedOrders.map(o => o.customer.name || o.customer.customerCode)
  ).size

  if (orderCount === 1) {
    return `1 order selected (${totalBarrels} barrels)`
  }

  return `${orderCount} orders can be grouped together (${totalBarrels} total barrels, ${customers} customer${customers > 1 ? 's' : ''})`
}
