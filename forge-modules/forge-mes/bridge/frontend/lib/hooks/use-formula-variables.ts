'use client'

import { useQuery, useMutation } from '@apollo/client'
import { apolloClient } from '../api/unified-graphql-client'
import {
  GET_FORMULA_VARIABLES,
  GET_ALL_FORMULA_VARIABLES,
  CREATE_FORMULA_VARIABLE,
  UPDATE_FORMULA_VARIABLE,
  DELETE_FORMULA_VARIABLE,
  FormulaVariable,
} from '@/lib/api/formula-config-queries'

/**
 * Hook for fetching active formula variables
 */
export function useFormulaVariables() {
  const { data, loading, error, refetch } = useQuery(GET_FORMULA_VARIABLES, {
    client: apolloClient,
    errorPolicy: 'all',
    notifyOnNetworkStatusChange: true,
  })

  const variables: FormulaVariable[] = data?.formulaVariables || []

  // Group by category for organized display
  const variablesByCategory = variables.reduce((acc, variable) => {
    const category = variable.category || 'General'
    if (!acc[category]) acc[category] = []
    acc[category].push(variable)
    return acc
  }, {} as Record<string, FormulaVariable[]>)

  // Get sorted categories
  const categories = Object.keys(variablesByCategory).sort()

  return {
    variables,
    variablesByCategory,
    categories,
    loading,
    error,
    refetch,
  }
}

/**
 * Hook for fetching all formula variables (including inactive) - for admin use
 */
export function useAllFormulaVariables() {
  const { data, loading, error, refetch } = useQuery(GET_ALL_FORMULA_VARIABLES, {
    client: apolloClient,
    errorPolicy: 'all',
    notifyOnNetworkStatusChange: true,
  })

  const variables: FormulaVariable[] = data?.formulaVariablesAll || []

  const variablesByCategory = variables.reduce((acc, variable) => {
    const category = variable.category || 'General'
    if (!acc[category]) acc[category] = []
    acc[category].push(variable)
    return acc
  }, {} as Record<string, FormulaVariable[]>)

  const categories = Object.keys(variablesByCategory).sort()

  return {
    variables,
    variablesByCategory,
    categories,
    loading,
    error,
    refetch,
  }
}

/**
 * Hook for formula variable mutations
 */
export function useFormulaVariableMutations() {
  const [createMutation, { loading: createLoading }] = useMutation(CREATE_FORMULA_VARIABLE, {
    client: apolloClient,
    refetchQueries: [GET_FORMULA_VARIABLES, GET_ALL_FORMULA_VARIABLES],
  })

  const [updateMutation, { loading: updateLoading }] = useMutation(UPDATE_FORMULA_VARIABLE, {
    client: apolloClient,
    refetchQueries: [GET_FORMULA_VARIABLES, GET_ALL_FORMULA_VARIABLES],
  })

  const [deleteMutation, { loading: deleteLoading }] = useMutation(DELETE_FORMULA_VARIABLE, {
    client: apolloClient,
    refetchQueries: [GET_FORMULA_VARIABLES, GET_ALL_FORMULA_VARIABLES],
  })

  const createVariable = async (input: {
    name: string
    displayName: string
    description?: string
    type?: string
    defaultValue?: string
    category?: string
    sortOrder?: number
  }) => {
    const result = await createMutation({ variables: { input } })
    return result.data?.createFormulaVariable
  }

  const updateVariable = async (
    id: string,
    input: {
      name?: string
      displayName?: string
      description?: string
      type?: string
      defaultValue?: string
      category?: string
      sortOrder?: number
      isActive?: boolean
    }
  ) => {
    const result = await updateMutation({ variables: { id, input } })
    return result.data?.updateFormulaVariable
  }

  const deleteVariable = async (id: string) => {
    const result = await deleteMutation({ variables: { id } })
    return result.data?.deleteFormulaVariable
  }

  return {
    createVariable,
    updateVariable,
    deleteVariable,
    loading: createLoading || updateLoading || deleteLoading,
  }
}

export type { FormulaVariable }
