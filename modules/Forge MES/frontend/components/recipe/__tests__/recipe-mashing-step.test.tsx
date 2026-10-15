/**
 * @jest-environment jsdom
 */

import { MashingStep } from '@/components/ui/recipe-components'

// Mock the validation function logic
const validateMashingStepBOMItems = (
  mashingSteps: MashingStep[],
  bomIngredients: Array<{ id: string; itemCode: string; name: string }>
): string[] => {
  const errors: string[] = []
  
  if (bomIngredients.length === 0) {
    return []
  }
  
  // Create a map of available BOM items by item ID and item code for quick lookup
  const bomItemMap = new Map<string, { id: string; itemCode: string; name: string }>()
  const bomItemCodeMap = new Map<string, { id: string; itemCode: string; name: string }>()
  
  bomIngredients.forEach(ingredient => {
    bomItemMap.set(ingredient.id, ingredient)
    bomItemCodeMap.set(ingredient.itemCode, ingredient)
  })
  
  // Helper function to determine if a step type requires a recipeBom item
  const requiresRecipeBomItem = (stepType: string): boolean => {
    return ['Corn', 'Wheat', 'Rye', 'Malt', 'AdditiveAdd', 'LiquidAdd'].includes(stepType)
  }
  
  // Check each mashing step for BOM item references
  mashingSteps.forEach((step, stepIndex) => {
    // Check if step type requires a recipeBom item but doesn't have one
    if (requiresRecipeBomItem(step.stepType)) {
      if (!step.recipeBomItems || step.recipeBomItems.length === 0) {
        const stepTypeLabel = step.stepType === 'LiquidAdd' ? 'water/liquid' : 
                             step.stepType === 'AdditiveAdd' ? 'additive' : 'grain'
        errors.push(
          `Step ${stepIndex + 1}: ${step.stepType} step requires a linked BOM item. Please select a ${stepTypeLabel} ingredient for this step.`
        )
      } else {
        // If it has recipeBomItems, validate they exist in the recipe BOM
        step.recipeBomItems.forEach((bomItem) => {
          const itemId = bomItem.item.id
          const itemNumber = bomItem.item.itemNumber
          
          // Check if the BOM item exists in the recipe's BOM configuration
          const existsById = bomItemMap.has(itemId)
          const existsByCode = itemNumber && bomItemCodeMap.has(itemNumber)
          
          if (!existsById && !existsByCode) {
            errors.push(
              `Step ${stepIndex + 1}: BOM item "${bomItem.item.itemName}" (${itemNumber || itemId}) is not configured in the recipe's Bill of Materials. Please add this item to the BOM or remove it from the mashing step.`
            )
          }
        })
      }
    } else if (step.recipeBomItems && step.recipeBomItems.length > 0) {
      // For steps that don't require BOM items, still validate any existing ones
      step.recipeBomItems.forEach((bomItem) => {
        const itemId = bomItem.item.id
        const itemNumber = bomItem.item.itemNumber
        
        // Check if the BOM item exists in the recipe's BOM configuration
        const existsById = bomItemMap.has(itemId)
        const existsByCode = itemNumber && bomItemCodeMap.has(itemNumber)
        
        if (!existsById && !existsByCode) {
          errors.push(
            `Step ${stepIndex + 1}: BOM item "${bomItem.item.itemName}" (${itemNumber || itemId}) is not configured in the recipe's Bill of Materials. Please add this item to the BOM or remove it from the mashing step.`
          )
        }
      })
    }
  })
  
  return errors
}

describe('Mashing Protocol Validation Logic', () => {
  const mockBOMIngredients = [
    {
      id: 'ing_corn_001',
      itemCode: 'CORN-001',
      name: 'Corn'
    },
    {
      id: 'ing_water_001',
      itemCode: 'WATER-001',
      name: 'Process Water'
    },
    {
      id: 'ing_enzyme_001',
      itemCode: 'ENZ-001',
      name: 'Alpha Amylase'
    }
  ]

  it('should require recipeBom items for grain steps', () => {
    const mashingSteps: MashingStep[] = [
      {
        id: '1',
        index: 1,
        stepType: 'Corn',
        included: true,
        notes: 'Add corn without BOM item',
        recipeBomItems: [] // Missing BOM item
      }
    ]

    const errors = validateMashingStepBOMItems(mashingSteps, mockBOMIngredients)
    
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('Corn step requires a linked BOM item')
    expect(errors[0]).toContain('grain ingredient')
  })

  it('should require recipeBom items for liquid steps', () => {
    const mashingSteps: MashingStep[] = [
      {
        id: '1',
        index: 1,
        stepType: 'LiquidAdd',
        included: true,
        notes: 'Add water without BOM item',
        recipeBomItems: [] // Missing BOM item
      }
    ]

    const errors = validateMashingStepBOMItems(mashingSteps, mockBOMIngredients)
    
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('LiquidAdd step requires a linked BOM item')
    expect(errors[0]).toContain('water/liquid ingredient')
  })

  it('should require recipeBom items for additive steps', () => {
    const mashingSteps: MashingStep[] = [
      {
        id: '1',
        index: 1,
        stepType: 'AdditiveAdd',
        included: true,
        notes: 'Add enzyme without BOM item',
        recipeBomItems: [] // Missing BOM item
      }
    ]

    const errors = validateMashingStepBOMItems(mashingSteps, mockBOMIngredients)
    
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('AdditiveAdd step requires a linked BOM item')
    expect(errors[0]).toContain('additive ingredient')
  })

  it('should validate that recipeBom items exist in recipe BOM', () => {
    const mashingSteps: MashingStep[] = [
      {
        id: '1',
        index: 1,
        stepType: 'Corn',
        included: true,
        notes: 'Add corn with invalid BOM item',
        recipeBomItems: [
          {
            id: 'bom1',
            item: {
              id: 'invalid_item',
              itemName: 'Invalid Corn',
              itemNumber: 'INVALID-001',
              itemType: 'Grain',
              itemClass: 'Corn',
              itemGroup: 'RM-GRAIN'
            },
            quantity: 750,
            displayUnits: {
              id: 'lbs',
              name: 'pounds'
            },
            operation: 'Add'
          }
        ]
      }
    ]

    const errors = validateMashingStepBOMItems(mashingSteps, mockBOMIngredients)
    
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('is not configured in the recipe\'s Bill of Materials')
    expect(errors[0]).toContain('Invalid Corn')
  })

  it('should not require recipeBom items for Hold steps', () => {
    const mashingSteps: MashingStep[] = [
      {
        id: '1',
        index: 1,
        stepType: 'Hold',
        holdType: 'Heat',
        included: true,
        notes: 'Heat hold step',
        recipeBomItems: [] // Hold steps don't require BOM items
      }
    ]

    const errors = validateMashingStepBOMItems(mashingSteps, mockBOMIngredients)
    
    expect(errors).toHaveLength(0)
  })

  it('should pass validation when all required steps have valid recipeBom items', () => {
    const mashingSteps: MashingStep[] = [
      {
        id: '1',
        index: 1,
        stepType: 'Corn',
        included: true,
        notes: 'Add corn with valid BOM item',
        recipeBomItems: [
          {
            id: 'bom1',
            item: {
              id: 'ing_corn_001',
              itemName: 'Corn',
              itemNumber: 'CORN-001',
              itemType: 'Grain',
              itemClass: 'Corn',
              itemGroup: 'RM-GRAIN'
            },
            quantity: 750,
            displayUnits: {
              id: 'lbs',
              name: 'pounds'
            },
            operation: 'Add'
          }
        ]
      },
      {
        id: '2',
        index: 2,
        stepType: 'LiquidAdd',
        included: true,
        notes: 'Add water with valid BOM item',
        recipeBomItems: [
          {
            id: 'bom2',
            item: {
              id: 'ing_water_001',
              itemName: 'Process Water',
              itemNumber: 'WATER-001',
              itemType: 'Liquid',
              itemClass: 'Water',
              itemGroup: 'RM-WATER'
            },
            quantity: 500,
            displayUnits: {
              id: 'gal',
              name: 'gallons'
            },
            operation: 'Add'
          }
        ]
      }
    ]

    const errors = validateMashingStepBOMItems(mashingSteps, mockBOMIngredients)
    
    expect(errors).toHaveLength(0)
  })

  it('should validate multiple missing BOM items', () => {
    const mashingSteps: MashingStep[] = [
      {
        id: '1',
        index: 1,
        stepType: 'Corn',
        included: true,
        recipeBomItems: []
      },
      {
        id: '2',
        index: 2,
        stepType: 'LiquidAdd',
        included: true,
        recipeBomItems: []
      },
      {
        id: '3',
        index: 3,
        stepType: 'AdditiveAdd',
        included: true,
        recipeBomItems: []
      }
    ]

    const errors = validateMashingStepBOMItems(mashingSteps, mockBOMIngredients)
    
    expect(errors).toHaveLength(3)
    expect(errors[0]).toContain('Step 1: Corn step requires')
    expect(errors[1]).toContain('Step 2: LiquidAdd step requires')
    expect(errors[2]).toContain('Step 3: AdditiveAdd step requires')
  })
}) 