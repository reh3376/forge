'use client'

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { MashingProtocolEditor, type MashingStep, type RecipeIngredient } from '@/components/ui/recipe-components'
import { useMashingProtocolTemplates } from '@/lib/hooks/use-mashing-protocol-templates'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, FileText, Plus, AlertTriangle } from 'lucide-react'
import type { WizardStepProps } from './recipe-wizard'

// Define the data structure for mashing protocol
export interface RecipeMashingData extends Record<string, unknown> {
  mashingSteps: MashingStep[]
}

export function RecipeMashingStep({ data, onDataChange, onValidationChange, allWizardData, mode = 'create' }: WizardStepProps) {
  // Manage form data state
  const [formData, setFormData] = useState<RecipeMashingData>({
    mashingSteps: []
  })
  
  // Template selection state
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [showTemplateSelection, setShowTemplateSelection] = useState(true)
  
  // Template hook
  const { templates, templatesByCategory, loading: templatesLoading, loadTemplateAsSteps } = useMashingProtocolTemplates()
  
  // Ref to track recursive updates
  const isUpdatingRef = useRef(false)
  
  // Ref to track last validation result
  const lastValidationResultRef = useRef<boolean | null>(null)
  
  // BOM validation state
  const [bomValidationErrors, setBomValidationErrors] = useState<string[]>([])
  
  // Get BOM ingredients from wizard context
  const getBOMIngredientsFromWizard = useCallback((): RecipeIngredient[] => {
    if (!allWizardData?.['bom']) return []
    
    const bomData = allWizardData['bom'] as Record<string, unknown>
    if (bomData?.['ingredients'] && Array.isArray(bomData['ingredients'])) {
      return bomData['ingredients'] as RecipeIngredient[]
    }
    
    return []
  }, [allWizardData])
  
  // Validate that mashing step BOM items exist in recipe BOM
  const validateMashingStepBOMItems = useCallback((mashingSteps: MashingStep[]): string[] => {
    const bomIngredients = getBOMIngredientsFromWizard()
    const errors: string[] = []
    
    if (bomIngredients.length === 0) {
      // If no BOM is configured yet, we can't validate but shouldn't block
      return []
    }
    
    // Create a map of available BOM items by item ID and item code for quick lookup
    const bomItemMap = new Map<string, RecipeIngredient>()
    const bomItemCodeMap = new Map<string, RecipeIngredient>()
    
    bomIngredients.forEach(ingredient => {
      bomItemMap.set(ingredient.id, ingredient)
      bomItemCodeMap.set(ingredient.itemCode, ingredient)
    })
    
    // Helper function to determine if a step type requires a recipeBom item
    const requiresRecipeBomItem = (stepType: string): boolean => {
      return ['Corn', 'Wheat', 'Rye', 'Malt', 'AdditiveAdd', 'LiquidAdd'].includes(stepType)
    }
    
    // Check each mashing step for BOM item references
    mashingSteps.forEach((step, stepIndex) => {
      // Check if step type requires a recipeBom item but doesn't have one
      if (requiresRecipeBomItem(step.stepType)) {
        if (!step.recipeBomItems || step.recipeBomItems.length === 0) {
          const stepTypeLabel = step.stepType === 'LiquidAdd' ? 'water/liquid' : 
                               step.stepType === 'AdditiveAdd' ? 'additive' : 'grain'
          errors.push(
            `Step ${stepIndex + 1}: ${step.stepType} step requires a linked BOM item. Please select a ${stepTypeLabel} ingredient for this step.`
          )
        } else {
          // If it has recipeBomItems, validate they exist in the recipe BOM
          step.recipeBomItems.forEach((bomItem) => {
            const itemId = bomItem.item.id
            const itemNumber = bomItem.item.itemNumber
            
            // Check if the BOM item exists in the recipe's BOM configuration
            const existsById = bomItemMap.has(itemId)
            const existsByCode = itemNumber && bomItemCodeMap.has(itemNumber)
            
            if (!existsById && !existsByCode) {
              errors.push(
                `Step ${stepIndex + 1}: BOM item "${bomItem.item.itemName}" (${itemNumber || itemId}) is not configured in the recipe's Bill of Materials. Please add this item to the BOM or remove it from the mashing step.`
              )
            }
          })
        }
      } else if (step.recipeBomItems && step.recipeBomItems.length > 0) {
        // For steps that don't require BOM items, still validate any existing ones
        step.recipeBomItems.forEach((bomItem) => {
          const itemId = bomItem.item.id
          const itemNumber = bomItem.item.itemNumber
          
          // Check if the BOM item exists in the recipe's BOM configuration
          const existsById = bomItemMap.has(itemId)
          const existsByCode = itemNumber && bomItemCodeMap.has(itemNumber)
          
          if (!existsById && !existsByCode) {
            errors.push(
              `Step ${stepIndex + 1}: BOM item "${bomItem.item.itemName}" (${itemNumber || itemId}) is not configured in the recipe's Bill of Materials. Please add this item to the BOM or remove it from the mashing step.`
            )
          }
        })
      }
    })
    
    return errors
  }, [getBOMIngredientsFromWizard])
  
  // Update BOM validation when mashing steps or BOM data changes
  useEffect(() => {
    const errors = validateMashingStepBOMItems(formData.mashingSteps)
    setBomValidationErrors(errors)
  }, [formData.mashingSteps, allWizardData, validateMashingStepBOMItems])
  
  // Initialize form data on mount and when external data changes
  useEffect(() => {
    if (data && typeof data === 'object') {
      const typedData = data as Record<string, unknown>
      setFormData({
        mashingSteps: Array.isArray(typedData['mashingSteps']) 
          ? typedData['mashingSteps'] as MashingStep[] 
          : []
      })
    }
  }, [data])

  // Validation function - now pure, doesn't call onValidationChange directly
  const validateForm = useCallback((currentData: RecipeMashingData) => {
    // In edit mode, allow empty mashing steps since the recipe might not have mashing data yet
    // In create mode, at least one mashing step is required for a complete recipe
    const hasSteps = currentData.mashingSteps.length > 0
    const hasBOMErrors = bomValidationErrors.length > 0
    const isValid = mode === 'edit' ? !hasBOMErrors : hasSteps && !hasBOMErrors
    
    console.log('RecipeMashingStep: validateForm called with:', currentData)
    console.log('RecipeMashingStep: mashingSteps count:', currentData.mashingSteps.length)
    console.log('RecipeMashingStep: BOM validation errors:', bomValidationErrors.length)
    console.log('RecipeMashingStep: mode:', mode)
    console.log('RecipeMashingStep: form isValid:', isValid)
    console.log('RecipeMashingStep: calling onValidationChange with:', isValid)
    
    // Only call onValidationChange if the validation result actually changed
    if (lastValidationResultRef.current !== isValid) {
      lastValidationResultRef.current = isValid
      onValidationChange(isValid)
    }
    
    return isValid
  }, [onValidationChange, mode, bomValidationErrors])

  // Update form data and propagate changes
  const updateFormData = useCallback((updates: Partial<RecipeMashingData>) => {
    if (isUpdatingRef.current) return // Prevent recursive updates
    
    setFormData(prev => {
      // Check if data actually changed before updating
      const hasChanged = Object.keys(updates).some(key => {
        const prevValue = prev[key as keyof RecipeMashingData]
        const newValue = updates[key as keyof RecipeMashingData]
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

  // Handle mashing steps change
  const handleStepsChange = useCallback((mashingSteps: MashingStep[]) => {
    updateFormData({ mashingSteps })
  }, [updateFormData])

  // Handle template selection
  const handleTemplateSelect = useCallback(async (templateId: string) => {
    if (!templateId) return
    
    const templateSteps = await loadTemplateAsSteps(templateId)
    if (templateSteps) {
      updateFormData({ mashingSteps: templateSteps })
      setShowTemplateSelection(false)
    }
  }, [loadTemplateAsSteps, updateFormData])

  // Handle manual creation (skip templates)
  const handleSkipTemplate = useCallback(() => {
    setShowTemplateSelection(false)
  }, [])

  // Handle reset to show template selection again
  const handleShowTemplateSelection = useCallback(() => {
    setShowTemplateSelection(true)
    setSelectedTemplateId('')
  }, [])

  // Initial validation effect - only runs when mashing steps length changes
  useEffect(() => {
    if (!isUpdatingRef.current) {
      // Use setTimeout to ensure this runs after the render cycle
      const timeoutId = setTimeout(() => {
        validateForm(formData)
      }, 0)
      
      return () => clearTimeout(timeoutId)
    }
  }, [formData.mashingSteps.length, bomValidationErrors.length, validateForm])

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-medium">Mashing Protocol</h3>
          <p className="text-sm text-muted-foreground">
            Define the sequential mashing protocol steps including liquid additions, holds, temperature control, and additive additions.
          </p>
        </div>

        {/* Template Selection Section */}
        {showTemplateSelection && formData.mashingSteps.length === 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Choose Mashing Protocol Template
              </CardTitle>
              <CardDescription>
                Select a pre-configured mashing protocol template to get started quickly, or create your own from scratch.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {templatesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mr-2" />
                  Loading templates...
                </div>
              ) : templates.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No mashing protocol templates available.</p>
                  <Button onClick={handleSkipTemplate} className="mt-4">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Manual Protocol
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Select Template</label>
                    <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a mashing protocol template..." />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(templatesByCategory).map(([category, categoryTemplates]) => (
                          <div key={category}>
                            <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                              {category}
                            </div>
                            {categoryTemplates.map((template) => (
                              <SelectItem key={template.id} value={template.id}>
                                <div className="flex items-center justify-between w-full">
                                  <span>{template.name}</span>
                                  <Badge variant="secondary" className="ml-2">
                                    {template.steps.length} steps
                                  </Badge>
                                </div>
                              </SelectItem>
                            ))}
                          </div>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedTemplateId && (
                    <div className="space-y-2">
                      {(() => {
                        const template = templates.find(t => t.id === selectedTemplateId)
                        return template ? (
                          <div className="p-3 bg-muted rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="font-medium">{template.name}</h4>
                              <Badge variant="outline">{template.templateCategory}</Badge>
                            </div>
                            {template.templateDescription && (
                              <p className="text-sm text-muted-foreground mb-2">
                                {template.templateDescription}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              {template.steps.length} steps • Created by {template.createdBy}
                            </p>
                          </div>
                        ) : null
                      })()}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button 
                      onClick={() => handleTemplateSelect(selectedTemplateId)}
                      disabled={!selectedTemplateId}
                      className="flex-1"
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      Use Template
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={handleSkipTemplate}
                      className="flex-1"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Create Manual
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* BOM Validation Errors */}
        {bomValidationErrors.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-medium">BOM Configuration Issues:</p>
                <ul className="list-disc list-inside space-y-1">
                  {bomValidationErrors.map((error, index) => (
                    <li key={index} className="text-sm">{error}</li>
                  ))}
                </ul>
                <p className="text-sm">
                  Please go back to the Bill of Materials step to add the missing ingredients, or edit the mashing steps to remove the invalid BOM item references.
                </p>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Mashing Protocol Editor */}
        {(!showTemplateSelection || formData.mashingSteps.length > 0) && (
          <div className="space-y-4">
            {formData.mashingSteps.length > 0 && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium">Mashing Steps</h4>
                  <Badge variant="secondary">
                    {formData.mashingSteps.length} steps
                  </Badge>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleShowTemplateSelection}
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Choose Template
                </Button>
              </div>
            )}

            <MashingProtocolEditor
              steps={formData.mashingSteps}
              onStepsChange={handleStepsChange}
              isEditing={true}
            />

            {formData.mashingSteps.length === 0 && !showTemplateSelection && (
              <div className="text-center py-8 text-muted-foreground">
                <p>No mashing steps defined yet. Click &ldquo;Add Step&rdquo; to get started.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
} 