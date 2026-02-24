import { useState } from 'react'
import { useLazyQuery } from '@apollo/client'
import { RECIPE_QUERIES } from '@/lib/api/graphql-queries'
import { toast } from 'sonner'
import { parseMashBillFromRecipeName, categorizeIngredientByItemGroup, type IngredientCategory } from '@/lib/recipe-utils'

// Types for the complete recipe data structure
export interface BasisRecipeData {
  details: {
    Recipe: string
    active: boolean
    whiskeyType: string
    revision: string
    customerCode: string
    cooksPerFerm: number
    createdAt: string
    createdBy: string
    mashBill: {
      corn: number
      rye: number
      wheat: number
      maltedBarley: number
    }
    baseRecipeId: string
  }
  bom: {
    ingredients: Array<{
      id: string
      itemCode: string
      name: string
      quantity: number
      unit: string
      category: IngredientCategory
      notes?: string
    }>
  }
  parameters: {
    parameters: Array<{
      id: string
      name: string
      description: string
      type: 'numeric' | 'boolean' | 'text'
      value: number | boolean | string
      unit: string
      required?: boolean
    }>
  }
  mashing: {
    mashingSteps: Array<{
      id: string
      index: number
      stepType: 'LiquidAdd' | 'Hold' | 'AdditiveAdd' | 'Malt' | 'Corn' | 'Rye'
      holdType?: 'Heat' | 'Cool' | 'None'
      temperatureSP?: number
      timeDuration?: number
      waterBacksetSP?: number
      additiveType?: string
      included: boolean
      notes?: string
      recipeBomItems: Array<{
        id: string
        item: {
          id: string
          itemName: string
          itemType: string
          itemClass: string
          itemGroup: string | null
        }
        quantity: number
        displayUnits: {
          id: string
          name: string
        } | null
        operation: string
      }>
    }>
  }
}

// GraphQL response type for the recipe query
interface RecipeQueryResponse {
  recipe: {
    id: string
    Recipe: string
    revision: string
    whiskeyType: string
    active: boolean
    customerCode: string
    cooksPerFerm: number
    createdAt: string
    createdBy: string
    mashingProtocol?: {
      steps: Array<{
        id: string
        index: number
        stepType: string
        holdType: string
        stepTime: number
        temperatureSetpoint: number
        heatTempSp?: number
        coolTempSp?: number
        promptMessage?: string
        recipeBomItem?: Array<{
          id: string
          item?: {
            id: string
            itemName: string
            itemType: string
            itemClass: string
            itemGroup: string | null
          }
          quantity: number
          displayUnits?: {
            id: string
            name: string
          }
          operation: string
        }>
      }>
    }
    parameters: Array<{
      id: string
      recipeParamName: string
      recipeParamDescription?: string
      recipeNumericalSetpoint?: number
      recipeSetpointType: string
      recipeSetpointBooleanValue?: boolean
      units?: {
        abbreviation: string
      }
    }>
    recipeBoms: Array<{
      recipeBomITem: Array<{
        id: string
        operation: string
        quantity: number
        item: {
          id: string
          itemName: string
          itemNumber: string
          itemGroup?: string
        }
        displayUnits?: {
          abbreviation: string
        }
      }>
    }>
  }
}

export function useRecipeBasis() {
  const [loading, setLoading] = useState(false)
  
  const [getRecipeForBasis] = useLazyQuery<RecipeQueryResponse>(RECIPE_QUERIES.GET_RECIPE_FOR_BASIS, {
    onError: (error) => {
      console.error('Error fetching recipe for basis:', error)
      toast.error('Failed to load recipe data. Please try again.')
      setLoading(false)
    }
  })

  const loadRecipeAsBasis = async (
    recipeId: string, 
    newRevision: string
  ): Promise<BasisRecipeData | null> => {
    setLoading(true)
    
    try {
      const { data } = await getRecipeForBasis({
        variables: { id: recipeId }
      })

      if (!data?.recipe) {
        toast.error('Recipe not found')
        return null
      }

      const recipe = data.recipe
      console.log('Raw recipe data from GraphQL:', recipe)
      console.log('Recipe BOMs:', recipe.recipeBoms)
      console.log('First BOM:', recipe.recipeBoms?.[0])
      console.log('First BOM items:', recipe.recipeBoms?.[0]?.recipeBomITem)

      // Calculate mash bill from recipe name first, fall back to BOM if parsing fails
      let mashBill = parseMashBillFromRecipeName(recipe.Recipe)
      
      if (!mashBill) {
        console.log('Recipe name parsing failed, falling back to BOM calculation')
        mashBill = calculateMashBillFromBOM(recipe.recipeBoms?.[0]?.recipeBomITem || [])
      } else {
        console.log('Successfully parsed mash bill from recipe name:', recipe.Recipe, '→', mashBill)
      }
      
      console.log('Final mash bill in loadRecipeAsBasis:', mashBill)

      // Transform the GraphQL response to our wizard data structure
      const basisData: BasisRecipeData = {
        details: {
          Recipe: `${recipe.customerCode}-${mashBill.corn.toString().padStart(2, '0')}-${mashBill.rye.toString().padStart(2, '0')}-${mashBill.wheat.toString().padStart(2, '0')}-${mashBill.maltedBarley.toString().padStart(2, '0')}-v${newRevision.padStart(2, '0')}`,
          active: true, // New recipes start as active
          whiskeyType: recipe.whiskeyType,
          revision: newRevision,
          customerCode: recipe.customerCode,
          cooksPerFerm: recipe.cooksPerFerm,
          createdAt: new Date().toISOString(),
          createdBy: 'Current User', // TODO: Get from auth context
          mashBill,
          baseRecipeId: recipe.id
        },
        bom: {
          ingredients: recipe.recipeBoms?.[0]?.recipeBomITem?.map(item => ({
            id: `ing_${Date.now()}_${Math.random()}`, // Generate new IDs for the new recipe
            itemCode: item.item?.itemNumber || item.item?.id || '',
            name: item.item?.itemName || '',
            quantity: item.quantity || 0,
            unit: item.displayUnits?.abbreviation || '',
            category: categorizeIngredientByItemGroup(item.item?.itemGroup, item.item?.itemName, item.item?.itemNumber),
            ...(item.operation && { notes: `Operation: ${item.operation}` })
          })) || []
        },
        parameters: {
          parameters: recipe.parameters.map(param => ({
            id: param.id,
            name: param.recipeParamName,
            description: param.recipeParamDescription || '',
            type: param.recipeSetpointType === 'boolean' ? 'boolean' : param.recipeSetpointType === 'text' ? 'text' : 'numeric',
            value: param.recipeNumericalSetpoint ?? param.recipeSetpointBooleanValue ?? '',
            unit: param.units?.abbreviation || '',
            required: param.recipeSetpointType === 'boolean'
          })),
        },
        mashing: {
          mashingSteps: recipe.mashingProtocol?.steps?.map(step => {
            const baseStep = {
              id: `step_${Date.now()}_${Math.random()}`, // Generate new IDs for the new recipe
              index: step.index || 0,
              stepType: (step.stepType as 'LiquidAdd' | 'Hold' | 'AdditiveAdd' | 'Malt' | 'Corn' | 'Rye') || 'LiquidAdd',
              holdType: (step.holdType as 'Heat' | 'Cool' | 'None') || 'None',
              timeDuration: step.stepTime || 0,
              waterBacksetSP: step.temperatureSetpoint || 0,
              included: true,
              recipeBomItems: step.recipeBomItem?.map(bomItem => {
                // Only multiply by 100 for percentage-based units (grains)
                const unitName = bomItem.displayUnits?.name?.toLowerCase() || ''
                const isPercentage = unitName === '%' || unitName.includes('percent')
                const quantity = isPercentage
                  ? (bomItem.quantity || 0) * 100
                  : (bomItem.quantity || 0)

                return {
                  id: bomItem.id,
                  item: {
                    id: bomItem.item?.id || '',
                    itemNumber: bomItem.item?.itemNumber || '',
                    itemName: bomItem.item?.itemName || '',
                    itemType: bomItem.item?.itemType || '',
                    itemClass: bomItem.item?.itemClass || '',
                    itemGroup: bomItem.item?.itemGroup || null
                  },
                  quantity,
                  displayUnits: bomItem.displayUnits ? {
                    id: bomItem.displayUnits.id,
                    name: bomItem.displayUnits.name || ''
                  } : null,
                  operation: bomItem.operation || ''
                }
              }) || [],
              ...(step.promptMessage && { notes: step.promptMessage })
            }
            
            // Add temperature properties based on what's available in the database
            if (step.heatTempSp) {
              return { ...baseStep, heatTempSp: step.heatTempSp }
            }
            if (step.coolTempSp) {
              return { ...baseStep, coolTempSp: step.coolTempSp }
            }
            // Fallback to temperatureSetpoint if available
            if (step.temperatureSetpoint) {
              return { ...baseStep, heatTempSp: step.temperatureSetpoint }
            }
            
            // Only add additiveType if it's a LiquidAdd step and has a message
            if (step.stepType === 'LiquidAdd' && step.promptMessage) {
              return { ...baseStep, additiveType: step.promptMessage }
            }
            
            return baseStep
          }) || []
        }
      }

      toast.success(`Recipe loaded as basis for revision ${newRevision}`)
      return basisData

    } catch (error) {
      console.error('Error loading recipe as basis:', error)
      toast.error('Failed to load recipe data. Please try again.')
      return null
    } finally {
      setLoading(false)
    }
  }

  return {
    loadRecipeAsBasis,
    loading
  }
}

// Helper function to calculate mash bill percentages from BOM ingredients
function calculateMashBillFromBOM(bomItems: RecipeQueryResponse['recipe']['recipeBoms'][0]['recipeBomITem']): { corn: number; rye: number; wheat: number; maltedBarley: number } {
  console.log('=== CALCULATE MASH BILL FROM BOM START ===')
  console.log('BOM Items received:', bomItems)
  console.log('BOM Items length:', bomItems?.length || 0)
  
  const mashBill = { corn: 0, rye: 0, wheat: 0, maltedBarley: 0 }
  
  if (!bomItems || bomItems.length === 0) {
    console.log('No BOM items found, returning empty mash bill')
    console.log('=== CALCULATE MASH BILL FROM BOM END ===')
    return mashBill
  }
  
  // Log all items first
  bomItems.forEach((item, index) => {
    console.log(`BOM Item ${index}:`, {
      id: item?.id,
      itemName: item?.item?.itemName,
      itemNumber: item?.item?.itemNumber,
      quantity: item?.quantity,
      operation: item?.operation
    })
  })
  
  // Filter for grain ingredients and calculate weights
  const grainItems = bomItems.filter(item => {
    const isGrain = isGrainIngredient(item?.item?.itemName || '')
    console.log(`Item "${item?.item?.itemName}" is grain: ${isGrain}`)
    return isGrain
  })
  
  console.log('Filtered grain items:', grainItems.length)
  
  if (grainItems.length === 0) {
    console.log('No grain items found, returning empty mash bill')
    console.log('=== CALCULATE MASH BILL FROM BOM END ===')
    return mashBill
  }
  
  // Calculate total grain weight
  const totalGrainWeight = grainItems.reduce((total, item) => {
    const quantity = parseFloat(item?.quantity?.toString() || '0')
    console.log(`Adding grain weight: ${item?.item?.itemName} = ${quantity}`)
    return total + quantity
  }, 0)
  
  console.log('Total grain weight:', totalGrainWeight)
  
  if (totalGrainWeight === 0) {
    console.log('Total grain weight is 0, returning empty mash bill')
    console.log('=== CALCULATE MASH BILL FROM BOM END ===')
    return mashBill
  }
  
  // Calculate percentages for each grain type
  grainItems.forEach(item => {
    const itemName = (item?.item?.itemName || '').toLowerCase()
    const quantity = parseFloat(item?.quantity?.toString() || '0')
    const percentage = Math.round((quantity / totalGrainWeight) * 100)
    
    console.log(`Processing grain: "${item?.item?.itemName}" (${itemName}), quantity: ${quantity}, percentage: ${percentage}`)
    
    // More comprehensive grain type detection
    if (itemName.includes('corn') || itemName.includes('maize')) {
      mashBill.corn += percentage
      console.log(`Added ${percentage}% to corn (total: ${mashBill.corn}%)`)
    } else if (itemName.includes('rye')) {
      mashBill.rye += percentage
      console.log(`Added ${percentage}% to rye (total: ${mashBill.rye}%)`)
    } else if (itemName.includes('wheat')) {
      mashBill.wheat += percentage
      console.log(`Added ${percentage}% to wheat (total: ${mashBill.wheat}%)`)
    } else if (itemName.includes('barley') || itemName.includes('malt')) {
      mashBill.maltedBarley += percentage
      console.log(`Added ${percentage}% to malted barley (total: ${mashBill.maltedBarley}%)`)
    } else {
      console.log(`Unknown grain type: "${itemName}" - not categorized`)
    }
  })
  
  // Ensure percentages add up to 100% (handle rounding errors)
  const total = mashBill.corn + mashBill.rye + mashBill.wheat + mashBill.maltedBarley
  console.log('Total percentage before adjustment:', total)
  
  if (total > 0 && total !== 100) {
    // Adjust the largest component to make total = 100
    const largest = Object.keys(mashBill).reduce((a, b) => 
      mashBill[a as keyof typeof mashBill] > mashBill[b as keyof typeof mashBill] ? a : b
    ) as keyof typeof mashBill
    
    const adjustment = 100 - total
    mashBill[largest] += adjustment
    console.log(`Adjusted ${largest} by ${adjustment}% to make total 100%`)
  }
  
  console.log('Final mash bill:', mashBill)
  console.log('=== CALCULATE MASH BILL FROM BOM END ===')
  
  return mashBill
}

// Helper function to determine if an ingredient is a grain
function isGrainIngredient(itemName: string): boolean {
  const grainKeywords = ['corn', 'rye', 'wheat', 'barley', 'malt']
  const lowerName = itemName.toLowerCase()
  const isGrain = grainKeywords.some(keyword => lowerName.includes(keyword))
  
  console.log(`isGrainIngredient check: "${itemName}" -> "${lowerName}" -> ${isGrain}`)
  if (isGrain) {
    const matchedKeywords = grainKeywords.filter(keyword => lowerName.includes(keyword))
    console.log(`Matched keywords: ${matchedKeywords.join(', ')}`)
  }
  
  return isGrain
} 