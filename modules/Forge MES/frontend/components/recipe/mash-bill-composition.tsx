'use client'

import React, { useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash2, AlertCircle, Loader2 } from 'lucide-react'
import { useGrainCharacters, getGrainCharacterLabel, getGrainCharacterCode, GrainCharacter } from '@/lib/hooks/use-grain-characters'

export interface MashBillComponent {
  grainCharacterId: string
  abbreviation: string
  percentage: number
  grainName?: string
}

interface MashBillCompositionProps {
  components: MashBillComponent[]
  onChange: (components: MashBillComponent[]) => void
  disabled?: boolean
}

export function MashBillComposition({ components, onChange, disabled = false }: MashBillCompositionProps) {
  const { grainCharacters, loading, error } = useGrainCharacters()

  // Calculate total percentage
  const totalPercentage = useMemo(() => {
    return components.reduce((sum, comp) => sum + (comp.percentage || 0), 0)
  }, [components])

  const isValid = Math.abs(totalPercentage - 100) < 0.01

  // Add a new grain component
  const handleAddComponent = useCallback(() => {
    const newComponent: MashBillComponent = {
      grainCharacterId: '',
      abbreviation: '',
      percentage: 0,
    }
    onChange([...components, newComponent])
  }, [components, onChange])

  // Remove a grain component
  const handleRemoveComponent = useCallback((index: number) => {
    const newComponents = components.filter((_, i) => i !== index)
    onChange(newComponents)
  }, [components, onChange])

  // Update a grain component
  const handleUpdateComponent = useCallback((index: number, updates: Partial<MashBillComponent>) => {
    const newComponents = components.map((comp, i) => {
      if (i === index) {
        return { ...comp, ...updates }
      }
      return comp
    })
    onChange(newComponents)
  }, [components, onChange])

  // Handle grain selection change
  const handleGrainSelect = useCallback((index: number, grainId: string) => {
    const selectedGrain = grainCharacters.find(g => g.id === grainId)
    if (selectedGrain) {
      handleUpdateComponent(index, {
        grainCharacterId: selectedGrain.id,
        abbreviation: selectedGrain.abbreviation,
        grainName: selectedGrain.name,
      })
    }
  }, [grainCharacters, handleUpdateComponent])

  // Handle percentage change
  const handlePercentageChange = useCallback((index: number, value: string) => {
    const percentage = parseFloat(value) || 0
    handleUpdateComponent(index, { percentage })
  }, [handleUpdateComponent])

  // Generate the new format pattern string (e.g., "75C-21R-4M")
  // Auto-assigns variety codes (1, 2, 3) when same grain appears multiple times
  const patternString = useMemo(() => {
    const validComponents = components.filter(comp => comp.percentage > 0 && comp.abbreviation)

    // Count occurrences of each abbreviation
    const abbrevCounts: Record<string, number> = {}
    const abbrevIndexes: Record<string, number> = {}

    // First pass: count how many of each grain
    validComponents.forEach(comp => {
      abbrevCounts[comp.abbreviation] = (abbrevCounts[comp.abbreviation] || 0) + 1
    })

    // Second pass: generate pattern with auto-numbered variety codes
    return validComponents
      .map(comp => {
        const count = abbrevCounts[comp.abbreviation] || 0
        if (count > 1) {
          // Multiple of same grain - auto-assign variety number
          abbrevIndexes[comp.abbreviation] = (abbrevIndexes[comp.abbreviation] || 0) + 1
          return `${comp.percentage}${comp.abbreviation}${abbrevIndexes[comp.abbreviation]}`
        } else {
          // Single grain - no variety code needed
          return `${comp.percentage}${comp.abbreviation}`
        }
      })
      .join('-')
  }, [components])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading grain characters...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center text-destructive py-4">
        <AlertCircle className="h-4 w-4 mr-2" />
        <span>Failed to load grain characters: {error.message}</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Mash Bill Composition (%)</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddComponent}
          disabled={disabled}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Grain
        </Button>
      </div>

      {/* Grain components list */}
      <div className="space-y-3">
        {components.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            No grains added. Click &quot;Add Grain&quot; to start building your mash bill.
          </p>
        ) : (
          components.map((component, index) => (
            <div key={index} className="flex items-center gap-3">
              {/* Grain selector */}
              <div className="flex-1">
                <Select
                  value={component.grainCharacterId}
                  onValueChange={(value: string) => handleGrainSelect(index, value)}
                  disabled={disabled}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select grain..." />
                  </SelectTrigger>
                  <SelectContent>
                    {grainCharacters.map((grain) => (
                      <SelectItem key={grain.id} value={grain.id}>
                        {getGrainCharacterLabel(grain)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Percentage input */}
              <div className="w-24">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={component.percentage || ''}
                  onChange={(e) => handlePercentageChange(index, e.target.value)}
                  placeholder="%"
                  disabled={disabled}
                  className="text-right"
                />
              </div>

              {/* Remove button */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => handleRemoveComponent(index)}
                disabled={disabled || components.length <= 1}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))
        )}
      </div>

      {/* Total and pattern display */}
      <div className="flex items-center justify-between pt-2 border-t">
        <div className="flex items-center gap-4">
          <span className="text-sm">
            Total:{' '}
            <span className={isValid ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>
              {totalPercentage}%
            </span>
          </span>
          {!isValid && totalPercentage > 0 && (
            <span className="text-xs text-red-500 flex items-center">
              <AlertCircle className="h-3 w-3 mr-1" />
              Must equal 100%
            </span>
          )}
        </div>
        {patternString && (
          <span className="text-sm text-muted-foreground">
            Pattern: {patternString}
          </span>
        )}
      </div>
    </div>
  )
}

// Helper to convert old MashBill format to new MashBillComponent array
export function convertLegacyMashBillToComponents(
  mashBill: { corn: number; rye: number; wheat: number; maltedBarley: number },
  grainCharacters: GrainCharacter[]
): MashBillComponent[] {
  const components: MashBillComponent[] = []

  const findGrainByAbbreviation = (abbr: string) =>
    grainCharacters.find(g => g.abbreviation === abbr && !g.varietyCode)

  if (mashBill.corn > 0) {
    const grain = findGrainByAbbreviation('C')
    components.push({
      grainCharacterId: grain?.id || '',
      abbreviation: 'C',
      percentage: mashBill.corn,
      grainName: grain?.name || 'Corn',
    })
  }

  if (mashBill.rye > 0) {
    const grain = findGrainByAbbreviation('R')
    components.push({
      grainCharacterId: grain?.id || '',
      abbreviation: 'R',
      percentage: mashBill.rye,
      grainName: grain?.name || 'Rye',
    })
  }

  if (mashBill.wheat > 0) {
    const grain = findGrainByAbbreviation('W')
    components.push({
      grainCharacterId: grain?.id || '',
      abbreviation: 'W',
      percentage: mashBill.wheat,
      grainName: grain?.name || 'Wheat',
    })
  }

  if (mashBill.maltedBarley > 0) {
    const grain = findGrainByAbbreviation('M')
    components.push({
      grainCharacterId: grain?.id || '',
      abbreviation: 'M',
      percentage: mashBill.maltedBarley,
      grainName: grain?.name || 'Malt',
    })
  }

  return components
}

// Helper to convert MashBillComponent array back to legacy format (for backward compatibility)
export function convertComponentsToLegacyMashBill(
  components: MashBillComponent[]
): { corn: number; rye: number; wheat: number; maltedBarley: number } {
  const mashBill = {
    corn: 0,
    rye: 0,
    wheat: 0,
    maltedBarley: 0,
  }

  for (const component of components) {
    switch (component.abbreviation) {
      case 'C':
        mashBill.corn += component.percentage
        break
      case 'R':
      case 'Y': // Malted Rye counted as Rye
        mashBill.rye += component.percentage
        break
      case 'W':
        mashBill.wheat += component.percentage
        break
      case 'M':
        mashBill.maltedBarley += component.percentage
        break
      // Other grains (S, B, O, Z) are not represented in legacy MashBill
    }
  }

  return mashBill
}
