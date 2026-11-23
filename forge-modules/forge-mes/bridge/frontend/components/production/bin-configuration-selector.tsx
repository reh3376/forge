'use client'

import React from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, AlertTriangle, Package } from 'lucide-react'
import { useMillingBinConfigurations } from '@/hooks/use-milling-bin-configurations'

interface BinConfigurationSelectorProps {
  value?: string
  onValueChange: (value: string) => void
  label?: string
  placeholder?: string
  disabled?: boolean
  required?: boolean
  className?: string
  filterByItemGroup?: string // Optional filter to show only configs for specific item group
  filterByAsset?: string // Optional filter to show only configs for specific asset (e.g., "SIL-110")
}

export function BinConfigurationSelector({
  value,
  onValueChange,
  label = 'Bin Configuration',
  placeholder = 'Select a bin configuration...',
  disabled = false,
  required = false,
  className,
  filterByItemGroup,
  filterByAsset
}: BinConfigurationSelectorProps) {
  const {
    configurations,
    loading,
    error
  } = useMillingBinConfigurations()

  // Filter configurations based on props
  const filteredConfigurations = configurations?.filter(config => {
    if (filterByItemGroup && config.itemGroup.name !== filterByItemGroup) {
      return false
    }
    if (filterByAsset && config.bin.name !== filterByAsset) {
      return false
    }
    return true
  }) || []

  if (error) {
    return (
      <div className={className}>
        {label && (
          <Label className="text-sm font-medium">
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </Label>
        )}
        <Alert variant="destructive" className="mt-2">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Failed to load bin configurations. Please try again.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className={className}>
      {label && (
        <Label className="text-sm font-medium">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </Label>
      )}
      <Select
        value={value || ''}
        onValueChange={onValueChange}
        disabled={disabled || loading}
      >
        <SelectTrigger className="mt-2">
          <SelectValue placeholder={loading ? 'Loading...' : placeholder} />
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        </SelectTrigger>
        <SelectContent>
          {filteredConfigurations.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
              {filterByItemGroup 
                ? 'No bin configurations found for this item group'
                : 'No bin configurations available'
              }
            </div>
          ) : (
            filteredConfigurations.map((config) => (
              <SelectItem key={config.id} value={config.id}>
                <div className="flex items-center justify-between w-full">
                  <div className="flex-1">
                    <div className="font-medium">{config.bin.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {config.itemGroup.name}
                    </div>
                  </div>
                  <div className="ml-2">
                    {config.bin.assetType && (
                      <Badge variant="secondary" className="text-xs">
                        {config.bin.assetType}
                      </Badge>
                    )}
                  </div>
                </div>
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
      
      {/* Show selected configuration details */}
      {value && (
        <div className="mt-2 p-2 bg-muted rounded-md">
          {(() => {
            const selectedConfig = filteredConfigurations.find(c => c.id === value)
            if (!selectedConfig) return null
            
            return (
              <div className="text-sm">
                <div className="font-medium">
                  {selectedConfig.bin.name} → {selectedConfig.itemGroup.name}
                </div>
                {selectedConfig.bin.description && (
                  <div className="text-muted-foreground mt-1">
                    {selectedConfig.bin.description}
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}

// Hook to get bin configuration details by ID
export function useBinConfigurationDetails(configurationId?: string) {
  const { configurations, loading, error } = useMillingBinConfigurations()
  
  const configuration = React.useMemo(() => {
    if (!configurationId || !configurations.length) return null
    return configurations.find(c => c.id === configurationId) || null
  }, [configurationId, configurations])

  return {
    configuration,
    loading,
    error,
    isFound: !!configuration
  }
}

export default BinConfigurationSelector 