'use client'

import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Save } from 'lucide-react'
import { toast } from 'sonner'
import { parseMashBillFromRecipeName } from '@/lib/recipe-utils'

// Import step components
import { RecipeDetailsStep, RecipeDetailsData } from './recipe-details-step'
import { RecipeBOMStep, RecipeBOMData } from './recipe-bom-step'
import { RecipeParametersStep, RecipeParametersData } from './recipe-parameters-step'
import { RecipeMashingStep, RecipeMashingData } from './recipe-mashing-step'

// Combined recipe data type
export interface RecipeEditData {
  details: RecipeDetailsData
  bom: RecipeBOMData
  parameters: RecipeParametersData
  mashing: RecipeMashingData
}

export interface RecipeEditModalProps {
  isOpen: boolean
  onClose: () => void
  recipe?: RecipeEditData
  onSave: (data: RecipeEditData) => Promise<void>
  onSelectRevision?: (recipeId: string) => void
}

// Default data constant to prevent recreation
const DEFAULT_RECIPE_DATA: RecipeEditData = {
  details: {
    Recipe: '',
    active: true,
    whiskeyType: '',
    revision: '1',
    customerCode: '',
    cooksPerFerm: 3,
    createdAt: new Date().toISOString(),
    createdBy: 'Current User',
    mashBill: {
      corn: 0,
      rye: 0,
      wheat: 0,
      maltedBarley: 0
    }
  },
  bom: { ingredients: [] },
  parameters: { parameters: [] },
  mashing: { mashingSteps: [] }
}

export function RecipeEditModal({ isOpen, onClose, recipe, onSave, onSelectRevision }: RecipeEditModalProps) {
  const [activeTab, setActiveTab] = useState('details')
  const [isSaving, setIsSaving] = useState(false)
  const [showSaveConfirmation, setShowSaveConfirmation] = useState(false)
  
  const [formData, setFormData] = useState<RecipeEditData>(() => recipe || DEFAULT_RECIPE_DATA)
  const [originalData, setOriginalData] = useState<RecipeEditData>(() => recipe || DEFAULT_RECIPE_DATA)

  // Update formData and originalData when recipe prop changes
  useEffect(() => {
    if (recipe) {
      // Get initial mashBill values from recipe prop
      let mashBill = {
        corn: Number(recipe.details.mashBill?.corn) || 0,
        rye: Number(recipe.details.mashBill?.rye) || 0,
        wheat: Number(recipe.details.mashBill?.wheat) || 0,
        maltedBarley: Number(recipe.details.mashBill?.maltedBarley) || 0
      }

      // If all mashBill values are zero, try to parse from Recipe name
      const allZeros = mashBill.corn === 0 && mashBill.rye === 0 &&
                       mashBill.wheat === 0 && mashBill.maltedBarley === 0

      if (allZeros && recipe.details.Recipe) {
        const parsedMashBill = parseMashBillFromRecipeName(recipe.details.Recipe)
        if (parsedMashBill) {
          console.log('Modal initialization - parsed mashBill from Recipe name:', recipe.details.Recipe, '->', parsedMashBill)
          mashBill = parsedMashBill
        }
      }

      // Ensure proper typing for the recipe data, especially numeric fields
      const normalizedRecipe = {
        ...recipe,
        details: {
          ...recipe.details,
          cooksPerFerm: Number(recipe.details.cooksPerFerm) || 1,
          active: Boolean(recipe.details.active),
          mashBill
        }
      }

      console.log('Modal initialization - original recipe:', recipe)
      console.log('Modal initialization - normalized recipe:', normalizedRecipe)

      setFormData(normalizedRecipe)
      setOriginalData(normalizedRecipe)
    } else {
      setFormData(DEFAULT_RECIPE_DATA)
      setOriginalData(DEFAULT_RECIPE_DATA)
    }
  }, [recipe])

  const [stepValidation, setStepValidation] = useState<Record<string, boolean>>({
    details: false,
    bom: false,
    parameters: false,
    mashing: false
  })

  // Deep comparison function for recipe data
  const hasChanges = useMemo(() => {
    const deepEqual = (obj1: unknown, obj2: unknown): boolean => {
      if (obj1 === obj2) return true
      
      if (obj1 == null || obj2 == null) return obj1 === obj2
      
      // Handle number comparisons more reliably
      if (typeof obj1 === 'number' && typeof obj2 === 'number') {
        return obj1 === obj2
      }
      
      // Handle string to number comparisons
      if ((typeof obj1 === 'number' && typeof obj2 === 'string') || 
          (typeof obj1 === 'string' && typeof obj2 === 'number')) {
        return Number(obj1) === Number(obj2)
      }
      
      if (typeof obj1 !== typeof obj2) return false
      
      if (typeof obj1 !== 'object') return obj1 === obj2
      
      if (Array.isArray(obj1) !== Array.isArray(obj2)) return false
      
      if (Array.isArray(obj1) && Array.isArray(obj2)) {
        if (obj1.length !== obj2.length) return false
        for (let i = 0; i < obj1.length; i++) {
          if (!deepEqual(obj1[i], obj2[i])) return false
        }
        return true
      }
      
      // Both are objects at this point
      const record1 = obj1 as Record<string, unknown>
      const record2 = obj2 as Record<string, unknown>
      
      const keys1 = Object.keys(record1)
      const keys2 = Object.keys(record2)
      
      if (keys1.length !== keys2.length) return false
      
      for (const key of keys1) {
        if (!keys2.includes(key)) return false
        if (!deepEqual(record1[key], record2[key])) return false
      }
      
      return true
    }

    const changes = !deepEqual(formData, originalData)
    console.log('Change detection:', {
      hasChanges: changes,
      formData: formData.details?.cooksPerFerm,
      originalData: originalData.details?.cooksPerFerm,
      formDataType: typeof formData.details?.cooksPerFerm,
      originalDataType: typeof originalData.details?.cooksPerFerm,
      formDataDetails: formData.details,
      originalDataDetails: originalData.details
    })
    return changes
  }, [formData, originalData])

  // Handle step data changes with proper typing
  const handleDetailsChange = useCallback((data: Record<string, unknown>) => {
    // Ensure proper type conversion, especially for numbers
    const typedData = {
      ...data,
      cooksPerFerm: typeof data['cooksPerFerm'] === 'string' ? parseInt(data['cooksPerFerm']) || 1 : Number(data['cooksPerFerm']) || 1,
      active: Boolean(data['active']),
      mashBill: data['mashBill'] && typeof data['mashBill'] === 'object' ? {
        corn: Number((data['mashBill'] as Record<string, unknown>)['corn']) || 0,
        rye: Number((data['mashBill'] as Record<string, unknown>)['rye']) || 0,
        wheat: Number((data['mashBill'] as Record<string, unknown>)['wheat']) || 0,
        maltedBarley: Number((data['mashBill'] as Record<string, unknown>)['maltedBarley']) || 0
      } : {
        corn: 0,
        rye: 0,
        wheat: 0,
        maltedBarley: 0
      }
    } as RecipeDetailsData
    
    console.log('handleDetailsChange - incoming data:', data)
    console.log('handleDetailsChange - typedData:', typedData)
    console.log('handleDetailsChange - cooksPerFerm conversion:', {
      original: data['cooksPerFerm'],
      originalType: typeof data['cooksPerFerm'],
      converted: typedData.cooksPerFerm,
      convertedType: typeof typedData.cooksPerFerm
    })
    
    setFormData(prev => {
      const newFormData = { ...prev, details: typedData }
      console.log('handleDetailsChange - new formData.details:', newFormData.details)
      return newFormData
    })
  }, [])

  const handleBOMChange = useCallback((data: Record<string, unknown>) => {
    setFormData(prev => ({ ...prev, bom: data as unknown as RecipeBOMData }))
  }, [])

  const handleParametersChange = useCallback((data: Record<string, unknown>) => {
    setFormData(prev => ({ ...prev, parameters: data as unknown as RecipeParametersData }))
  }, [])

  const handleMashingChange = useCallback((data: Record<string, unknown>) => {
    setFormData(prev => ({ ...prev, mashing: data as unknown as RecipeMashingData }))
  }, [])

  // Handle step validation changes
  const handleValidationChange = useCallback((stepId: string, isValid: boolean) => {
    console.log(`Validation change for ${stepId}:`, isValid)
    setStepValidation(prev => {
      const newValidation = {
        ...prev,
        [stepId]: isValid
      }
      console.log('New validation state:', newValidation)
      console.log('All steps valid?', Object.values(newValidation).every(valid => valid))
      return newValidation
    })
  }, [])

  // Debug logging for step data
  useEffect(() => {
    console.log('Step data debugging:')
    console.log('- BOM data:', formData.bom)
    console.log('- Parameters data:', formData.parameters)
    console.log('- Mashing data:', formData.mashing)
    console.log('- Details data:', formData.details)
  }, [formData])

  // Initialize validation state when recipe data is loaded
  useEffect(() => {
    if (recipe && formData) {
      // For edit mode, initialize all steps as valid since they're optional
      // and the tab components are only rendered when active
      if (recipe) {
        console.log('Initializing validation for edit mode - setting all steps as valid')
        setStepValidation({
          details: false, // Will be set by the details step component
          bom: true,      // Valid in edit mode (optional)
          parameters: true, // Valid in edit mode (optional)
          mashing: true   // Valid in edit mode (optional)
        })
      }
    }
  }, [recipe])

  // Check if all steps are valid
  const isFormValid = Object.values(stepValidation).every(isValid => isValid)

  // Save button should be enabled only when there are changes AND form is valid
  const canSave = isFormValid && hasChanges
  
  // Debug logging for save button state
  console.log('Save button state:', {
    isFormValid,
    hasChanges,
    canSave,
    stepValidation,
    stepValidationDetails: {
      details: stepValidation['details'],
      bom: stepValidation['bom'],
      parameters: stepValidation['parameters'],
      mashing: stepValidation['mashing'],
      allValid: Object.values(stepValidation).every(isValid => isValid),
      validCount: Object.values(stepValidation).filter(isValid => isValid).length,
      totalSteps: Object.keys(stepValidation).length
    }
  })

  // Handle save
  const handleSave = async () => {
    if (!isFormValid) {
      toast.error('Please complete all required fields before saving.')
      return
    }

    if (!hasChanges) {
      toast.info('No changes detected.')
      return
    }

    // Show confirmation dialog before saving
    setShowSaveConfirmation(true)
  }

  // Handle confirmed save
  const handleConfirmedSave = async () => {
    setShowSaveConfirmation(false)
    setIsSaving(true)
    try {
      await onSave(formData)
      // Show success message and close modal on successful save
      toast.success('Recipe updated successfully!')
      onClose()
    } catch (error) {
      console.error('Error saving recipe:', error)
      
      // Extract the specific error message
      let errorMessage = 'Failed to save recipe. Please try again.'
      
      if (error instanceof Error) {
        errorMessage = error.message
        
        // Clean up GraphQL error prefixes for better user experience
        if (errorMessage.includes('Failed to update recipe:')) {
          // The parent already formatted the error, use it as-is
          errorMessage = errorMessage
        } else if (errorMessage.includes('GraphQL Error:')) {
          errorMessage = errorMessage.replace('GraphQL Error: ', '')
        } else if (errorMessage.includes('Network Error:')) {
          errorMessage = errorMessage.replace('Network Error: ', '')
        }
      }
      
      toast.error(errorMessage)
    } finally {
      setIsSaving(false)
    }
  }

  // Handle cancel confirmation
  const handleCancelSave = () => {
    setShowSaveConfirmation(false)
  }

  // Handle close with unsaved changes warning
  const handleClose = () => {
    if (!isSaving) {
      if (hasChanges) {
        const confirmClose = window.confirm(
          'You have unsaved changes. Are you sure you want to close without saving?'
        )
        if (confirmClose) {
          onClose()
        }
      } else {
        onClose()
      }
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Edit Recipe</DialogTitle>
          <DialogDescription>
            Edit recipe details, Recipe BOM, parameters, and mashing protocol.
          </DialogDescription>
        </DialogHeader>

        {/* Revision behavior notice */}
        <div className="flex-shrink-0 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3 text-sm">
          <p className="text-amber-800 dark:text-amber-200">
            <span className="font-semibold">Note:</span> Saving changes will create a new revision of this recipe. The new revision will become active, and previous revisions will remain available in the revision history.
          </p>
        </div>

        <div className="flex-1 overflow-auto">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col">
            <TabsList className="grid w-full grid-cols-4 flex-shrink-0 sticky top-0 bg-background z-10">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="bom">Recipe BOM</TabsTrigger>
              <TabsTrigger value="parameters">Parameters</TabsTrigger>
              <TabsTrigger value="mashing">Mashing Protocol</TabsTrigger>
            </TabsList>

            <div className="flex-1">
              <TabsContent value="details" className="mt-4 pb-6">
                <RecipeDetailsStep
                  data={formData.details as unknown as Record<string, unknown>}
                  onDataChange={handleDetailsChange}
                  onValidationChange={(isValid) => handleValidationChange('details', isValid)}
                  mode="edit"
                  onSelectRevision={onSelectRevision}
                />
              </TabsContent>

              <TabsContent value="bom" className="mt-4 pb-6">
                <RecipeBOMStep
                  data={formData.bom as unknown as Record<string, unknown>}
                  onDataChange={handleBOMChange}
                  onValidationChange={(isValid) => handleValidationChange('bom', isValid)}
                  mode="edit"
                />
              </TabsContent>

              <TabsContent value="parameters" className="mt-4 pb-6">
                <RecipeParametersStep
                  data={formData.parameters as unknown as Record<string, unknown>}
                  onDataChange={handleParametersChange}
                  onValidationChange={(isValid) => handleValidationChange('parameters', isValid)}
                  mode="edit"
                />
              </TabsContent>

              <TabsContent value="mashing" className="mt-4 pb-6">
                <RecipeMashingStep
                  data={formData.mashing as unknown as Record<string, unknown>}
                  onDataChange={handleMashingChange}
                  onValidationChange={(isValid) => handleValidationChange('mashing', isValid)}
                  mode="edit"
                />
              </TabsContent>
            </div>
          </Tabs>
        </div>

        <div className="flex-shrink-0 flex items-center justify-between pt-4 border-t">
          <div className="text-sm text-muted-foreground">
            {!isFormValid ? (
              <span>Please complete all required sections</span>
            ) : !hasChanges ? (
              <span className="text-blue-600">No changes detected</span>
            ) : (
              <span className="text-green-600">Ready to save changes</span>
            )}
          </div>

          <div className="flex space-x-3">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!canSave || isSaving}
            >
              <Save className="w-4 h-4 mr-2" />
              {isSaving ? 'Saving...' : 'Save Recipe'}
            </Button>
          </div>
        </div>
      </DialogContent>

      {/* Save Confirmation Dialog */}
      <Dialog open={showSaveConfirmation} onOpenChange={setShowSaveConfirmation}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Save className="h-5 w-5 text-orange-500" />
              Confirm Recipe Save
            </DialogTitle>
            <DialogDescription className="text-left space-y-3 pt-2">
              <p className="font-medium text-foreground">
                This action will create a new revision of this recipe.
              </p>
              <div className="space-y-2 text-sm">
                <p>• A new revision will be created and marked as active</p>
                <p>• This will become the default recipe for future orders with this customer and mash bill</p>
                <p>• Previous revisions will remain available but inactive</p>
                <p>• Production orders already in progress will continue using their current recipe version</p>
              </div>
              <p className="text-sm font-medium text-orange-600">
                Are you sure you want to proceed?
              </p>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-3 pt-4">
            <Button
              variant="outline"
              onClick={handleCancelSave}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmedSave}
              disabled={isSaving}
              className="bg-orange-600 hover:bg-orange-700"
            >
              <Save className="w-4 h-4 mr-2" />
              {isSaving ? 'Saving...' : 'Save New Revision'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
} 