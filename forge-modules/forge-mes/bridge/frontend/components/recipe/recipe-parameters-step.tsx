'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { WizardStepProps } from './recipe-wizard'
import { RecipeParametersEditor, RecipeParameter } from '@/components/ui/recipe-components'
import { autoPopulateRequiredParameters, areParametersAutoPopulated, type MashBill } from '@/lib/utils/recipe-auto-populate'
import { Button } from '@/components/ui/button'
import { Wand2, RotateCcw } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

// Types for Parameters step data
export interface RecipeParametersData {
  parameters: RecipeParameter[]
}

 
export function RecipeParametersStep({ data, onDataChange, onValidationChange, allWizardData, mode = 'create' }: WizardStepProps) {
  // mode parameter available for future use to distinguish between create/edit contexts
  const typedData = data as Partial<RecipeParametersData>
  const [formData, setFormData] = useState<RecipeParametersData>({
    parameters: [],
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

  // Validation function - now pure, doesn't call onValidationChange directly
  const validateForm = useCallback((currentData: RecipeParametersData) => {
    // In edit mode, allow empty parameters since the recipe might not have parameters data yet
    // In create mode, at least one parameter is required for a complete recipe
    const isValid = mode === 'edit' ? true : currentData.parameters.length > 0
    
    console.log('RecipeParametersStep: validateForm called with:', currentData)
    console.log('RecipeParametersStep: parameters count:', currentData.parameters.length)
    console.log('RecipeParametersStep: mode:', mode)
    console.log('RecipeParametersStep: form isValid:', isValid)
    console.log('RecipeParametersStep: calling onValidationChange with:', isValid)
    
    // Only call onValidationChange if the validation result actually changed
    if (lastValidationResultRef.current !== isValid) {
      lastValidationResultRef.current = isValid
      onValidationChange(isValid)
    }
    
    return isValid
  }, [onValidationChange, mode])

  // Update form data and propagate changes
  const updateFormData = useCallback((updates: Partial<RecipeParametersData>) => {
    if (isUpdatingRef.current) return // Prevent recursive updates
    
    setFormData(prev => {
      // Check if data actually changed before updating
      const hasChanged = Object.keys(updates).some(key => {
        const prevValue = prev[key as keyof RecipeParametersData]
        const newValue = updates[key as keyof RecipeParametersData]
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

  // Auto-populate parameters with required class definitions
  const handleAutoPopulate = useCallback(async () => {
    try {
      const mashBill = getMashBillFromWizard()
      const autoParameters = await autoPopulateRequiredParameters(mashBill || undefined)
      
      // Merge with existing manual parameters (keep non-auto parameters)
      const manualParameters = formData.parameters.filter(param => !param.id?.startsWith('auto_'))
      const newParameters = [...autoParameters, ...manualParameters]
      
      updateFormData({ parameters: newParameters })
      setHasAutoPopulated(true)
    } catch (error) {
      console.error('Error auto-populating parameters:', error)
    }
  }, [formData.parameters, getMashBillFromWizard, updateFormData])

  // Auto-populate on first load if mash bill is available and not already populated
  useEffect(() => {
    const mashBill = getMashBillFromWizard()
    if (mashBill && !hasAutoPopulated && !areParametersAutoPopulated(formData.parameters)) {
      handleAutoPopulate()
    }
  }, [getMashBillFromWizard, hasAutoPopulated, formData.parameters, handleAutoPopulate])

  // Reset auto-populate button
  const handleResetAutoPopulate = useCallback(() => {
    const manualParameters = formData.parameters.filter(param => !param.id?.startsWith('auto_'))
    updateFormData({ parameters: manualParameters })
    setHasAutoPopulated(false)
  }, [formData.parameters, updateFormData])

  // Handle parameters change
  const handleParametersChange = useCallback((parameters: RecipeParameter[]) => {
    updateFormData({ parameters })
  }, [updateFormData])

  // Initial validation effect - only runs when parameters length changes
  useEffect(() => {
    if (!isUpdatingRef.current) {
      // Use setTimeout to ensure this runs after the render cycle
      const timeoutId = setTimeout(() => {
        validateForm(formData)
      }, 0)
      
      return () => clearTimeout(timeoutId)
    }
  }, [formData.parameters.length, validateForm])

  const isAutoPopulated = areParametersAutoPopulated(formData.parameters)
  const mashBill = getMashBillFromWizard()

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-medium">Recipe Parameters</h3>
          <p className="text-sm text-muted-foreground">
            Configure process control settings, proof levels, operational parameters, and quality controls for your whiskey recipe.
          </p>
        </div>

        {/* Auto-populate controls */}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAutoPopulate}
            disabled={!mashBill}
            className="flex items-center gap-2"
          >
            <Wand2 className="h-4 w-4" />
            Auto-Populate Required Parameters
          </Button>
          
          {formData.parameters.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleResetAutoPopulate}
              className="flex items-center gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
          )}
        </div>

        {/* Status alerts */}
        {!mashBill && (
          <Alert>
            <AlertDescription>
              Complete the recipe details step first to enable auto-population of parameters based on your mash bill.
            </AlertDescription>
          </Alert>
        )}

        {isAutoPopulated && (
          <Alert>
            <AlertDescription>
              Required class definition parameters have been auto-populated. You can modify values or add additional parameters as needed.
            </AlertDescription>
          </Alert>
        )}

        <RecipeParametersEditor
          parameters={formData.parameters}
          onParametersChange={handleParametersChange}
          isEditing={true}
        />

        {formData.parameters.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <p>No parameters configured yet. Click &ldquo;Auto-Populate Required Parameters&rdquo; or &ldquo;Add Parameter&rdquo; to get started.</p>
          </div>
        )}
      </div>
    </div>
  )
} 