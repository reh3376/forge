'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { unifiedGraphQLClient } from '@/lib/api/unified-graphql-client'
import {
  GET_ENZYME_CONFIGURATIONS,
  GET_RECIPE_BOMS,
  GET_ENZYME_CALCULATION_HISTORY,
  CALCULATE_ENZYME_DOSING,
  GET_RECIPES_FOR_ENZYME_DOSING,
} from '@/lib/api/graphql-queries'
import { toast } from 'sonner'

// Types
export interface EnzymeConfiguration {
  id: string
  itemName: string
  itemNumber: string
  itemDescription?: string
  itemType?: string
  itemClass?: string
  itemGroup?: string
  createdAt?: string
  updatedAt?: string
}

export interface RecipeBom {
  id: string
  revision?: string
  master?: boolean
  running?: boolean
  recipe?: Array<{
    id: string
    Recipe: string
    revision?: number
    whiskeyType?: string
  }>
  recipeBomITem?: Array<{
    id: string
    operation?: string
    quantity?: number
    isClassDefinition?: boolean
    item: {
      id: string
      itemName: string
      itemNumber: string
      itemDescription?: string
      itemType?: string
      itemClass?: string
      itemGroup?: string
    }
    displayUnits?: {
      id: string
      name: string
      abbreviation?: string
    }
  }>
  createdAt?: string
  updatedAt?: string
}

export interface EnzymeCalculation {
  id: string
  recipe?: Array<{
    id: string
    Recipe: string
    revision?: number
  }>
  recipeBomITem?: Array<{
    id: string
    quantity?: number
    item: {
      id: string
      itemName: string
      itemNumber: string
      itemType?: string
      itemClass?: string
      itemGroup?: string
    }
    displayUnits?: {
      id: string
      name: string
      abbreviation?: string
    }
  }>
  createdAt?: string
  updatedAt?: string
}

export interface Recipe {
  id: string
  Recipe: string
  revision?: number
  whiskeyType?: string
  active?: boolean
  customerCode?: string
  cooksPerFerm?: number
  globalId?: string
  schemaVersion?: string
  createdAt?: string
  updatedAt?: string
  customer?: {
    id: string
    name: string
    customerCode: string
  }
  mashingProtocol?: {
    id: string
    name: string
    revision?: number
    templateCategory?: string
    templateDescription?: string
    steps?: Array<{
      id: string
      index?: number
      stepType?: string
      holdType?: string
      stepTime?: number
      temperatureSetpoint?: number
      heatEnabled?: boolean
      coolEnabled?: boolean
      agitatorEnabled?: boolean
      promptMessage?: string
    }>
  }
  parameters?: Array<{
    id: string
    recipeParamName: string
    recipeParamDescription?: string
    recipeNumericalSetpoint?: number
    recipeSetpointType?: string
    recipeSetpointBooleanValue?: boolean
    required?: boolean
    active?: boolean
    units?: {
      id: string
      name: string
      abbreviation?: string
    }
  }>
}

export interface EnzymeDosingCalculationInput {
  recipeId: string
  revision?: string
  master?: boolean
  enzymeId: string
  batchSize: number
  targetActivity: number
  temperature?: number
  pH?: number
  notes?: string
}

// Custom hook for enzyme configurations
export function useEnzymeConfigurations() {
  return useQuery({
    queryKey: ['enzyme-configurations'],
    queryFn: async (): Promise<EnzymeConfiguration[]> => {
      const data = await unifiedGraphQLClient.query(GET_ENZYME_CONFIGURATIONS, {
        fetchPolicy: 'cache-first',
      }) as { items: EnzymeConfiguration[] }
      return data.items || []
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
}

// Custom hook for recipe BOMs
export function useRecipeBoms(recipeId?: string) {
  return useQuery({
    queryKey: ['recipe-boms', recipeId],
    queryFn: async (): Promise<RecipeBom[]> => {
      const data = await unifiedGraphQLClient.query(GET_RECIPE_BOMS, {
        variables: { recipeId },
        fetchPolicy: 'cache-first',
      }) as { recipeBoms: RecipeBom[] }
      return data.recipeBoms || []
    },
    enabled: !!recipeId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
}

// Custom hook for enzyme calculation history
export function useEnzymeCalculationHistory(limit = 50, offset = 0) {
  return useQuery({
    queryKey: ['enzyme-calculation-history', limit, offset],
    queryFn: async (): Promise<EnzymeCalculation[]> => {
      const data = await unifiedGraphQLClient.query(GET_ENZYME_CALCULATION_HISTORY, {
        variables: { limit, offset },
        fetchPolicy: 'cache-first',
      }) as { recipeBoms: EnzymeCalculation[] }
      
      // Filter for BOMs that contain enzyme items
      const enzymeCalculations = (data.recipeBoms || []).filter(bom => 
        bom.recipeBomITem?.some(item => 
          item.item.itemGroup?.includes('ENZ') || 
          item.item.itemType === 'ENZYME' ||
          item.item.itemClass === 'ENZYME'
        )
      )
      
      return enzymeCalculations
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
  })
}

// Custom hook for recipes (for enzyme dosing)
export function useRecipesForEnzymeDosing() {
  return useQuery({
    queryKey: ['recipes-for-enzyme-dosing'],
    queryFn: async (): Promise<Recipe[]> => {
      const data = await unifiedGraphQLClient.query(GET_RECIPES_FOR_ENZYME_DOSING, {
        fetchPolicy: 'cache-first',
      }) as { recipes: Recipe[] }
      return data.recipes || []
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
}

// Custom hook for enzyme dosing calculation
export function useEnzymeDosingCalculation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: EnzymeDosingCalculationInput): Promise<EnzymeCalculation> => {
      const data = await unifiedGraphQLClient.mutate(CALCULATE_ENZYME_DOSING, {
        variables: { input },
      }) as { calculateEnzymeDosing: EnzymeCalculation }
      return data.calculateEnzymeDosing
    },
    onSuccess: () => {
      // Invalidate and refetch calculation history
      queryClient.invalidateQueries({ queryKey: ['enzyme-calculation-history'] })
    },
    onError: (error) => {
      console.error('Error calculating enzyme dosing:', error)
    },
  })
}

// Utility functions for enzyme calculations
export const enzymeCalculationUtils = {
  // Calculate enzyme dosage based on activity and batch size
  calculateDosage: (
    targetActivity: number,
    batchSize: number,
    enzymeActivity: number,
    efficiency = 1.0
  ): number => {
    return (targetActivity * batchSize) / (enzymeActivity * efficiency)
  },

  // Calculate efficiency based on temperature
  calculateTemperatureEfficiency: (temperature: number, optimalTemp = 60): number => {
    const tempDiff = Math.abs(temperature - optimalTemp)
    return Math.max(0.1, 1 - (tempDiff * 0.02)) // 2% reduction per degree difference
  },

  // Calculate efficiency based on pH
  calculatePHEfficiency: (pH: number, optimalPH = 5.5): number => {
    const pHDiff = Math.abs(pH - optimalPH)
    return Math.max(0.1, 1 - (pHDiff * 0.1)) // 10% reduction per pH unit difference
  },

  // Get enzyme activity from specifications
  getEnzymeActivity: (enzyme: EnzymeConfiguration): number => {
    // Try to extract activity from item description or number (since specifications are not available)
    const description = enzyme.itemDescription || enzyme.itemNumber || ''
    const activityMatch = description.match(/(\d+(?:\.\d+)?)\s*(?:units?|u\/g|activity)/i)
    return activityMatch ? parseFloat(activityMatch[1] || '100') : 100 // Default activity
  },

  // Get enzyme optimal temperature from specifications
  getOptimalTemperature: (enzyme: EnzymeConfiguration): number => {
    // Since temperature specs aren't available, use defaults based on enzyme type
    const name = (enzyme.itemName || '').toLowerCase()
    if (name.includes('alpha') || name.includes('liquefaction')) return 85
    if (name.includes('gluco') || name.includes('saccharification')) return 60
    return 60 // Default temperature
  },

  // Get enzyme optimal pH from specifications
  getOptimalPH: (enzyme: EnzymeConfiguration): number => {
    // Since pH specs aren't available, use defaults based on enzyme type
    const name = (enzyme.itemName || '').toLowerCase()
    if (name.includes('alpha') || name.includes('liquefaction')) return 6.0
    if (name.includes('gluco') || name.includes('saccharification')) return 4.5
    return 5.5 // Default pH
  },

  // Format dosage for display
  formatDosage: (dosage: number, unit = 'g'): string => {
    if (dosage < 0.01) {
      return `${(dosage * 1000).toFixed(2)} m${unit}`
    }
    return `${dosage.toFixed(2)} ${unit}`
  },

  // Validate calculation input
  validateCalculationInput: (input: EnzymeDosingCalculationInput): string[] => {
    const errors: string[] = []
    
    if (!input.recipeId) errors.push('Recipe is required')
    if (!input.enzymeId) errors.push('Enzyme is required')
    if (input.batchSize <= 0) errors.push('Batch size must be greater than 0')
    if (input.targetActivity <= 0) errors.push('Target activity must be greater than 0')
    if (input.temperature && (input.temperature < 0 || input.temperature > 100)) {
      errors.push('Temperature must be between 0 and 100°C')
    }
    if (input.pH && (input.pH < 0 || input.pH > 14)) {
      errors.push('pH must be between 0 and 14')
    }
    
    return errors
  },
}

// Utility hook for refreshing all enzyme-related data
export function useRefreshEnzymeData() {
  const queryClient = useQueryClient()
  
  return () => {
    queryClient.invalidateQueries({ queryKey: ['enzyme-configurations'] })
    queryClient.invalidateQueries({ queryKey: ['enzyme-calculation-history'] })
    queryClient.invalidateQueries({ queryKey: ['recipes-for-enzyme-dosing'] })
    
    toast.success('Data Refreshed', {
      description: 'All enzyme dosing data has been refreshed',
    })
  }
} 