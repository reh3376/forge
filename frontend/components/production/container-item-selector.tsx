'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { SearchableSelect, type SearchableSelectOption } from '@/components/ui/searchable-select'
import { Label } from '@/components/ui/label'
import { CheckCircle, AlertCircle } from 'lucide-react'
import { unifiedSchedulingClient, type ContainerItem } from '@/lib/api/unified-scheduling-client'
import { toast } from 'sonner'

interface ContainerItemSelectorProps {
  value?: string
  onValueChange?: (value: string) => void
  containerType?: string
  label?: string
  placeholder?: string
  required?: boolean
  disabled?: boolean
  className?: string
  error?: string
}

export function ContainerItemSelector({
  value,
  onValueChange,
  containerType,
  label = "Container Item",
  placeholder = "Select container item",
  required = false,
  disabled = false,
  className = "",
  error
}: ContainerItemSelectorProps) {
  const [containerItems, setContainerItems] = useState<ContainerItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Determine if container item selection is required based on container type
  const requiresContainerItem = ['LargeBarrel', 'SmallBarrel'].includes(containerType || '')
  const isDisabled = disabled || !requiresContainerItem

  // Fetch container items when component mounts or container type changes
  useEffect(() => {
    const fetchContainerItems = async () => {
      if (!containerType || !requiresContainerItem) {
        setContainerItems([])
        return
      }

      setLoading(true)
      setLoadError(null)
      
      try {
        // Fetch container items for the specific container type
        const items = await unifiedSchedulingClient.getContainerItemsByType(containerType)
        setContainerItems(items)
      } catch (error) {
        console.error('Error fetching container items:', error)
        setLoadError('Failed to load container items')
        toast.error('Failed to load container items')
      } finally {
        setLoading(false)
      }
    }

    fetchContainerItems()
  }, [containerType, requiresContainerItem])

  // Clear selection when container type changes to one that doesn't require items
  useEffect(() => {
    if (!requiresContainerItem && value) {
      onValueChange?.('')
    }
  }, [requiresContainerItem, value, onValueChange])

  // Filter items based on container type compatibility
  const compatibleItems = containerItems.filter(item => {
    if (!containerType) return false
    
    const itemGroupName = item.itemGroup?.toLowerCase() || ''
    
    switch (containerType) {
      case 'LargeBarrel':
        return itemGroupName.includes('barrel') && itemGroupName.includes('53')
      case 'SmallBarrel':
        return itemGroupName.includes('barrel') && itemGroupName.includes('30')
      default:
        return false
    }
  })

  // Get display name for container type
  const getContainerTypeDisplayName = (type: string) => {
    switch (type) {
      case 'LargeBarrel':
        return '53-Gallon Barrel'
      case 'SmallBarrel':
        return '30-Gallon Barrel'
      case 'BulkLoadout':
        return 'Bulk Loadout'
      case 'PlasticDrum':
        return 'Plastic Drum'
      case 'IbcTote275':
        return '275-Gallon IBC Tote'
      case 'SsTote275':
        return '275-Gallon SS Tote'
      default:
        return type
    }
  }

  // Get the selected item for display
  const selectedItem = compatibleItems.find(item => item.id === value)

  // Convert container items to SearchableSelect options
  const selectOptions: SearchableSelectOption[] = useMemo(() => {
    return compatibleItems.map(item => ({
      value: item.id,
      label: item.itemName,
      description: item.itemNumber,
    }))
  }, [compatibleItems])

  // Determine placeholder text
  const placeholderText = !containerType
    ? "Select container type first"
    : !requiresContainerItem
      ? `Not required for ${getContainerTypeDisplayName(containerType)}`
      : compatibleItems.length === 0 && !loading
        ? "No compatible items found"
        : placeholder

  return (
    <div className={`space-y-2 ${className}`}>
      <Label htmlFor="containerItem">
        {label} {required && requiresContainerItem && '*'}
        {containerType && !requiresContainerItem && (
          <span className="text-muted-foreground ml-1">(not required)</span>
        )}
      </Label>

      <SearchableSelect
        options={selectOptions}
        value={value || ''}
        onValueChange={onValueChange || (() => {})}
        placeholder={placeholderText}
        searchPlaceholder="Search container items..."
        emptyMessage={loadError || 'No compatible container items available'}
        disabled={isDisabled || loading}
        loading={loading}
        className={error ? 'border-red-500' : ''}
      />

      {/* Status Messages */}
      {containerType && requiresContainerItem && !value && (
        <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
          <AlertCircle className="h-4 w-4" />
          <span>Container item selection required for {getContainerTypeDisplayName(containerType)}</span>
        </div>
      )}

      {containerType && !requiresContainerItem && (
        <div className="flex items-center gap-2 p-2 bg-gray-50 border border-gray-200 rounded text-sm text-gray-600">
          <span>Container items are not required for {getContainerTypeDisplayName(containerType)}</span>
        </div>
      )}

      {selectedItem && (
        <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded text-sm text-green-800">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <span>
            {selectedItem.itemName} ({selectedItem.itemNumber}) selected for {getContainerTypeDisplayName(containerType || '')}
          </span>
        </div>
      )}

      {loadError && (
        <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-800">
          <AlertCircle className="h-4 w-4" />
          <span>{loadError}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-800">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      {/* Info for developers */}
      {process.env.NODE_ENV === 'development' && compatibleItems.length > 0 && (
        <div className="text-xs text-muted-foreground">
          Found {compatibleItems.length} compatible container item(s) for {containerType}
        </div>
      )}
    </div>
  )
}