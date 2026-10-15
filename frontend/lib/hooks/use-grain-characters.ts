'use client'

import { useQuery, useMutation } from '@apollo/client'
import { apolloClient } from '../api/unified-graphql-client'
import {
  GET_ACTIVE_GRAIN_CHARACTERS,
  GET_ALL_GRAIN_CHARACTERS,
  GET_GRAIN_CHARACTER_USAGE,
  CREATE_GRAIN_CHARACTER,
  UPDATE_GRAIN_CHARACTER,
  DELETE_GRAIN_CHARACTER,
  SET_GRAIN_CHARACTER_ACTIVE,
} from '@/lib/api/graphql-queries'

export interface GrainCharacter {
  id: string
  abbreviation: string
  name: string
  varietyCode?: string | null
  description?: string | null
  active: boolean
  itemGroups?: Array<{
    id: string
    name: string
  }>
}

export function useGrainCharacters() {
  const { data, loading, error, refetch } = useQuery(GET_ACTIVE_GRAIN_CHARACTERS, {
    client: apolloClient,
    errorPolicy: 'all',
    notifyOnNetworkStatusChange: true,
  })

  // Process the grain characters
  const grainCharacters: GrainCharacter[] = data?.activeGrainCharacters || []

  // Sort by grain type, then abbreviation, then variety code
  const sortedGrainCharacters = [...grainCharacters].sort((a, b) => {
    // Sort by abbreviation
    if (a.abbreviation !== b.abbreviation) {
      return a.abbreviation.localeCompare(b.abbreviation)
    }
    // Then by variety code (null/undefined comes first)
    const aVariety = a.varietyCode || ''
    const bVariety = b.varietyCode || ''
    return aVariety.localeCompare(bVariety)
  })

  return {
    grainCharacters: sortedGrainCharacters,
    loading,
    error,
    refetch,
  }
}

// Hook for all grain characters (including inactive)
export function useAllGrainCharacters() {
  const { data, loading, error, refetch } = useQuery(GET_ALL_GRAIN_CHARACTERS, {
    client: apolloClient,
    errorPolicy: 'all',
    notifyOnNetworkStatusChange: true,
  })

  const grainCharacters: GrainCharacter[] = data?.grainCharacters || []

  const sortedGrainCharacters = [...grainCharacters].sort((a, b) => {
    if (a.abbreviation !== b.abbreviation) {
      return a.abbreviation.localeCompare(b.abbreviation)
    }
    const aVariety = a.varietyCode || ''
    const bVariety = b.varietyCode || ''
    return aVariety.localeCompare(bVariety)
  })

  return {
    grainCharacters: sortedGrainCharacters,
    loading,
    error,
    refetch,
  }
}

// Usage info interface
export interface GrainCharacterUsage {
  recipeCount: number
  activeRecipeCount: number
  canDelete: boolean
  canModify: boolean
}

// Hook for grain character mutations
export function useGrainCharacterMutations() {
  const [createMutation, { loading: createLoading }] = useMutation(CREATE_GRAIN_CHARACTER, {
    client: apolloClient,
    refetchQueries: [GET_ALL_GRAIN_CHARACTERS, GET_ACTIVE_GRAIN_CHARACTERS],
  })

  const [updateMutation, { loading: updateLoading }] = useMutation(UPDATE_GRAIN_CHARACTER, {
    client: apolloClient,
    refetchQueries: [GET_ALL_GRAIN_CHARACTERS, GET_ACTIVE_GRAIN_CHARACTERS],
  })

  const [deleteMutation, { loading: deleteLoading }] = useMutation(DELETE_GRAIN_CHARACTER, {
    client: apolloClient,
    refetchQueries: [GET_ALL_GRAIN_CHARACTERS, GET_ACTIVE_GRAIN_CHARACTERS],
  })

  const [setActiveMutation, { loading: setActiveLoading }] = useMutation(SET_GRAIN_CHARACTER_ACTIVE, {
    client: apolloClient,
    refetchQueries: [GET_ALL_GRAIN_CHARACTERS, GET_ACTIVE_GRAIN_CHARACTERS],
  })

  const createGrainCharacter = async (data: {
    abbreviation: string
    name: string
    varietyCode?: string | null
    description?: string | null
    active?: boolean
  }) => {
    const result = await createMutation({ variables: { data } })
    return result.data?.createGrainCharacter
  }

  const updateGrainCharacter = async (
    id: string,
    data: {
      abbreviation?: string
      name?: string
      varietyCode?: string | null
      description?: string | null
      active?: boolean
    }
  ) => {
    const result = await updateMutation({ variables: { id, data } })
    return result.data?.updateGrainCharacter
  }

  const deleteGrainCharacter = async (id: string) => {
    const result = await deleteMutation({ variables: { id } })
    return result.data?.deleteGrainCharacter
  }

  const setGrainCharacterActive = async (id: string, active: boolean) => {
    const result = await setActiveMutation({ variables: { id, active } })
    return result.data?.setGrainCharacterActive
  }

  return {
    createGrainCharacter,
    updateGrainCharacter,
    deleteGrainCharacter,
    setGrainCharacterActive,
    loading: createLoading || updateLoading || deleteLoading || setActiveLoading,
  }
}

// Hook for getting usage info for a specific grain character
export function useGrainCharacterUsage(id: string | null) {
  const { data, loading, error, refetch } = useQuery(GET_GRAIN_CHARACTER_USAGE, {
    client: apolloClient,
    variables: { id },
    skip: !id,
    errorPolicy: 'all',
  })

  const usage: GrainCharacterUsage | null = data?.grainCharacterUsage || null

  return {
    usage,
    loading,
    error,
    refetch,
  }
}

// Helper to get display label for a grain character
export function getGrainCharacterLabel(grain: GrainCharacter): string {
  const label = grain.varietyCode
    ? `${grain.abbreviation}${grain.varietyCode} - ${grain.name}`
    : `${grain.abbreviation} - ${grain.name}`
  return label
}

// Helper to get the code (abbreviation + variety) for a grain
export function getGrainCharacterCode(grain: GrainCharacter): string {
  return grain.varietyCode
    ? `${grain.abbreviation}${grain.varietyCode}`
    : grain.abbreviation
}
