import { RecipeIngredient } from '@/components/ui/recipe-components'
import { categorizeIngredientByItemGroup } from '@/lib/recipe-utils'
import { RecipeParameterClient } from '@/lib/api/recipe-parameter-client'
import { ITEM_QUERIES } from '@/lib/api/graphql-queries'
import { unifiedGraphQLClient } from '@/lib/api/unified-graphql-client'

// Mash bill type definition
export interface MashBill {
  corn: number
  rye: number
  wheat: number
  maltedBarley: number
}

// Recipe parameter type definition (matching the component interface)
export interface RecipeParameter {
  id: string
  name: string
  description: string
  type: 'numeric' | 'boolean' | 'text'
  value: string | number | boolean
  unit?: string
  operation?: string
  createdAt: Date
}

// Auto-populate options
export interface AutoPopulateOptions {
  mashBill: MashBill
  mashRatio: number // Water to grain ratio (default 3.0)
  waterBacksetRatio: number // Water vs backset split (default 0.7 for 70% water, 30% backset)
  citricAcidAmount: number // Default citric acid amount in lbs
  totalGrainWeight: number // Total grain weight in lbs
  // New percentage-based options for water and backset
  waterPercentage: number // Default percentage of total liquid for water (e.g., 70)
  backsetPercentage: number // Default percentage of total liquid for backset (e.g., 30)
}

// Interface for database items
interface DatabaseItem {
  id: string
  itemName: string
  itemNumber: string
  itemType?: string | null
  itemClass?: string | null
  itemGroup?: string | null
}

// Standard items that should be auto-added to every recipe
// Using itemNumber as the unique identifier since it's safe and unique
export const STANDARD_ITEMS = {
  water: {
    itemNumber: 'Water',
    name: 'Water',
    defaultQuantity: 70, // Default percentage of total liquid
    unit: '%',
    operation: 'Mashing01'
  },
  backset: {
    itemNumber: 'Backset',
    name: 'Backset', 
    defaultQuantity: 30, // Default percentage of total liquid
    unit: '%',
    operation: 'Mashing01'
  },
  citricAcid: {
    itemNumber: 'CIT-TMP01-Citric (Citric Acid)',
    name: 'CIT-TMP01-Citric (Citric Acid)',
    defaultQuantity: 0.5,
    unit: 'lbs',
    operation: 'Mashing01'
  }
} as const

// Grain items mapping based on mash bill components
// Using itemNumber for identification
export const GRAIN_ITEMS = {
  corn: {
    itemNumber: 'CORN-001',
    name: 'Corn',
    unit: '%'
  },
  rye: {
    itemNumber: 'RYE-001', 
    name: 'Rye',
    unit: '%'
  },
  wheat: {
    itemNumber: 'WHEAT-001',
    name: 'Wheat',
    unit: '%'
  },
  maltedBarley: {
    itemNumber: 'BARLEY-001',
    name: 'Malted Barley',
    unit: '%'
  }
} as const

// Default auto-populate options
export function getDefaultAutoPopulateOptions(): Omit<AutoPopulateOptions, 'mashBill'> {
  return {
    mashRatio: 3.0, // Not used anymore, kept for compatibility
    waterBacksetRatio: 0.7, // Not used anymore, kept for compatibility
    citricAcidAmount: 0.5, // Enable citric acid with default 0.5 lbs
    totalGrainWeight: 100, // Not used anymore, kept for compatibility
    waterPercentage: 70, // 70% of total liquid
    backsetPercentage: 30 // 30% of total liquid
  }
}

// Validation function for water and backset percentages
export function validateWaterBacksetPercentages(waterPercentage: number, backsetPercentage: number): {
  isValid: boolean
  errors: string[]
} {
  const errors: string[] = []
  
  // Check individual percentages are within reasonable bounds
  if (waterPercentage < 0 || waterPercentage > 100) {
    errors.push('Water percentage must be between 0% and 100%')
  }
  
  if (backsetPercentage < 0 || backsetPercentage > 100) {
    errors.push('Backset percentage must be between 0% and 100%')
  }
  
  // Check that they add up to 100%
  const total = waterPercentage + backsetPercentage
  if (Math.abs(total - 100) > 0.01) { // Allow for small floating point errors
    errors.push(`Water and backset percentages must add up to 100% (currently ${total.toFixed(1)}%)`)
  }
  
  // Check for reasonable minimums (at least 10% each)
  if (waterPercentage > 0 && waterPercentage < 10) {
    errors.push('Water percentage should be at least 10% if used')
  }
  
  if (backsetPercentage > 0 && backsetPercentage < 10) {
    errors.push('Backset percentage should be at least 10% if used')
  }
  
  return {
    isValid: errors.length === 0,
    errors
  }
}

// Function to find the best matching item from database results
function findBestMatchingItem(
  items: DatabaseItem[],
  searchTerms: string[],
  preferredItemGroup?: string | null
): DatabaseItem | null {
  if (items.length === 0) return null

  // First, try exact matches by item name or number
  for (const term of searchTerms) {
    const exactMatch = items.find(item => 
      item.itemName?.toLowerCase() === term.toLowerCase() ||
      item.itemNumber?.toLowerCase() === term.toLowerCase()
    )
    if (exactMatch) return exactMatch
  }

  // Then try partial matches, prioritizing by itemGroup if specified
  let candidates: DatabaseItem[] = []
  
  for (const term of searchTerms) {
    const matches = items.filter(item =>
      item.itemName?.toLowerCase().includes(term.toLowerCase()) ||
      item.itemNumber?.toLowerCase().includes(term.toLowerCase())
    )
    candidates.push(...matches)
  }

  // Remove duplicates
  candidates = candidates.filter((item, index, self) => 
    index === self.findIndex(t => t.id === item.id)
  )

  if (candidates.length === 0) return null

  // If we have a preferred item group, prioritize items from that group
  if (preferredItemGroup !== undefined) {
    if (preferredItemGroup === null) {
      // Looking for items with null or empty itemGroup
      const nullGroupItems = candidates.filter(item => 
        !item.itemGroup || item.itemGroup === ''
      )
      if (nullGroupItems.length > 0) return nullGroupItems[0] || null
    } else {
      // Looking for items with specific itemGroup prefix
      const groupItems = candidates.filter(item =>
        item.itemGroup?.startsWith(preferredItemGroup)
      )
      if (groupItems.length > 0) return groupItems[0] || null
    }
  }

  // Return the first candidate if no group preference match
  return candidates[0] || null
}

/**
 * Auto-populate BOM items using actual database items instead of dummy data
 */
export async function autoPopulateBOMItemsFromDatabase(
  options: AutoPopulateOptions
): Promise<RecipeIngredient[]> {
  try {
    console.log('🔍 Fetching actual items from database for auto-populate...')
    
    const response = await unifiedGraphQLClient.query<{ items: DatabaseItem[] }>(
      ITEM_QUERIES.GET_ITEMS,
      {
        variables: { take: 1000 }, // Get a large number of items
        fetchPolicy: 'cache-first'
      }
    )

    if (!response?.items) {
      console.warn('⚠️ No items found in database, falling back to dummy data')
      return autoPopulateBOMItems(options)
    }

    const items = response.items
    console.log(`📦 Found ${items.length} items in database`)

    const ingredients: RecipeIngredient[] = []

    // Add water (70% of total liquid)
    const waterItem = findBestMatchingItem(
      items,
      ['water', 'Water'],
      null // Water items have null itemGroup
    )
    if (waterItem) {
      ingredients.push({
        id: crypto.randomUUID(),
        itemCode: waterItem.itemNumber || waterItem.itemName,
        name: waterItem.itemName,
        quantity: options.waterPercentage,
        unit: '%',
        category: 'water',
        itemGroup: waterItem.itemGroup || undefined,
        operation: 'Add',
        createdAt: new Date()
      })
      console.log(`✅ Found water item: ${waterItem.itemName} (${options.waterPercentage}%)`)
    } else {
      console.warn('⚠️ No water item found in database')
    }

    // Add backset (30% of total liquid)
    const backsetItem = findBestMatchingItem(
      items,
      ['backset', 'Backset', 'backset water', 'Backset Water'],
      null // Backset items have null or empty itemGroup
    )
    if (backsetItem) {
      ingredients.push({
        id: crypto.randomUUID(),
        itemCode: backsetItem.itemNumber || backsetItem.itemName,
        name: backsetItem.itemName,
        quantity: options.backsetPercentage,
        unit: '%',
        category: 'water',
        itemGroup: backsetItem.itemGroup || undefined,
        operation: 'Add',
        createdAt: new Date()
      })
      console.log(`✅ Found backset item: ${backsetItem.itemName} (${options.backsetPercentage}%)`)
    } else {
      console.warn('⚠️ No backset item found in database')
    }

    // Add grains based on mash bill
    const grainMappings = [
      {
        type: 'corn',
        searchTerms: ['corn', 'COR-', 'yellow dent', 'dent corn'],
        itemGroupPrefix: 'RM-GR-COR',
        percentage: options.mashBill.corn
      },
      {
        type: 'rye',
        searchTerms: ['rye', 'RYE-', 'rye grain'],
        itemGroupPrefix: 'RM-GR-RYE',
        percentage: options.mashBill.rye
      },
      {
        type: 'wheat',
        searchTerms: ['wheat', 'WHT-', 'winter wheat', 'soft red'],
        itemGroupPrefix: 'RM-GR-WHT',
        percentage: options.mashBill.wheat
      },
      {
        type: 'maltedBarley',
        searchTerms: ['malt', 'BRY-', 'malted barley', 'barley malt'],
        itemGroupPrefix: 'RM-GR-BRY',
        percentage: options.mashBill.maltedBarley
      }
    ]

    for (const grain of grainMappings) {
      if (grain.percentage > 0) {
        const grainItem = findBestMatchingItem(
          items,
          grain.searchTerms,
          grain.itemGroupPrefix
        )
        
        if (grainItem) {
          ingredients.push({
            id: crypto.randomUUID(),
            itemCode: grainItem.itemNumber || grainItem.itemName,
            name: grainItem.itemName,
            quantity: grain.percentage,
            unit: '%',
            category: 'grains',
            itemGroup: grainItem.itemGroup || undefined,
            operation: 'Add',
            createdAt: new Date()
          })
          console.log(`✅ Found ${grain.type} item: ${grainItem.itemName} (${grain.percentage}%)`)
        } else {
          console.warn(`⚠️ No ${grain.type} item found in database`)
        }
      }
    }

    // Add citric acid if enabled
    if (options.citricAcidAmount > 0) {
      const citricAcidItem = findBestMatchingItem(
        items,
        ['citric acid', 'CIT-TMP01-Citric', 'ADD-CIT-01'],
        'RM-ADD' // Additive item group
      )
      
      if (citricAcidItem) {
        ingredients.push({
          id: crypto.randomUUID(),
          itemCode: citricAcidItem.itemNumber || citricAcidItem.itemName,
          name: citricAcidItem.itemName,
          quantity: options.citricAcidAmount,
          unit: 'lbs',
          category: 'other',
          itemGroup: citricAcidItem.itemGroup || undefined,
          operation: 'Add',
          createdAt: new Date()
        })
        console.log(`✅ Found citric acid item: ${citricAcidItem.itemName} (${options.citricAcidAmount} lbs)`)
      } else {
        console.warn('⚠️ No citric acid item found in database')
      }
    }

    console.log(`🎉 Successfully populated ${ingredients.length} BOM items from database`)
    return ingredients

  } catch (error) {
    console.error('❌ Error fetching items from database:', error)
    console.log('🔄 Falling back to dummy data')
    return autoPopulateBOMItems(options)
  }
}

// Auto-populate BOM items based on mash bill and options (original function with dummy data)
export function autoPopulateBOMItems(options: AutoPopulateOptions): RecipeIngredient[] {
  const ingredients: RecipeIngredient[] = []
  
  // Add water - percentage of total liquid
  ingredients.push({
    id: 'auto_water',
    itemCode: STANDARD_ITEMS.water.itemNumber,
    name: STANDARD_ITEMS.water.name,
    quantity: options.waterPercentage,
    unit: STANDARD_ITEMS.water.unit,
    category: categorizeIngredientByItemGroup('RM-LIQ'),
    operation: STANDARD_ITEMS.water.operation,
    createdAt: new Date()
  })

  // Add backset - percentage of total liquid
  ingredients.push({
    id: 'auto_backset',
    itemCode: STANDARD_ITEMS.backset.itemNumber,
    name: STANDARD_ITEMS.backset.name,
    quantity: options.backsetPercentage,
    unit: STANDARD_ITEMS.backset.unit,
    category: categorizeIngredientByItemGroup('RM-LIQ'),
    operation: STANDARD_ITEMS.backset.operation,
    createdAt: new Date()
  })

  // Add grain items based on mash bill percentages
  const grainEntries = Object.entries(options.mashBill) as [keyof MashBill, number][]
  grainEntries.forEach(([grainType, percentage]) => {
    if (percentage > 0) {
      const grainItem = GRAIN_ITEMS[grainType]
      if (grainItem) {
        ingredients.push({
          id: `auto_${grainType}`,
          itemCode: grainItem.itemNumber,
          name: grainItem.name,
          quantity: percentage,
          unit: grainItem.unit,
          category: categorizeIngredientByItemGroup('RM-GR'),
          operation: 'Mashing01',
          createdAt: new Date()
        })
      }
    }
  })

  // Add citric acid if enabled
  if (options.citricAcidAmount > 0) {
    ingredients.push({
      id: 'auto_citric_acid',
      itemCode: STANDARD_ITEMS.citricAcid.itemNumber,
      name: STANDARD_ITEMS.citricAcid.name,
      quantity: options.citricAcidAmount,
      unit: STANDARD_ITEMS.citricAcid.unit,
      category: categorizeIngredientByItemGroup('RM-ADD'),
      operation: STANDARD_ITEMS.citricAcid.operation,
      createdAt: new Date()
    })
  }
  
  return ingredients
}

// Create a recipe parameter client instance
const recipeParameterClient = new RecipeParameterClient()

// Auto-populate required class definition parameters
export async function autoPopulateRequiredParameters(mashBill?: MashBill): Promise<RecipeParameter[]> {
  try {
    // Fetch required class definition parameters from the API
    // Note: We'll use the GraphQL query directly since the filter interface doesn't include isClassDefinition
    const result = await recipeParameterClient.getRecipeParameters(
      { skip: 0, take: 100 }, // Get all parameters
      {} // Use empty filter and rely on the GraphQL query to handle isClassDefinition
    )

    const parameters: RecipeParameter[] = []
    
    // Filter for required class definition parameters and convert API parameters to our format
    result.recipeParameters
      .filter(param => param.isClassDefinition && param.required)
      .forEach(param => {
        let value: string | number | boolean = 0
        let type: 'numeric' | 'boolean' | 'text' = 'numeric'

        // Determine type and default value based on the parameter
        if (param.recipeSetpointType === 'Boolean') {
          type = 'boolean'
          value = param.recipeSetpointBooleanValue || false
          
          // Special handling for IsFourGrain based on mash bill
          if (param.recipeParamName === 'IsFourGrain' && mashBill) {
            // Consider it a four grain recipe if it has corn, rye, wheat, and malted barley all > 0
            value = mashBill.corn > 0 && mashBill.rye > 0 && mashBill.wheat > 0 && mashBill.maltedBarley > 0
          }
        } else if (param.recipeSetpointType === 'Numeric') {
          type = 'numeric'
          value = param.recipeNumericalSetpoint || 0
        } else {
          type = 'text'
          value = ''
        }

        parameters.push({
          id: `auto_${param.recipeParamName}`,
          name: param.recipeParamName,
          description: param.recipeParamDescription || param.description || '',
          type,
          value,
          unit: param.units?.abbreviation || param.units?.name || '',
          operation: param.operation?.name || '',
          createdAt: new Date()
        })
      })
    
    return parameters
  } catch (error) {
    console.error('Error fetching required class definition parameters:', error)
    
    // Fallback to basic parameters if API call fails
    return [
      {
        id: 'auto_CooksPerFerm',
        name: 'CooksPerFerm',
        description: 'Number of cooks per fermentation',
        type: 'numeric',
        value: 3,
        unit: '',
        operation: '',
        createdAt: new Date()
      }
    ]
  }
}

// Check if BOM has been auto-populated (contains auto-generated items)
export function isBOMAutoPopulated(ingredients: RecipeIngredient[]): boolean {
  return ingredients.some(ingredient => ingredient.id?.startsWith('auto_'))
}

// Check if parameters have been auto-populated
export function areParametersAutoPopulated(parameters: RecipeParameter[]): boolean {
  return parameters.some(param => param.id?.startsWith('auto_'))
}

// Get auto-populated ingredients from a BOM
export function getAutoPopulatedIngredients(ingredients: RecipeIngredient[]): RecipeIngredient[] {
  return ingredients.filter(ingredient => ingredient.id.startsWith('auto_'))
}

// Get manually added ingredients from a BOM
export function getManualIngredients(ingredients: RecipeIngredient[]): RecipeIngredient[] {
  return ingredients.filter(ingredient => !ingredient.id.startsWith('auto_'))
}

// Get auto-populated parameters
export function getAutoPopulatedParameters(parameters: RecipeParameter[]): RecipeParameter[] {
  return parameters.filter(parameter => parameter.id?.startsWith('auto_'))
}

// Get manually added parameters
export function getManualParameters(parameters: RecipeParameter[]): RecipeParameter[] {
  return parameters.filter(parameter => !parameter.id?.startsWith('auto_'))
} 