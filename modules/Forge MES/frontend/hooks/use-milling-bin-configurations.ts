import { useState, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { unifiedGraphQLClient } from '@/lib/api/unified-graphql-client'
import {
  GET_MILLING_BIN_CONFIGURATIONS,
  GET_AVAILABLE_ASSETS,
  GET_AVAILABLE_ITEM_GROUPS,
  CREATE_MILLING_BIN_CONFIGURATION,
  UPDATE_MILLING_BIN_CONFIGURATION,
  DELETE_MILLING_BIN_CONFIGURATION,
  type MillingBinConfiguration,
  type Asset,
  type MillingBinConfigurationUpdateInput,
  type GetMillingBinConfigurationsResult,
  type GetAvailableAssetsResult,
  type GetAvailableItemGroupsResult,
  type CreateMillingBinConfigurationResult,
  type UpdateMillingBinConfigurationResult,
  type DeleteMillingBinConfigurationResult
} from '@/lib/api/graphql/milling-bin-configuration'

export interface UseMillingBinConfigurationsOptions {
  onSuccess?: (message: string) => void
  onError?: (error: string) => void
}

interface ItemGroup {
  id: string
  name: string
  description?: string
  createdAt: string
  updatedAt: string
}

export function useMillingBinConfigurations(options: UseMillingBinConfigurationsOptions = {}) {
  const [isLoading, setIsLoading] = useState(false)
  const [configurations, setConfigurations] = useState<MillingBinConfiguration[]>([])
  const [assets, setAssets] = useState<Asset[]>([])
  const [itemGroups, setItemGroups] = useState<ItemGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // Load all data
  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    try {
      // Load configurations, assets, and item groups in parallel
      const [configurationsData, assetsData, itemGroupsData] = await Promise.all([
        unifiedGraphQLClient.query<GetMillingBinConfigurationsResult>(GET_MILLING_BIN_CONFIGURATIONS),
        unifiedGraphQLClient.query<GetAvailableAssetsResult>(GET_AVAILABLE_ASSETS),
        unifiedGraphQLClient.query<GetAvailableItemGroupsResult>(GET_AVAILABLE_ITEM_GROUPS)
      ])

      setConfigurations(configurationsData.millingBinConfigurations || [])
      setAssets(assetsData.assets || [])
      setItemGroups(itemGroupsData.itemGroups || [])
    } catch (err) {
      console.error('Error loading bin configuration data:', err)
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(new Error(errorMessage))
      options.onError?.(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [])

  // Load data on mount
  useEffect(() => {
    loadData()
  }, [loadData])

  // Create configuration
  const createConfiguration = useCallback(async (binId: string, itemGroupId: string) => {
    setIsLoading(true)
    
    try {
      // Add timeout to prevent hanging
      const createPromise = unifiedGraphQLClient.mutate<CreateMillingBinConfigurationResult>(CREATE_MILLING_BIN_CONFIGURATION, {
        variables: {
          data: {
            bin: { connect: { id: binId } },
            itemGroup: { connect: { id: itemGroupId } }
          }
        }
      })

      // Set a 30-second timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out after 30 seconds')), 30000)
      })

      await Promise.race([createPromise, timeoutPromise])
      
      options.onSuccess?.('Bin configuration created successfully')
      toast.success('Bin configuration created successfully')
      
      // Reload data
      await loadData()
    } catch (error) {
      console.error('Error creating milling bin configuration:', error)
      const errorMessage = `Failed to create configuration: ${error instanceof Error ? error.message : 'Unknown error'}`
      options.onError?.(errorMessage)
      toast.error(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [loadData])

  // Update configuration
  const updateConfiguration = useCallback(async (
    id: string, 
    binId?: string, 
    itemGroupId?: string
  ) => {
    setIsLoading(true)
    try {
      const updateData: MillingBinConfigurationUpdateInput = {}
      
      if (binId) {
        updateData.bin = { connect: { id: binId } }
      }
      
      if (itemGroupId) {
        updateData.itemGroup = { connect: { id: itemGroupId } }
      }

      await unifiedGraphQLClient.mutate<UpdateMillingBinConfigurationResult>(UPDATE_MILLING_BIN_CONFIGURATION, {
        variables: {
          where: { id },
          data: updateData
        }
      })
      
      options.onSuccess?.('Bin configuration updated successfully')
      toast.success('Bin configuration updated successfully')
      
      // Reload data
      await loadData()
    } catch (error) {
      console.error('Error updating milling bin configuration:', error)
      const errorMessage = `Failed to update configuration: ${error instanceof Error ? error.message : 'Unknown error'}`
      options.onError?.(errorMessage)
      toast.error(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [loadData])

  // Delete configuration
  const deleteConfiguration = useCallback(async (id: string) => {
    setIsLoading(true)
    try {
      await unifiedGraphQLClient.mutate<DeleteMillingBinConfigurationResult>(DELETE_MILLING_BIN_CONFIGURATION, {
        variables: {
          where: { id }
        }
      })
      
      options.onSuccess?.('Bin configuration deleted successfully')
      toast.success('Bin configuration deleted successfully')
      
      // Reload data
      await loadData()
    } catch (error) {
      console.error('Error deleting milling bin configuration:', error)
      const errorMessage = `Failed to delete configuration: ${error instanceof Error ? error.message : 'Unknown error'}`
      options.onError?.(errorMessage)
      toast.error(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [loadData])

  // Refresh all data
  const refresh = useCallback(async () => {
    await loadData()
  }, [loadData])

  // Helper function to check if a bin is already configured
  const isBinConfigured = useCallback((binId: string): boolean => {
    return configurations.some(config => config.bin.id === binId)
  }, [configurations])

  // Helper function to get configuration by bin ID
  const getConfigurationByBinId = useCallback((binId: string): MillingBinConfiguration | undefined => {
    return configurations.find(config => config.bin.id === binId)
  }, [configurations])

  // Helper function to get available (unconfigured) assets
  const getAvailableAssets = useCallback((): Asset[] => {
    if (!assets || !configurations) {
      return assets || []
    }

    const configuredBinIds = new Set(
      configurations.map(config => config.bin.id)
    )

    // Filter to only show SIL-115, SIL-120, and SIL-125
    const allowedAssetNames = ['SIL-110','SIL-115', 'SIL-120']

    return assets.filter(asset => 
      !configuredBinIds.has(asset.id) && 
      allowedAssetNames.includes(asset.name)
    )
  }, [assets, configurations])

  return {
    // Data
    configurations,
    assets,
    itemGroups,
    availableAssets: getAvailableAssets(),

    // Loading states
    loading: loading || isLoading,
    configurationsLoading: loading,
    assetsLoading: loading,
    itemGroupsLoading: loading,

    // Error states
    error,
    configurationsError: error,
    assetsError: error,
    itemGroupsError: error,

    // Actions
    createConfiguration,
    updateConfiguration,
    deleteConfiguration,
    refresh,

    // Helpers
    isBinConfigured,
    getConfigurationByBinId
  }
} 