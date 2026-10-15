import { useState, useCallback } from 'react'
import { useApolloClient } from '@apollo/client'
import type { ApolloClient, NormalizedCacheObject } from '@apollo/client'
import {
  calculateEnzymeDosing,
  calculateEnzymeDosingByRecipe,
  calculateEnzymeDosingByMashBill,
  calculateMultipleEnzymeDosings,
  getEnzymeConfigurations,
  getEnzymeItems,
  generateEnzymeRecommendations,
  formatMashBill,
  parseMashBill,
  type EnzymeDosingInput,
  type EnzymeDosingByRecipeInput,
  type EnzymeDosingByMashBillInput,
  type EnzymeDosingResult,
  type EnzymeConfiguration,
  type EnzymeItem,
  type RecipeBomEnzymeItem
} from '../lib/utils/enzyme-dosing'

interface UseEnzymeDosingState {
  loading: boolean
  error: string | null
  enzymeConfigurations: EnzymeConfiguration[]
  enzymeItems: EnzymeItem[]
}

interface UseEnzymeDosingReturn extends UseEnzymeDosingState {
  // Single enzyme dosing calculation (auto-detects mode)
  calculateSingleEnzymeDosing: (input: EnzymeDosingInput) => Promise<EnzymeDosingResult | null>
  
  // Mode-specific calculations
  calculateEnzymeDosingForRecipe: (input: EnzymeDosingByRecipeInput) => Promise<EnzymeDosingResult | null>
  calculateEnzymeDosingForMashBill: (input: EnzymeDosingByMashBillInput) => Promise<EnzymeDosingResult | null>
  
  // Multiple enzyme dosing calculations
  calculateMultipleEnzymeDosings: (recipeId: string, enzymeItemIds: string[]) => Promise<EnzymeDosingResult[]>
  
  // Data fetching
  fetchEnzymeConfigurations: () => Promise<void>
  fetchEnzymeItems: () => Promise<void>
  
  // Recipe BOM generation
  generateRecommendations: (input: EnzymeDosingInput, totalGrainWeight?: number) => Promise<RecipeBomEnzymeItem[]>
  
  // Utility functions
  formatMashBill: (corn: number, rye: number, wheat: number, malt: number) => string
  parseMashBill: (mashBill: string) => { corn: number, rye: number, wheat: number, malt: number }
  
  // Error handling
  clearError: () => void
}

export function useEnzymeDosing(): UseEnzymeDosingReturn {
  const apolloClient = useApolloClient() as ApolloClient<NormalizedCacheObject>
  
  const [state, setState] = useState<UseEnzymeDosingState>({
    loading: false,
    error: null,
    enzymeConfigurations: [],
    enzymeItems: []
  })

  const setLoading = useCallback((loading: boolean) => {
    setState(prev => ({ ...prev, loading }))
  }, [])

  const setError = useCallback((error: string | null) => {
    setState(prev => ({ ...prev, error }))
  }, [])

  const clearError = useCallback(() => {
    setError(null)
  }, [setError])

  // Single enzyme dosing calculation (auto-detects mode)
  const calculateSingleEnzymeDosing = useCallback(async (input: EnzymeDosingInput): Promise<EnzymeDosingResult | null> => {
    setLoading(true)
    setError(null)
    
    try {
      const result = await calculateEnzymeDosing(apolloClient, input)
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to calculate enzyme dosing'
      setError(errorMessage)
      return null
    } finally {
      setLoading(false)
    }
  }, [apolloClient, setLoading, setError])

  // Mode-specific calculations
  const calculateEnzymeDosingForRecipe = useCallback(async (input: EnzymeDosingByRecipeInput): Promise<EnzymeDosingResult | null> => {
    setLoading(true)
    setError(null)
    
    try {
      const result = await calculateEnzymeDosingByRecipe(apolloClient, input)
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to calculate enzyme dosing for recipe'
      setError(errorMessage)
      return null
    } finally {
      setLoading(false)
    }
  }, [apolloClient, setLoading, setError])

  const calculateEnzymeDosingForMashBill = useCallback(async (input: EnzymeDosingByMashBillInput): Promise<EnzymeDosingResult | null> => {
    setLoading(true)
    setError(null)
    
    try {
      const result = await calculateEnzymeDosingByMashBill(apolloClient, input)
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to calculate enzyme dosing for mash bill'
      setError(errorMessage)
      return null
    } finally {
      setLoading(false)
    }
  }, [apolloClient, setLoading, setError])

  // Multiple enzyme dosing calculations
  const calculateMultipleEnzymeDosingsFn = useCallback(async (recipeId: string, enzymeItemIds: string[]): Promise<EnzymeDosingResult[]> => {
    setLoading(true)
    setError(null)
    
    try {
      const results = await calculateMultipleEnzymeDosings(apolloClient, recipeId, enzymeItemIds)
      return results
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to calculate multiple enzyme dosings'
      setError(errorMessage)
      return []
    } finally {
      setLoading(false)
    }
  }, [apolloClient, setLoading, setError])

  // Data fetching functions
  const fetchEnzymeConfigurations = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    try {
      const configurations = await getEnzymeConfigurations(apolloClient)
      setState(prev => ({ ...prev, enzymeConfigurations: configurations }))
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch enzyme configurations'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [apolloClient, setLoading, setError])

  const fetchEnzymeItems = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    try {
      const items = await getEnzymeItems(apolloClient)
      setState(prev => ({ ...prev, enzymeItems: items }))
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch enzyme items'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [apolloClient, setLoading, setError])

  // Recipe BOM generation
  const generateRecommendationsFn = useCallback(async (input: EnzymeDosingInput, totalGrainWeight: number = 18000): Promise<RecipeBomEnzymeItem[]> => {
    setLoading(true)
    setError(null)
    
    try {
      const recommendations = await generateEnzymeRecommendations(apolloClient, input, totalGrainWeight)
      return recommendations
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate enzyme recommendations'
      setError(errorMessage)
      return []
    } finally {
      setLoading(false)
    }
  }, [apolloClient, setLoading, setError])

  return {
    ...state,
    calculateSingleEnzymeDosing,
    calculateEnzymeDosingForRecipe,
    calculateEnzymeDosingForMashBill,
    calculateMultipleEnzymeDosings: calculateMultipleEnzymeDosingsFn,
    fetchEnzymeConfigurations,
    fetchEnzymeItems,
    generateRecommendations: generateRecommendationsFn,
    formatMashBill,
    parseMashBill,
    clearError
  }
} 