'use client'

import { useQuery, useMutation } from '@apollo/client'
import { apolloClient } from '../api/unified-graphql-client'
import {
  GET_FORMULA_FUNCTIONS,
  GET_ALL_FORMULA_FUNCTIONS,
  CREATE_FORMULA_FUNCTION,
  UPDATE_FORMULA_FUNCTION,
  DELETE_FORMULA_FUNCTION,
  FormulaFunction,
} from '@/lib/api/formula-config-queries'

/**
 * Hook for fetching active formula functions
 */
export function useFormulaFunctions() {
  const { data, loading, error, refetch } = useQuery(GET_FORMULA_FUNCTIONS, {
    client: apolloClient,
    errorPolicy: 'all',
    notifyOnNetworkStatusChange: true,
  })

  const functions: FormulaFunction[] = data?.formulaFunctions || []

  // Group by category for organized display
  const functionsByCategory = functions.reduce((acc, func) => {
    const category = func.category || 'Math'
    if (!acc[category]) acc[category] = []
    acc[category].push(func)
    return acc
  }, {} as Record<string, FormulaFunction[]>)

  // Get sorted categories
  const categories = Object.keys(functionsByCategory).sort()

  return {
    functions,
    functionsByCategory,
    categories,
    loading,
    error,
    refetch,
  }
}

/**
 * Hook for fetching all formula functions (including inactive) - for admin use
 */
export function useAllFormulaFunctions() {
  const { data, loading, error, refetch } = useQuery(GET_ALL_FORMULA_FUNCTIONS, {
    client: apolloClient,
    errorPolicy: 'all',
    notifyOnNetworkStatusChange: true,
  })

  const functions: FormulaFunction[] = data?.formulaFunctionsAll || []

  const functionsByCategory = functions.reduce((acc, func) => {
    const category = func.category || 'Math'
    if (!acc[category]) acc[category] = []
    acc[category].push(func)
    return acc
  }, {} as Record<string, FormulaFunction[]>)

  const categories = Object.keys(functionsByCategory).sort()

  return {
    functions,
    functionsByCategory,
    categories,
    loading,
    error,
    refetch,
  }
}

/**
 * Hook for formula function mutations
 */
export function useFormulaFunctionMutations() {
  const [createMutation, { loading: createLoading }] = useMutation(CREATE_FORMULA_FUNCTION, {
    client: apolloClient,
    refetchQueries: [GET_FORMULA_FUNCTIONS, GET_ALL_FORMULA_FUNCTIONS],
  })

  const [updateMutation, { loading: updateLoading }] = useMutation(UPDATE_FORMULA_FUNCTION, {
    client: apolloClient,
    refetchQueries: [GET_FORMULA_FUNCTIONS, GET_ALL_FORMULA_FUNCTIONS],
  })

  const [deleteMutation, { loading: deleteLoading }] = useMutation(DELETE_FORMULA_FUNCTION, {
    client: apolloClient,
    refetchQueries: [GET_FORMULA_FUNCTIONS, GET_ALL_FORMULA_FUNCTIONS],
  })

  const createFunction = async (input: {
    name: string
    syntax: string
    description?: string
    category?: string
    exampleUsage?: string
    sortOrder?: number
  }) => {
    const result = await createMutation({ variables: { input } })
    return result.data?.createFormulaFunction
  }

  const updateFunction = async (
    id: string,
    input: {
      name?: string
      syntax?: string
      description?: string
      category?: string
      exampleUsage?: string
      sortOrder?: number
      isActive?: boolean
    }
  ) => {
    const result = await updateMutation({ variables: { id, input } })
    return result.data?.updateFormulaFunction
  }

  const deleteFunction = async (id: string) => {
    const result = await deleteMutation({ variables: { id } })
    return result.data?.deleteFormulaFunction
  }

  return {
    createFunction,
    updateFunction,
    deleteFunction,
    loading: createLoading || updateLoading || deleteLoading,
  }
}

export type { FormulaFunction }
