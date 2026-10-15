'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { WizardStepProps } from './recipe-wizard'
import { RecipeBOMEditor, RecipeIngredient } from '@/components/ui/recipe-components'
import { autoPopulateBOMItemsFromDatabase, isBOMAutoPopulated, getDefaultAutoPopulateOptions, type MashBill } from '@/lib/utils/recipe-auto-populate'
import { formatMashBill } from '@/lib/utils/enzyme-dosing'
import { Button } from '@/components/ui/button'
import { Wand2, RotateCcw } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

// Types for BOM step data
export interface RecipeBOMData {
  ingredients: RecipeIngredient[]
}

// Helper function to convert MashBill object to string format for API
const formatMashBillForAPI = (mashBill: MashBill | null): string | undefined => {
  if (!mashBill) return undefined
  return formatMashBill(mashBill.corn, mashBill.rye, mashBill.wheat, mashBill.maltedBarley)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function RecipeBOMStep({ data, onDataChange, onValidationChange, onWizardDataChange, allWizardData, mode = 'create' }: WizardStepProps) {
  // mode parameter available for future use to distinguish between create/edit contexts
  const typedData = data as Partial<RecipeBOMData>
  const [formData, setFormData] = useState<RecipeBOMData>({
    ingredients: [],
    ...typedData
  })
  const [hasAutoPopulated, setHasAutoPopulated] = useState(false)

  const isUpdatingRef = useRef(false)
  const lastValidationResultRef = useRef<boolean | null>(null)

  // Get mash bill data from wizard context (details step)
  const getMashBillFromWizard = useCallback((): MashBill | null => {
    if (!allWizardData?.['details']) return null
    
    const detailsData = allWizardData['details'] as Record<string, unknown>
    if (detailsData?.['mashBill']) {
      return detailsData['mashBill'] as MashBill
    }
    
    return null
  }, [allWizardData])

  // Auto-populate BOM items based on mash bill
  const handleAutoPopulate = useCallback(async (mashBill?: MashBill) => {
    const targetMashBill = mashBill || getMashBillFromWizard()
    
    if (!targetMashBill) {
      console.warn('No mash bill data available for auto-population')
      return
    }

    console.log('Auto-populating BOM with mash bill:', targetMashBill)
    
    const options = {
      ...getDefaultAutoPopulateOptions(),
      mashBill: targetMashBill
    }
    
    try {
      const autoIngredients = await autoPopulateBOMItemsFromDatabase(options)
      console.log('Generated auto ingredients from database:', autoIngredients)
      
      // Merge with existing ingredients, avoiding duplicates
      const existingItemCodes = new Set(formData.ingredients.map(ing => ing.itemCode))
      const newIngredients = autoIngredients.filter(ing => !existingItemCodes.has(ing.itemCode))
      
      const updatedIngredients = [...formData.ingredients, ...newIngredients]
      updateFormData({ ingredients: updatedIngredients })
      setHasAutoPopulated(true)
    } catch (error) {
      console.error('Error auto-populating BOM from database:', error)
      // Could show a toast notification here if needed
    }
  }, [formData.ingredients, getMashBillFromWizard])

  // Reset to manual mode (clear auto-populated items)
  const handleResetToManual = useCallback(() => {
    // Remove auto-populated items (those with auto_ prefix in ID)
    const manualIngredients = formData.ingredients.filter(ing => !ing.id.startsWith('auto_'))
    updateFormData({ ingredients: manualIngredients })
    setHasAutoPopulated(false)
  }, [formData.ingredients])

  // Validation function - now pure, doesn't call onValidationChange directly
  const validateForm = useCallback((currentData: RecipeBOMData) => {
    // In edit mode, allow empty ingredients since the recipe might not have BOM data yet
    // In create mode, at least one ingredient is required
    const isValid = mode === 'edit' ? true : currentData.ingredients.length > 0
    
    console.log('RecipeBOMStep: validateForm called with:', currentData)
    console.log('RecipeBOMStep: ingredients count:', currentData.ingredients.length)
    console.log('RecipeBOMStep: mode:', mode)
    console.log('RecipeBOMStep: form isValid:', isValid)
    console.log('RecipeBOMStep: calling onValidationChange with:', isValid)
    
    // Only call onValidationChange if the validation result actually changed
    if (lastValidationResultRef.current !== isValid) {
      lastValidationResultRef.current = isValid
      onValidationChange(isValid)
    }
    
    return isValid
  }, [onValidationChange, mode])

  // Update form data and propagate changes
  const updateFormData = useCallback((updates: Partial<RecipeBOMData>) => {
    if (isUpdatingRef.current) return // Prevent recursive updates
    
    setFormData(prev => {
      // Check if data actually changed before updating
      const hasChanged = Object.keys(updates).some(key => {
        const prevValue = prev[key as keyof RecipeBOMData]
        const newValue = updates[key as keyof RecipeBOMData]
        return JSON.stringify(prevValue) !== JSON.stringify(newValue)
      })
      
      if (!hasChanged) {
        return prev // No change, return previous state
      }
      
      const newData = { ...prev, ...updates }
      
      // Prevent recursive calls
      isUpdatingRef.current = true
      
      // Validate the new data and update parent
      validateForm(newData)
      onDataChange(newData)
      
      isUpdatingRef.current = false
      
      return newData
    })
  }, [onDataChange, validateForm])

  // Handle ingredients change
  const handleIngredientsChange = useCallback((ingredients: RecipeIngredient[]) => {
    updateFormData({ ingredients })
    
    // Update auto-populated status based on current ingredients
    setHasAutoPopulated(isBOMAutoPopulated(ingredients))
  }, [updateFormData])

  // Check if BOM should be auto-populated on mount
  useEffect(() => {
    if (mode === 'create' && formData.ingredients.length === 0 && !hasAutoPopulated) {
      // Try to auto-populate if we have mash bill data
      const mashBill = getMashBillFromWizard()
      if (mashBill) {
        console.log('Auto-populating BOM on mount with mash bill:', mashBill)
        // Handle async function properly
        const autoPopulate = async () => {
          await handleAutoPopulate(mashBill)
        }
        autoPopulate()
      }
    }
  }, [mode, formData.ingredients.length, hasAutoPopulated, getMashBillFromWizard, handleAutoPopulate])

  // Initial validation effect - only runs when ingredients length changes
  useEffect(() => {
    if (!isUpdatingRef.current) {
      // Use setTimeout to ensure this runs after the render cycle
      const timeoutId = setTimeout(() => {
        validateForm(formData)
      }, 0)
      
      return () => clearTimeout(timeoutId)
    }
  }, [formData.ingredients.length, validateForm])

  // Check if auto-population is available
  const canAutoPopulate = getMashBillFromWizard() !== null
  const isAutoPopulated = isBOMAutoPopulated(formData.ingredients)

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-medium">Recipe BOM</h3>
          <p className="text-sm text-muted-foreground">
            Add ingredients for your whiskey recipe. Include grains, water, enzymes, and other components.
          </p>
        </div>

        {/* Auto-population controls */}
        {mode === 'create' && (
          <div className="flex flex-col gap-4">
            {canAutoPopulate && !isAutoPopulated && (
              <Alert>
                <Wand2 className="h-4 w-4" />
                <AlertDescription className="flex items-center justify-between">
                  <span>Auto-populate BOM with standard ingredients based on your mash bill?</span>
                  <Button 
                    onClick={() => handleAutoPopulate()} 
                    size="sm" 
                    className="ml-4"
                  >
                    <Wand2 className="w-4 h-4 mr-2" />
                    Auto-populate
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            
            {isAutoPopulated && (
              <Alert>
                <AlertDescription className="flex items-center justify-between">
                  <span>BOM has been auto-populated with standard ingredients. You can edit or add more ingredients as needed.</span>
                  <Button 
                    onClick={handleResetToManual} 
                    variant="outline" 
                    size="sm" 
                    className="ml-4"
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Reset to Manual
                  </Button>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <RecipeBOMEditor
          ingredients={formData.ingredients}
          onIngredientsChange={handleIngredientsChange}
          isEditing={true}
          {...(() => {
            const mashBill = getMashBillFromWizard()
            const formattedMashBill = formatMashBillForAPI(mashBill)
            console.log('🧪 RecipeBOMStep - mode:', mode)
            console.log('🧪 RecipeBOMStep - mashBill from wizard:', mashBill)
            console.log('🧪 RecipeBOMStep - formatted mashBill:', formattedMashBill)

            const props: Record<string, unknown> = {}

            if (mode === 'create' && formattedMashBill) {
              console.log('🧪 RecipeBOMStep - passing mashBill prop:', formattedMashBill)
              props.mashBill = formattedMashBill
            }

            // Pass mashBillData for validation
            if (mashBill) {
              props.mashBillData = {
                corn: mashBill.corn,
                rye: mashBill.rye,
                wheat: mashBill.wheat,
                maltedBarley: mashBill.maltedBarley
              }
            }

            console.log('🧪 RecipeBOMStep - passing props:', props)
            return props
          })()}
        />

        {formData.ingredients.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <p>No ingredients added yet. {canAutoPopulate ? 'Use auto-populate or click' : 'Click'} &ldquo;Add Ingredient&rdquo; to get started.</p>
          </div>
        )}
      </div>
    </div>
  )
} 