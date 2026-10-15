'use client'

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight, Save, Check, FileText, Trash2, Clock } from 'lucide-react'
import { useRecipeDrafts, type RecipeDraft } from '@/lib/hooks/use-recipe-drafts'

// Simple Progress component
const Progress = ({ value, className }: { value: number; className?: string }) => (
  <div className={cn("w-full bg-secondary rounded-full h-2", className)}>
    <div
      className="bg-primary h-2 rounded-full transition-all"
      style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
    />
  </div>
)

export interface WizardStep {
  id: string
  title: string
  description: string
  component: React.ComponentType<{
    data: Record<string, unknown>
    onDataChange: (data: Record<string, unknown>) => void
    onValidationChange: (isValid: boolean) => void
    onWizardDataChange?: (allData: Record<string, unknown>) => void
    allWizardData?: Record<string, unknown>
    mode?: 'create' | 'edit'
  }>
}

export interface RecipeWizardProps {
  steps: WizardStep[]
  initialData?: Record<string, unknown>
  onSave: (data: Record<string, unknown>, isDraft: boolean) => Promise<void>
  onCancel: () => void
  className?: string
}

// Define the props interface based on the WizardStep component type
export interface WizardStepProps {
  data: Record<string, unknown>
  onDataChange: (data: Record<string, unknown>) => void
  onValidationChange: (isValid: boolean) => void
  // Add optional prop to allow updating all wizard steps
  onWizardDataChange?: (allData: Record<string, unknown>) => void
  // Add prop to access all wizard data from other steps
  allWizardData?: Record<string, unknown>
  // Add mode prop to distinguish between create and edit contexts
  mode?: 'create' | 'edit'
  // Add callback for switching to a different recipe revision
  onSelectRevision?: (recipeId: string) => void
}

export function RecipeWizard({
  steps,
  initialData = {} as Record<string, unknown>,
  onSave,
  onCancel,
  className
}: RecipeWizardProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [wizardData, setWizardData] = useState(initialData)
  const [stepValidation, setStepValidation] = useState<Record<string, boolean>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null)
  const [forceRenderKey, setForceRenderKey] = useState(0)
  const [lastAutoSave, setLastAutoSave] = useState<Date | null>(null)
  const [isAutoSaving, setIsAutoSaving] = useState(false)
  
  // Refs for auto-save debouncing
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastDataRef = useRef<string>('')
  
  // Debug logging for wizard data changes
  useEffect(() => {
    console.log('Wizard data changed:', wizardData);
    console.log('Current step data:', wizardData[steps[currentStepIndex]?.id || '']);
  }, [wizardData, steps, currentStepIndex]);
  
  // Draft management
  const {
    drafts: recentDrafts,
    isLoaded: draftsLoaded,
    saveDraft,
    deleteDraft
  } = useRecipeDrafts()

  // Auto-save functionality
  const performAutoSave = useCallback(async () => {
    if (!wizardData || Object.keys(wizardData).length === 0) {
      return
    }

    const currentDataString = JSON.stringify(wizardData)
    
    // Check if data has actually changed
    if (currentDataString === lastDataRef.current) {
      return
    }

    setIsAutoSaving(true)
    try {
      const draftId = saveDraft(wizardData, currentStepIndex, true, currentDraftId || undefined)
      if (!currentDraftId) {
        setCurrentDraftId(draftId)
      }
      setLastAutoSave(new Date())
      lastDataRef.current = currentDataString
    } catch (error) {
      console.error('Auto-save failed:', error)
    } finally {
      setIsAutoSaving(false)
    }
  }, [wizardData, currentStepIndex, currentDraftId, saveDraft])

  // Set up auto-save when wizard data changes
  useEffect(() => {
    // Clear existing timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current)
    }

    // Only auto-save if we have meaningful data
    if (wizardData && Object.keys(wizardData).length > 0) {
      // Debounce auto-save by 30 seconds
      autoSaveTimeoutRef.current = setTimeout(() => {
        performAutoSave()
      }, 30000) // 30 seconds
    }

    // Cleanup timeout on unmount
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current)
      }
    }
  }, [wizardData, performAutoSave])

  // Handle step data changes
  const handleStepDataChange = useCallback((stepData: Record<string, unknown>) => {
    setWizardData(prev => {
      const newData = {
        ...prev,
        [steps[currentStepIndex]?.id || '']: stepData
      }
      return newData
    })
  }, [currentStepIndex, steps])

  // Handle step validation changes
  const handleValidationChange = useCallback((isValid: boolean) => {
    setStepValidation(prev => ({
      ...prev,
      [steps[currentStepIndex]?.id || '']: isValid
    }))
  }, [currentStepIndex, steps])

  // Handle updating all wizard data at once (for basis recipe loading)
  const handleWizardDataChange = useCallback((allData: Record<string, unknown>) => {
    console.log('handleWizardDataChange called with data:', allData);
    
    // Set the wizard data directly - allData should already be properly structured
    // with keys matching step IDs: { details: {...}, bom: {...}, parameters: {...}, mashing: {...} }
    setWizardData(allData);
    
    // Initialize validation state for all steps that have data
    const initialValidation: Record<string, boolean> = {};
    steps.forEach(step => {
      // Mark step as valid if it has data, invalid if it doesn't
      initialValidation[step.id] = Boolean(allData[step.id] && Object.keys(allData[step.id] as Record<string, unknown>).length > 0);
    });
    setStepValidation(initialValidation);
    
    // Force re-render of all step components by updating the render key
    setForceRenderKey(prev => prev + 1);
    
    console.log('Wizard data updated:', allData);
    console.log('Step validation updated:', initialValidation);
  }, [steps]);

  // Load a draft
  const handleLoadDraft = useCallback((draft: RecipeDraft) => {
    setWizardData(draft.data)
    setCurrentStepIndex(draft.currentStep)
    setCurrentDraftId(draft.id)
  }, [])

  // Delete current draft
  const handleDeleteCurrentDraft = useCallback(() => {
    if (currentDraftId) {
      const confirmed = window.confirm('Are you sure you want to delete this draft? This action cannot be undone.')
      if (confirmed) {
        deleteDraft(currentDraftId)
        setCurrentDraftId(null)
        // Reset to initial data
        setWizardData(initialData)
        setCurrentStepIndex(0)
        setStepValidation({})
      }
    }
  }, [currentDraftId, deleteDraft, initialData])

  // Guard against invalid step index or empty steps
  if (steps.length === 0 || currentStepIndex >= steps.length || currentStepIndex < 0) {
    return <div>Invalid step configuration</div>
  }

  const currentStep = steps[currentStepIndex]!
  const isFirstStep = currentStepIndex === 0
  const isLastStep = currentStepIndex === steps.length - 1
  const canProceed = stepValidation[currentStep.id] !== false

  // Calculate progress percentage
  const progressPercentage = ((currentStepIndex + 1) / steps.length) * 100

  // Navigate to specific step
  const goToStep = (stepIndex: number) => {
    if (stepIndex >= 0 && stepIndex < steps.length) {
      setCurrentStepIndex(stepIndex)
    }
  }

  // Navigate to next step
  const handleNext = () => {
    if (!isLastStep && canProceed) {
      setCurrentStepIndex(prev => prev + 1)
    }
  }

  // Navigate to previous step
  const handlePrevious = () => {
    if (!isFirstStep) {
      setCurrentStepIndex(prev => prev - 1)
    }
  }

  // Save as draft (manual save)
  const handleSaveDraft = async () => {
    setIsSaving(true)
    try {
      const draftId = saveDraft(wizardData, currentStepIndex, false, currentDraftId || undefined)
      if (!currentDraftId) {
        setCurrentDraftId(draftId)
      }
    } finally {
      setIsSaving(false)
    }
  }

  // Save final recipe
  const handleSaveRecipe = async () => {
    if (!canProceed) return
    
    setIsSaving(true)
    try {
      await onSave(wizardData, false)
    } finally {
      setIsSaving(false)
    }
  }

  // Render step component
  const StepComponent = currentStep.component

  return (
    <div className={cn("flex h-full", className)}>
      {/* Sidebar Progress Tracker */}
      <div className="w-80 bg-muted/30 border-r p-6">
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold mb-2">Recipe Creation</h2>
            <Progress value={progressPercentage} className="h-2" />
            <p className="text-sm text-muted-foreground mt-2">
              Step {currentStepIndex + 1} of {steps.length}
            </p>
          </div>

          {/* Step Navigation */}
          <div className="space-y-2">
            {steps.map((step, index) => {
              const isCompleted = stepValidation[step.id] === true
              const isCurrent = index === currentStepIndex
              const isAccessible = index <= currentStepIndex

              return (
                <button
                  key={step.id}
                  onClick={() => isAccessible && goToStep(index)}
                  disabled={!isAccessible}
                  className={cn(
                    "w-full text-left p-3 rounded-lg border transition-colors",
                    isCurrent && "border-primary bg-primary/5",
                    isCompleted && !isCurrent && "border-green-200 bg-green-50",
                    !isAccessible && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-sm">{step.title}</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        {step.description}
                      </p>
                    </div>
                    {isCompleted && (
                      <Check className="w-4 h-4 text-green-600" />
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Recent Drafts */}
          {draftsLoaded && recentDrafts.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Recent Drafts</h3>
              <div className="space-y-1">
                {recentDrafts.slice(0, 3).map((draft) => (
                  <button
                    key={draft.id}
                    onClick={() => handleLoadDraft(draft)}
                    className="w-full text-left p-2 rounded border border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-primary/5 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="w-3 h-3 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{draft.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(draft.updatedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Draft Action Buttons */}
          <div className="space-y-2">
            {/* Auto-save status */}
            {(isAutoSaving || lastAutoSave) && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground p-2 bg-muted/50 rounded">
                {isAutoSaving ? (
                  <>
                    <Clock className="w-3 h-3 animate-pulse" />
                    <span>Auto-saving...</span>
                  </>
                ) : lastAutoSave ? (
                  <>
                    <Check className="w-3 h-3 text-green-600" />
                    <span>Auto-saved {new Date(lastAutoSave).toLocaleTimeString()}</span>
                  </>
                ) : null}
              </div>
            )}
            
            <Button
              variant="outline"
              onClick={handleSaveDraft}
              disabled={isSaving}
              className="w-full"
            >
              <Save className="w-4 h-4 mr-2" />
              {isSaving ? 'Saving...' : 'Save Draft'}
            </Button>
            
            {currentDraftId && (
              <Button
                variant="outline"
                onClick={handleDeleteCurrentDraft}
                disabled={isSaving}
                className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Draft
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {/* Step Header */}
        <div className="border-b p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">{currentStep.title}</h1>
              <p className="text-muted-foreground mt-1">{currentStep.description}</p>
            </div>
            {currentDraftId && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <FileText className="w-3 h-3" />
                Draft
              </Badge>
            )}
          </div>
        </div>

        {/* Step Content */}
        <div className="flex-1 p-6 overflow-auto">
          <Card>
            <CardContent className="p-6">
              <StepComponent
                key={`${currentStep.id}-${forceRenderKey}`}
                data={(wizardData[currentStep.id] as Record<string, unknown>) || {}}
                onDataChange={(stepData) => handleStepDataChange(stepData)}
                onValidationChange={(isValid) => handleValidationChange(isValid)}
                onWizardDataChange={handleWizardDataChange}
                allWizardData={wizardData}
                mode="create"
              />
            </CardContent>
          </Card>
        </div>

        {/* Navigation Footer */}
        <div className="border-t p-6">
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={handlePrevious}
              disabled={isFirstStep}
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Previous
            </Button>

            <div className="flex space-x-3">
              <Button
                variant="outline"
                onClick={onCancel}
                disabled={isSaving}
              >
                Cancel
              </Button>

              {isLastStep ? (
                <Button
                  onClick={handleSaveRecipe}
                  disabled={!canProceed || isSaving}
                >
                  <Save className="w-4 h-4 mr-2" />
                  {isSaving ? 'Saving...' : 'Save Recipe'}
                </Button>
              ) : (
                <Button
                  onClick={handleNext}
                  disabled={!canProceed}
                >
                  Next
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 