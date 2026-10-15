import { ApolloClient, NormalizedCacheObject } from '@apollo/client'
import { 
  CALCULATE_ENZYME_DOSING_BY_RECIPE,
  CALCULATE_ENZYME_DOSING_BY_MASHBILL,
  GET_ENZYME_CONFIGURATIONS, 
  GET_ENZYME_ITEMS 
} from '../api/graphql-queries'

// TypeScript types for enzyme dosing
export interface EnzymeDosingInput {
  recipeId?: string
  mashBill?: string
  enzymeItemId: string
}

export interface EnzymeDosingByRecipeInput {
  recipeId: string
  enzymeItemId: string
}

export interface EnzymeDosingByMashBillInput {
  mashBill: string
  enzymeItemId: string
}

export interface EnzymeDosingResult {
  normalizedDoseRatio: number
  enzymeName: string
  mashBill: string
  instructions: string
  recipeId?: string
  recipeName?: string
  enzymeCategory: 'LIQUIFACTION' | 'SACCHARIFICATION' | 'VISCOSITY'
  calculatedAt: string
}

export interface EnzymeConfiguration {
  id: string
  category: 'LIQUIFACTION' | 'SACCHARIFICATION' | 'VISCOSITY'
  dosePerMetricTon: number
  instructions: string
  active: boolean
  item: {
    id: string
    itemName: string
    itemNumber: string
  }
}

export interface EnzymeItem {
  id: string
  itemName: string
  itemNumber: string
  itemDescription: string
  itemType: string
  itemClass: string
  itemGroup: string
}

export interface RecipeBomItem {
  item?: {
    itemGroup?: string
  }
  quantity?: number
}

/**
 * Calculate enzyme dosing for edit mode (existing recipe)
 */
export async function calculateEnzymeDosingByRecipe(
  client: ApolloClient<NormalizedCacheObject>,
  input: EnzymeDosingByRecipeInput
): Promise<EnzymeDosingResult | null> {
  try {
    const { data } = await client.mutate({
      mutation: CALCULATE_ENZYME_DOSING_BY_RECIPE,
      variables: {
        recipeId: input.recipeId,
        enzymeItemId: input.enzymeItemId
      }
    })

    return data?.calculateNormalizedEnzymeDosing || null
  } catch (error) {
    console.error('Error calculating enzyme dosing by recipe:', error)
    throw error
  }
}

/**
 * Calculate enzyme dosing for create mode (mash bill string)
 */
export async function calculateEnzymeDosingByMashBill(
  client: ApolloClient<NormalizedCacheObject>,
  input: EnzymeDosingByMashBillInput
): Promise<EnzymeDosingResult | null> {
  console.log('🌾 calculateEnzymeDosingByMashBill called with:', input)
  
  try {
    console.log('🌾 Executing GraphQL mutation CALCULATE_ENZYME_DOSING_BY_MASHBILL')
    const { data } = await client.mutate({
      mutation: CALCULATE_ENZYME_DOSING_BY_MASHBILL,
      variables: {
        mashBill: input.mashBill,
        enzymeItemId: input.enzymeItemId
      }
    })

    console.log('🌾 GraphQL mutation response:', data)
    const result = data?.calculateNormalizedEnzymeDosing || null
    console.log('🌾 Returning result:', result)
    return result
  } catch (error) {
    console.error('❌ Error calculating enzyme dosing by mash bill:', error)
    throw error
  }
}

/**
 * Calculate enzyme dosing (auto-detects mode based on input)
 */
export async function calculateEnzymeDosing(
  client: ApolloClient<NormalizedCacheObject>,
  input: EnzymeDosingInput
): Promise<EnzymeDosingResult | null> {
  console.log('🔬 calculateEnzymeDosing called with input:', input)
  
  if (input.recipeId) {
    console.log('🔬 Using recipe mode with recipeId:', input.recipeId)
    return calculateEnzymeDosingByRecipe(client, {
      recipeId: input.recipeId,
      enzymeItemId: input.enzymeItemId
    })
  } else if (input.mashBill) {
    console.log('🔬 Using mash bill mode with mashBill:', input.mashBill)
    return calculateEnzymeDosingByMashBill(client, {
      mashBill: input.mashBill,
      enzymeItemId: input.enzymeItemId
    })
  } else {
    const error = 'Either recipeId or mashBill must be provided'
    console.log('❌ calculateEnzymeDosing error:', error)
    throw new Error(error)
  }
}

/**
 * Format mash bill string to the required XX-XX-XX-XX format
 * Supports 100% components (e.g., "00-100-00-00" for 100% rye)
 */
export function formatMashBill(corn: number, rye: number, wheat: number, malt: number): string {
  // Ensure all values are integers and format appropriately
  // For values 100, don't pad; for values < 100, pad to 2 digits
  const formatComponent = (value: number): string => {
    const rounded = Math.round(value)
    return rounded === 100 ? '100' : rounded.toString().padStart(2, '0')
  }
  
  const cornStr = formatComponent(corn)
  const ryeStr = formatComponent(rye)
  const wheatStr = formatComponent(wheat)
  const maltStr = formatComponent(malt)
  
  return `${cornStr}-${ryeStr}-${wheatStr}-${maltStr}`
}

/**
 * Parse mash bill string into components
 * Supports both XX-XX-XX-XX and XXX-XX-XX-XX formats (for 100% components)
 */
export function parseMashBill(mashBill: string): { corn: number, rye: number, wheat: number, malt: number } {
  const parts = mashBill.split('-').map(part => parseInt(part, 10))
  
  if (parts.length !== 4 || parts.some(isNaN)) {
    throw new Error('Invalid mash bill format. Expected XX-XX-XX-XX or XXX-XX-XX-XX (e.g., "70-21-00-09" or "00-100-00-00")')
  }
  
  // Validate that components sum to 100
  const total = parts.reduce((sum, part) => sum + part, 0)
  if (total !== 100) {
    throw new Error(`Mash bill components must sum to 100%, but sum to ${total}%`)
  }
  
  return {
    corn: parts[0] || 0,
    rye: parts[1] || 0, 
    wheat: parts[2] || 0,
    malt: parts[3] || 0
  }
}

// Helper function to get all enzyme configurations
export async function getEnzymeConfigurations(
  client: ApolloClient<NormalizedCacheObject>
): Promise<EnzymeConfiguration[]> {
  try {
    const { data } = await client.query({
      query: GET_ENZYME_CONFIGURATIONS,
      fetchPolicy: 'cache-first'
    })
    
    return data.enzymeConfigurations
  } catch (error) {
    console.error('Error fetching enzyme configurations:', error)
    throw new Error(`Failed to fetch enzyme configurations: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

// Helper function to get all enzyme items
export async function getEnzymeItems(
  client: ApolloClient<NormalizedCacheObject>
): Promise<EnzymeItem[]> {
  try {
    const { data } = await client.query({
      query: GET_ENZYME_ITEMS,
      fetchPolicy: 'cache-first'
    })
    
    return data.items
  } catch (error) {
    console.error('Error fetching enzyme items:', error)
    throw new Error(`Failed to fetch enzyme items: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

// Helper function to calculate multiple enzyme dosings for a recipe
export async function calculateMultipleEnzymeDosings(
  client: ApolloClient<NormalizedCacheObject>,
  recipeId: string,
  enzymeItemIds: string[]
): Promise<EnzymeDosingResult[]> {
  try {
    const promises = enzymeItemIds.map(enzymeItemId =>
      calculateEnzymeDosing(client, { recipeId, enzymeItemId })
    )
    
    const results = await Promise.allSettled(promises)
    
    const successful: EnzymeDosingResult[] = []
    const failed: string[] = []
    
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value !== null) {
        successful.push(result.value)
      } else {
        const errorMessage = result.status === 'rejected' ? result.reason : 'Calculation returned null'
        failed.push(`${enzymeItemIds[index]}: ${errorMessage}`)
      }
    })
    
    if (failed.length > 0) {
      console.warn('Some enzyme dosing calculations failed:', failed)
    }
    
    return successful
  } catch (error) {
    console.error('Error calculating multiple enzyme dosings:', error)
    throw new Error(`Failed to calculate multiple enzyme dosings: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

// Helper function to get enzymes by category
export function getEnzymesByCategory(
  enzymeConfigurations: EnzymeConfiguration[],
  category: 'LIQUIFACTION' | 'SACCHARIFICATION' | 'VISCOSITY'
): EnzymeConfiguration[] {
  return enzymeConfigurations.filter(config => 
    config.category === category && config.active
  )
}

// Helper function to format enzyme dosing for recipe BOM
export interface RecipeBomEnzymeItem {
  itemId: string
  itemName: string
  itemNumber: string
  quantity: number
  operation: string
  instructions: string
  category: string
}

export function formatEnzymeDosingForBom(
  enzymeDosingResult: EnzymeDosingResult,
  totalGrainWeight: number, // in pounds or kg
  operation: string = 'Mashing01'
): RecipeBomEnzymeItem {
  // Calculate actual quantity based on normalized dose ratio and total grain weight
  const quantity = enzymeDosingResult.normalizedDoseRatio * totalGrainWeight
  
  return {
    itemId: enzymeDosingResult.recipeId || '', // This should be the enzyme item ID
    itemName: enzymeDosingResult.enzymeName,
    itemNumber: enzymeDosingResult.enzymeName, // You might want to extract just the number part
    quantity: Math.round(quantity * 1000) / 1000, // Round to 3 decimal places
    operation,
    instructions: enzymeDosingResult.instructions,
    category: enzymeDosingResult.enzymeCategory
  }
}

// Helper function to calculate total grain weight from recipe BOM
export function calculateTotalGrainWeight(recipeBomItems: RecipeBomItem[]): number {
  return recipeBomItems
    .filter(item => 
      item.item?.itemGroup?.includes('GR') || // Grain items
      item.item?.itemGroup?.includes('BRY')   // Barley/Malt items
    )
    .reduce((total, item) => total + (item.quantity || 0), 0)
}

/**
 * Generate enzyme recommendations for recipe BOM creation
 */
export async function generateEnzymeRecommendations(
  client: ApolloClient<NormalizedCacheObject>,
  input: EnzymeDosingInput,
  totalGrainWeight: number = 18000
): Promise<RecipeBomEnzymeItem[]> {
  try {
    const enzymeConfigurations = await getEnzymeConfigurations(client)
    const recommendations: RecipeBomEnzymeItem[] = []

    // Get dosing for each enzyme category
    for (const config of enzymeConfigurations) {
      if (config.active && config.item?.id) {
        try {
          const dosingResult = await calculateEnzymeDosing(client, {
            ...input,
            enzymeItemId: config.item.id
          })

          if (dosingResult) {
            const bomItem = formatEnzymeDosingForBom(dosingResult, totalGrainWeight)
            recommendations.push(bomItem)
          }
        } catch (error) {
          console.warn(`Failed to calculate dosing for enzyme ${config.item.itemName}:`, error)
        }
      }
    }

    return recommendations
  } catch (error) {
    console.error('Error generating enzyme recommendations:', error)
    throw error
  }
} 