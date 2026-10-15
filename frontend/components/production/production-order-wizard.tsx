'use client'

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { ChevronLeft, ChevronRight, Package, Settings, List, CheckCircle, Save, FileText, Trash2, Clock, Check, Calculator, Droplets, Wheat, FlaskConical, Code } from 'lucide-react'
import { toast } from 'sonner'
import { unifiedSchedulingClient } from '@/lib/api/unified-scheduling-client'
import { UnifiedGraphQLClient } from '@/lib/api/unified-graphql-client'
import { PREVIEW_YIELD_ESTIMATE } from '@/lib/api/yield-estimation-queries'
import { BinConfigurationSelector } from '@/components/production/bin-configuration-selector'
import { useProductionOrderDrafts, type ProductionOrderDraft } from '@/lib/hooks/use-production-order-drafts'
import { useAuth } from '@/lib/auth-context'
import { useRecipes, type Recipe } from '@/hooks/useRecipes'
import { useUnits, type Unit } from '@/hooks/useUnits'
import { type ContainerItem } from '@/lib/api/unified-scheduling-client'
import { useMillingBinConfigurations } from '@/hooks/use-milling-bin-configurations'

// Types for the wizard steps
// interface Recipe {
//   id: string
//   name: string
//   whiskeyType: string
//   customer: string
//   revision: number
//   active: boolean
//   mashBill?: string
//   cooksPerFermenter?: number
// }

// Export the ProductionOrderData interface so it can be used by other components
export interface ProductionOrderData {
  // Step 1: Recipe Selection
  selectedRecipe?: Recipe
  
  // Step 2: Basic Info & Parameters
  orderName: string
  quantity: number | ''
  units: string
  priority: 'high' | 'medium' | 'low'
  startDate: string
  endDate: string
  customerCode: string
  notes: string
  finalProof: number | ''
  containerItem: string
  containerType: string
  fermenters: number | ''
  cooks: number | ''
  totalGrainLoad: number | ''
  estBblsPerFerm: number | ''
  estPGsPerBshl: number | ''
  estPGsPerBbl: number | ''
  upperControlLimit: number | ''
  lowerControlLimit: number | ''
  
  // Step 3: BOM Configuration
  bomItems: BOMItem[]
  
  // Step 4: Bin Configuration
  binConfigurations: BinConfigurationData
  
  // Workflow Options
  autoSchedule?: boolean
}

interface BOMItem {
  id: string
  itemCode: string
  name: string
  quantity: number
  unit: string
  category: string
  itemGroup?: string
  // Formula configuration fields
  calculationMode?: 'STATIC' | 'FORMULA_GRAIN' | 'FORMULA_WATER' | 'ENZYME_NORMALIZED' | 'EXPRESSION'
  formulaType?: 'SIMPLE_RATIO' | 'WATER_PER_BUSHEL' | 'BACKSET_PERCENTAGE' | 'CUSTOM'
  formulaMultiplier?: number
  customExpression?: string
}

interface BinConfigurationData {
  sil110ConfigId: string // SIL-110 bin configuration
  sil115ConfigId: string // SIL-115 bin configuration  
  sil120ConfigId: string // SIL-120 bin configuration
  totalCooks: number
  totalFermenters: number
  cooksPerFermenter: number
  entryProof: number
  proofGallonsPerBarrel: number
  barrelsPerFermenter: number
}

interface ProductionOrderWizardProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: ProductionOrderData) => Promise<void>
}

export function ProductionOrderWizard({ isOpen, onClose, onSubmit }: ProductionOrderWizardProps) {
  const [currentStep, setCurrentStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isRecipeProcessing, setIsRecipeProcessing] = useState(false)
  const [containerItems, setContainerItems] = useState<ContainerItem[]>([])
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null)
  const [lastAutoSave, setLastAutoSave] = useState<Date | null>(null)
  const [isAutoSaving, setIsAutoSaving] = useState(false)
  const [formData, setFormData] = useState<ProductionOrderData>({
    orderName: '',
    quantity: '',
    units: '',
    priority: 'medium',
    startDate: '',
    endDate: '',
    customerCode: '',
    notes: '',
    finalProof: '',
    containerItem: '',
    containerType: '',
    fermenters: '',
    cooks: '',
    totalGrainLoad: '',
    estBblsPerFerm: '',
    estPGsPerBshl: '',
    estPGsPerBbl: '',
    upperControlLimit: '',
    lowerControlLimit: '',
    autoSchedule: false,
    bomItems: [],
    binConfigurations: {
      sil110ConfigId: '',
      sil115ConfigId: '',
      sil120ConfigId: '',
      totalCooks: 0,
      totalFermenters: 0,
      cooksPerFermenter: 0,
      entryProof: 0,
      proofGallonsPerBarrel: 0,
      barrelsPerFermenter: 0
    }
  })

  // Refs for auto-save debouncing
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastDataRef = useRef<string>('')

  // Draft management
  const { 
    saveDraft, 
    deleteDraft,
    recentDrafts, 
    isLoaded: draftsLoaded,
    hasSignificantChanges,
    config
  } = useProductionOrderDrafts()

  // Auto-save functionality
  const performAutoSave = useCallback(async () => {
    if (!formData || Object.keys(formData).length === 0) {
      return
    }

    const currentDataString = JSON.stringify(formData)
    
    // Check if data has actually changed
    if (currentDataString === lastDataRef.current) {
      return
    }

    // Check if there are significant changes
    if (lastDataRef.current && !hasSignificantChanges(
      JSON.parse(lastDataRef.current) as Record<string, unknown>, 
      formData as unknown as Record<string, unknown>
    )) {
      return
    }

    setIsAutoSaving(true)
    try {
      const draftId = saveDraft(formData as unknown as Record<string, unknown>, currentStep - 1, true, currentDraftId || undefined)
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
  }, [formData, currentStep, currentDraftId, saveDraft, hasSignificantChanges])

  // Set up auto-save when form data changes
  useEffect(() => {
    // Clear existing timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current)
    }

    // Only auto-save if we have meaningful data
    if (formData && Object.keys(formData).length > 0) {
      // Debounce auto-save by the configured interval
      autoSaveTimeoutRef.current = setTimeout(() => {
        performAutoSave()
      }, config.autoSaveInterval)
    }

    // Cleanup timeout on unmount
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current)
      }
    }
  }, [formData, performAutoSave, config.autoSaveInterval])

  // Sync finalProof to entryProof automatically
  useEffect(() => {
    const finalProofNum = typeof formData.finalProof === 'number' ? formData.finalProof : 0;
    // Auto-populate entryProof from finalProof if it hasn't been manually edited
    // (i.e., if it's still 0 or if finalProof changed and entryProof matches the old value)
    if (finalProofNum > 0 && formData.binConfigurations.entryProof === 0) {
      setFormData(prev => ({
        ...prev,
        binConfigurations: {
          ...prev.binConfigurations,
          entryProof: finalProofNum
        }
      }))
    }
  }, [formData.finalProof])

  // Fetch units from MES GraphQL API
  const { units, isLoading: unitsLoading, error: unitsError } = useUnits()

  // Fetch bin configurations for validation
  const { configurations: binConfigurations } = useMillingBinConfigurations()

  // Validate bin assignments against mash bill
  const validateBinAssignments = useCallback((): { valid: boolean; warnings: string[] } => {
    const warnings: string[] = []

    // Known item group aliases (for handling data inconsistencies)
    const itemGroupAliases: Record<string, string> = {
      'RM-GR-CRN': 'RM-GR-COR', // Corn alternative spelling
    }

    // Normalize item group names using aliases
    const normalizeItemGroup = (itemGroup: string): string => {
      return itemGroupAliases[itemGroup] || itemGroup
    }

    // Get grain item groups from BOM (mash bill)
    const grainItemGroups = new Set(
      formData.bomItems
        .filter(item => item.itemGroup?.startsWith('RM-GR'))
        .map(item => normalizeItemGroup(item.itemGroup!))
        .filter(Boolean) as string[]
    )

    if (grainItemGroups.size === 0) {
      // No grains in BOM, skip validation
      return { valid: true, warnings: [] }
    }

    // Get selected bin configuration details
    const selectedBinConfigIds = [
      formData.binConfigurations.sil110ConfigId,
      formData.binConfigurations.sil115ConfigId,
      formData.binConfigurations.sil120ConfigId
    ].filter(Boolean)

    if (selectedBinConfigIds.length === 0) {
      warnings.push('No bin configurations selected')
      return { valid: false, warnings }
    }

    // Find the actual bin configuration objects
    const selectedBinConfigs = binConfigurations?.filter(config =>
      selectedBinConfigIds.includes(config.id)
    ) || []

    // Get item groups supported by selected bins (normalized)
    const supportedItemGroups = new Set(
      selectedBinConfigs.map(config => normalizeItemGroup(config.itemGroup.name))
    )

    // Check if all grain item groups are supported
    const unsupportedItemGroups: string[] = []
    grainItemGroups.forEach(itemGroup => {
      if (!supportedItemGroups.has(itemGroup)) {
        unsupportedItemGroups.push(itemGroup)
      }
    })

    if (unsupportedItemGroups.length > 0) {
      warnings.push(
        `The following grain types in your mash bill are not supported by the selected bin configurations: ${unsupportedItemGroups.join(', ')}`
      )
      warnings.push(
        `Selected bins support: ${Array.from(supportedItemGroups).join(', ')}`
      )
      return { valid: false, warnings }
    }

    return { valid: true, warnings: [] }
  }, [formData.bomItems, formData.binConfigurations, binConfigurations])

  const steps = [
    { number: 1, title: 'Select Recipe', icon: Package },
    { number: 2, title: 'Basic Info & Parameters', icon: Settings },
    { number: 3, title: 'BOM Configuration', icon: List },
    { number: 4, title: 'Bin Configuration', icon: CheckCircle }
  ]

  // Load a draft
  const handleLoadDraft = useCallback((draft: ProductionOrderDraft) => {
    setFormData(draft.data as unknown as ProductionOrderData)
    setCurrentStep(draft.currentStep + 1) // Convert 0-based to 1-based
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
        setFormData({
          orderName: '',
          quantity: '',
          units: '',
          priority: 'medium',
          startDate: '',
          endDate: '',
          customerCode: '',
          notes: '',
          finalProof: '',
          containerItem: '',
          containerType: '',
          fermenters: '',
          cooks: '',
          totalGrainLoad: '',
          estBblsPerFerm: '',
          estPGsPerBshl: '',
          estPGsPerBbl: '',
          upperControlLimit: '',
          lowerControlLimit: '',
          autoSchedule: false,
          bomItems: [],
          binConfigurations: {
            sil110ConfigId: '',
            sil115ConfigId: '',
            sil120ConfigId: '',
            totalCooks: 0,
            totalFermenters: 0,
            cooksPerFermenter: 0,
            entryProof: 0,
            proofGallonsPerBarrel: 0,
            barrelsPerFermenter: 0
          }
        })
        setCurrentStep(1)
      }
    }
  }, [currentDraftId, deleteDraft])

  // Save as draft (manual save)
  const handleSaveDraft = async () => {
    setIsSubmitting(true)
    try {
      const draftId = saveDraft(formData as unknown as Record<string, unknown>, currentStep - 1, false, currentDraftId || undefined) // Convert 1-based to 0-based
      if (!currentDraftId) {
        setCurrentDraftId(draftId)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60)
    
    if (diffInHours < 1) {
      const diffInMinutes = Math.floor(diffInHours * 60)
      return `${diffInMinutes} minute${diffInMinutes !== 1 ? 's' : ''} ago`
    } else if (diffInHours < 24) {
      const hours = Math.floor(diffInHours)
      return `${hours} hour${hours !== 1 ? 's' : ''} ago`
    } else {
      return date.toLocaleDateString()
    }
  }

  // Generate production order name
  const generateOrderName = async (): Promise<string> => {
    try {
      return await unifiedSchedulingClient.generateProductionOrderName()
    } catch (error) {
      console.error('Error generating production order name:', error)
      // Fallback to timestamp-based naming if unified client fails
      const today = new Date()
      const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
      const timestamp = Date.now().toString().slice(-3)
      return `PRO-${dateStr}${timestamp}`
    }
  }

  // Reset form to initial state when wizard opens
  useEffect(() => {
    if (isOpen) {
      const initialData: ProductionOrderData = {
        orderName: '',
        quantity: '',
        units: '',
        priority: 'medium',
        startDate: '',
        endDate: '',
        customerCode: '',
        notes: '',
        finalProof: '',
        containerItem: '',
        containerType: '',
        fermenters: '',
        cooks: '',
        totalGrainLoad: '',
        estBblsPerFerm: '',
        estPGsPerBshl: '',
        estPGsPerBbl: '',
        upperControlLimit: '',
        lowerControlLimit: '',
        autoSchedule: false,
        bomItems: [],
        binConfigurations: {
          sil110ConfigId: '',
          sil115ConfigId: '',
          sil120ConfigId: '',
          totalCooks: 0,
          totalFermenters: 0,
          cooksPerFermenter: 0,
          entryProof: 0,
          proofGallonsPerBarrel: 0,
          barrelsPerFermenter: 0
        }
      }
      setFormData(initialData)
      // Initialize lastDataRef with the initial data so auto-save doesn't trigger without actual changes
      lastDataRef.current = JSON.stringify(initialData)
      setCurrentStep(1)
      setCurrentDraftId(null)
      setLastAutoSave(null)
    }
  }, [isOpen])

  // Fetch container items with itemGroup RM-BBL
  useEffect(() => {
    const fetchContainerItems = async () => {
      try {
        const items = await unifiedSchedulingClient.getContainerItems()
        setContainerItems(items)
      } catch (error) {
        console.error('Error fetching container items:', error)
        toast.error('Failed to load container items')
      }
    }

    if (isOpen) {
      fetchContainerItems()
    }
  }, [isOpen])

  const updateFormData = useCallback((updates: Partial<ProductionOrderData>) => {
    setFormData(prev => ({ ...prev, ...updates }))
  }, [])

  const handleRecipeSelect = async (recipe: Recipe) => {
    try {
      console.log('🔄 Recipe selected:', recipe)
      
      // Immediately update selection to provide visual feedback
      setIsRecipeProcessing(true)
      updateFormData({ selectedRecipe: recipe })
      
      const generatedOrderName = await generateOrderName()
      
      // Fetch the recipe BOM
      console.log('🔄 Fetching recipe BOM for recipe ID:', recipe.id)
      const recipeBomItems = await unifiedSchedulingClient.getRecipeBOM(recipe.id)
      console.log('📊 Fetched recipe BOM items:', recipeBomItems)
      
      // Map RecipeBOMItem to BOMItem and deduplicate by itemCode
      const bomItemMap = new Map<string, BOMItem>()
      recipeBomItems.forEach(item => {
        const key = item.itemCode
        const existing = bomItemMap.get(key)
        if (existing) {
          // Aggregate quantities for duplicate items
          existing.quantity = (existing.quantity || 0) + (item.quantity || 0)
        } else {
          const bomItem: BOMItem = {
            id: item.id,
            itemCode: item.itemCode,
            name: item.itemName || item.itemCode, // Fall back to itemCode if itemName is null
            quantity: item.quantity,
            unit: item.unit,
            category: item.category,
            itemGroup: item.itemGroup,
          }
          // Include formula configuration only if defined
          if (item.calculationMode) bomItem.calculationMode = item.calculationMode
          if (item.formulaType) bomItem.formulaType = item.formulaType
          if (item.formulaMultiplier !== undefined) bomItem.formulaMultiplier = item.formulaMultiplier
          if (item.customExpression) bomItem.customExpression = item.customExpression
          bomItemMap.set(key, bomItem)
        }
      })
      const mappedBomItems: BOMItem[] = Array.from(bomItemMap.values())

      console.log('📊 Mapped BOM items:', mappedBomItems)
      
      // Add container item to BOM if one is selected
      const finalBomItems = [...mappedBomItems]
      
      // Find the selected container item and add it to BOM
      if (formData.containerItem) {
        const selectedContainer = containerItems.find(item => item.id === formData.containerItem)
        if (selectedContainer) {
          const containerBomItem: BOMItem = {
            id: `container-${selectedContainer.id}`,
            itemCode: selectedContainer.itemNumber,
            name: selectedContainer.itemName,
            quantity: 1, // Default quantity for container
            unit: 'ea',
            category: 'Container',
            itemGroup: 'RM-BBL'
          }
          finalBomItems.push(containerBomItem)
          console.log('📦 Added container item to BOM:', containerBomItem)
        }
      }
      
      updateFormData({ 
        selectedRecipe: recipe,
        customerCode: recipe.customerCode,
        orderName: generatedOrderName,
        fermenters: '',
        cooks: '',
        binConfigurations: {
          ...formData.binConfigurations,
          cooksPerFermenter: recipe.cooksPerFermenter || 0
        },
        bomItems: finalBomItems // Set the final BOM items including container
      })
      
      console.log('✅ Updated form data with BOM items:', finalBomItems)
      
    } catch (error) {
      console.error('❌ Error in handleRecipeSelect:', error)
      toast.error('Failed to fetch recipe BOM. Please try again.')
      
      // Still update the basic recipe info even if BOM fetch fails
      // Note: We already updated selectedRecipe at the start, but we need to update other fields
      // and potentially clear BOM items if the fetch failed
      const generatedOrderName = await generateOrderName()
      updateFormData({ 
        // selectedRecipe: recipe, // Already set
        customerCode: recipe.customerCode,
        orderName: generatedOrderName,
        fermenters: '',
        cooks: '',
        binConfigurations: {
          ...formData.binConfigurations,
          cooksPerFermenter: recipe.cooksPerFermenter || 0
        },
        bomItems: [] // Empty BOM on error
      })
    } finally {
      setIsRecipeProcessing(false)
    }
  }

  const handleNext = () => {
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleSubmit = async () => {
    // Validate bin assignments against mash bill
    const validation = validateBinAssignments()

    if (!validation.valid) {
      // Show warning dialog
      const warningMessage = validation.warnings.join('\n\n')
      const confirmed = window.confirm(
        `⚠️ Bin Configuration Warning\n\n${warningMessage}\n\nDo you want to proceed anyway?`
      )

      if (!confirmed) {
        return // User cancelled
      }
    }

    setIsSubmitting(true)
    try {
      await onSubmit(formData)
      onClose()
    } catch (error) {
      toast.error('Failed to create production order')
      console.error('Error creating production order:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return !!formData.selectedRecipe
      case 2:
        // Basic validation
        const basicValid = formData.orderName && 
               formData.quantity !== '' && 
               formData.quantity > 0 && 
               formData.startDate && 
               formData.endDate && 
               formData.units && 
               formData.containerType &&
               formData.finalProof !== '' &&
               formData.finalProof > 0 &&
               formData.fermenters !== '' &&
               formData.fermenters > 0 &&
               formData.cooks !== '' &&
               formData.cooks > 0 &&
               formData.totalGrainLoad !== '' &&
               formData.totalGrainLoad > 0
        
        if (!basicValid) return false
        
        // Container item validation based on container type
        const requiresContainerItem = ['LargeBarrel', 'SmallBarrel'].includes(formData.containerType)
        if (requiresContainerItem) {
          return !!formData.containerItem
        }
        
        // For non-barrel types, container item should not be selected
        return !formData.containerItem
        
      case 3:
        return true // BOM can be empty initially
      case 4:
        return formData.binConfigurations.sil110ConfigId && 
               formData.binConfigurations.sil115ConfigId && 
               formData.binConfigurations.sil120ConfigId
      default:
        return false
    }
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return <RecipeSelectionStep 
          formData={formData} 
          handleRecipeSelect={handleRecipeSelect}
          isRecipeProcessing={isRecipeProcessing}
        />
      case 2:
        return <BasicInfoStep 
          formData={formData} 
          updateFormData={updateFormData} 
          containerItems={containerItems} 
          units={units}
          unitsLoading={unitsLoading}
          unitsError={unitsError}
        />
      case 3:
        return <BOMConfigurationStep formData={formData} units={units} />
      case 4:
        return <BinConfigurationStep formData={formData} updateFormData={updateFormData} />
      default:
        return null
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl max-h-[90vh] p-0">
        <div className="flex h-[90vh]">
          {/* Sidebar with drafts */}
          <div className="w-80 border-r bg-muted/30 p-6 overflow-auto">
            <div className="space-y-6">
              {/* Header */}
              <div>
                <h2 className="text-lg font-semibold">Create Production Order</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Follow the steps to create a new production order
                </p>
              </div>

              {/* Step Progress */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium">Progress</h3>
                <div className="space-y-2">
                  {steps.map((step) => {
                    const Icon = step.icon
                    const isActive = currentStep === step.number
                    const isCompleted = currentStep > step.number
                    
                    return (
                      <div key={step.number} className={`flex items-center gap-3 p-2 rounded ${
                        isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
                      }`}>
                        <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs ${
                          isCompleted 
                            ? 'bg-green-500 text-white' 
                            : isActive 
                              ? 'bg-primary text-primary-foreground' 
                              : 'bg-muted text-muted-foreground'
                        }`}>
                          {isCompleted ? (
                            <CheckCircle className="w-4 h-4" />
                          ) : (
                            <Icon className="w-4 h-4" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{step.title}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
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
                              {formatDate(draft.updatedAt)}
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
                  disabled={isSubmitting}
                  className="w-full"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {isSubmitting ? 'Saving...' : 'Save Draft'}
                </Button>
                
                {currentDraftId && (
                  <Button
                    variant="outline"
                    onClick={handleDeleteCurrentDraft}
                    disabled={isSubmitting}
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
                  <h1 className="text-2xl font-bold">{steps[currentStep - 1]?.title}</h1>
                  <p className="text-muted-foreground mt-1">
                    Step {currentStep} of {steps.length}
                  </p>
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
                  {renderStepContent()}
                </CardContent>
              </Card>
            </div>

            {/* Navigation Footer */}
            <div className="border-t p-6">
              <div className="flex items-center justify-between">
                <Button
                  variant="outline"
                  onClick={handlePrevious}
                  disabled={currentStep === 1}
                  className="flex items-center gap-2"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                
                <div className="flex gap-2">
                  <Button variant="outline" onClick={onClose}>
                    Cancel
                  </Button>
                  
                  {currentStep < 4 ? (
                    <Button
                      onClick={handleNext}
                      disabled={!canProceed()}
                      className="flex items-center gap-2"
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      onClick={handleSubmit}
                      disabled={!canProceed() || isSubmitting}
                      className="flex items-center gap-2"
                    >
                      {isSubmitting ? 'Creating...' : 'Create Order'}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Step 1: Recipe Selection
function RecipeSelectionStep({ formData, handleRecipeSelect, isRecipeProcessing }: {
  formData: ProductionOrderData
  handleRecipeSelect: (recipe: Recipe) => Promise<void>
  isRecipeProcessing: boolean
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const { recipes, loading, error, searchRecipes } = useRecipes()

  // Handle search with debouncing
  const handleSearchChange = (value: string) => {
    setSearchTerm(value)
    // Debounce the search to avoid too many API calls
    const timeoutId = setTimeout(() => {
      searchRecipes(value)
    }, 300)
    
    return () => clearTimeout(timeoutId)
  }

  // Filter recipes based on search term (client-side filtering for better UX)
  const filteredRecipes = recipes.filter(recipe => {
    if (!searchTerm) return true
    
    const searchLower = searchTerm.toLowerCase()
    return (
      recipe.name.toLowerCase().includes(searchLower) ||
      recipe.whiskeyType.toLowerCase().includes(searchLower) ||
      recipe.customer.toLowerCase().includes(searchLower) ||
      (recipe.mashBill?.toLowerCase().includes(searchLower) ?? false)
    )
  })

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Select Recipe</h3>
        <p className="text-gray-600 mb-4">Choose the recipe for this production order</p>
      </div>

      {/* Search Input */}
      <div className="space-y-2">
        <Label htmlFor="recipe-search">Search Recipes</Label>
        <div className="relative">
          <Input
            id="recipe-search"
            type="text"
            placeholder="Search by recipe name, whiskey type, customer, or mash bill..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10"
            disabled={loading}
          />
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>
        {searchTerm && !loading && (
          <p className="text-sm text-gray-500">
            Showing {filteredRecipes.length} of {recipes.length} recipes
          </p>
        )}
        {error && (
          <p className="text-sm text-red-600">
            {error} (Using fallback data)
          </p>
        )}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-gray-600">Loading recipes...</span>
        </div>
      )}

      {/* Recipe List */}
      {!loading && (
        <div className="grid grid-cols-1 gap-4">
          {filteredRecipes.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <p className="text-lg font-medium">No recipes found</p>
              <p className="text-sm">Try adjusting your search terms</p>
            </div>
          ) : (
            filteredRecipes.map((recipe) => (
              <Card 
                key={recipe.id}
                className={`cursor-pointer transition-all hover:shadow-md border-2 ${
                  formData.selectedRecipe?.id === recipe.id 
                    ? 'ring-2 ring-blue-500 border-blue-200' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => !isRecipeProcessing && handleRecipeSelect(recipe)}
              >
                <CardContent className="p-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h4 className="font-medium text-lg">{recipe.name}</h4>
                      <p className="text-gray-600 mt-1">{recipe.whiskeyType}</p>
                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                        <span>Customer: {recipe.customer}</span>
                        <span>Revision: {recipe.revision}</span>
                        {recipe.mashBill && <span>Mash Bill: {recipe.mashBill}</span>}
                        {recipe.cooksPerFermenter && <span>Cooks/Fermenter: {recipe.cooksPerFermenter}</span>}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant={recipe.active ? 'default' : 'secondary'}>
                        {recipe.active ? 'Active' : 'Inactive'}
                      </Badge>
                      {formData.selectedRecipe?.id === recipe.id && (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 flex items-center gap-1">
                          {isRecipeProcessing ? (
                            <>
                              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-700"></div>
                              Loading...
                            </>
                          ) : (
                            'Selected'
                          )}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// Step 2: Basic Info & Parameters
function BasicInfoStep({ formData, updateFormData, containerItems, units, unitsLoading, unitsError }: {
  formData: ProductionOrderData
  updateFormData: (updates: Partial<ProductionOrderData>) => void
  containerItems: ContainerItem[]
  units: Unit[]
  unitsLoading: boolean
  unitsError: string | null
}) {
  // Get current user for createdBy field
  const { user } = useAuth()

  // GraphQL client for yield estimation
  const graphqlClientRef = useRef(new UnifiedGraphQLClient({ useJWTAuth: true, enableRetry: true }))

  // Full yield estimate result for preview display
  const [yieldPreview, setYieldPreview] = useState<{
    estimatedPGsPerBushel: number
    estimatedPGsPerBbl: number
    estimatedBarrelsPerFermenter: number
    totalProofGallons: number
    totalGrainWeight: number
    totalCooks: number
    totalFermenters: number
    grainUnitsPerFerm: number
    pgPerFerm: number
    totalBarrels: number
    metricsUsed: { name: string; value: number }[]
    whiskeyType: string
    entryProof: number
  } | null>(null)
  const [yieldLoading, setYieldLoading] = useState(false)
  const [showYieldPreview, setShowYieldPreview] = useState(false)

  // Fetch yield estimate from backend and populate production parameter fields
  const fetchYieldEstimate = useCallback(async (
    whiskeyType: string,
    totalBarrels: number,
    entryProof: number,
    containerType: string,
    cooksPerFerm?: number,
  ) => {
    if (totalBarrels <= 0) return

    setYieldLoading(true)
    try {
      const result = await graphqlClientRef.current.query<{
        previewYieldEstimate: {
          estimatedPGsPerBushel: number
          estimatedPGsPerBbl: number
          estimatedBarrelsPerFermenter: number
          totalProofGallons: number
          totalGrainWeight: number
          totalCooks: number
          totalFermenters: number
          grainUnitsPerFerm: number
          pgPerFerm: number
          totalBarrels: number
          metricsUsed: { name: string; value: number }[]
        }
      }>(PREVIEW_YIELD_ESTIMATE, {
        variables: {
          input: {
            whiskeyType,
            totalBarrels,
            entryProof,
            containerType: containerType || 'LargeBarrel',
            cooksPerFerm: cooksPerFerm || undefined,
          }
        }
      })

      const estimate = result.previewYieldEstimate
      if (estimate) {
        // Store full result for preview
        setYieldPreview({ ...estimate, whiskeyType, entryProof })
        setShowYieldPreview(true)

        // Auto-populate form fields
        // totalGrainLoad = grain per cook (not total across all cooks)
        const grainPerCook = estimate.metricsUsed?.find(m => m.name === 'grainPerCook')?.value
          ?? (estimate.totalCooks > 0 ? Math.round(estimate.totalGrainWeight / estimate.totalCooks) : 0)
        const updates: Partial<ProductionOrderData> = {
          estBblsPerFerm: Math.round(estimate.estimatedBarrelsPerFermenter * 10) / 10,
          estPGsPerBshl: Math.round(estimate.estimatedPGsPerBushel * 10) / 10,
          estPGsPerBbl: Math.round(estimate.estimatedPGsPerBbl * 10) / 10,
          fermenters: estimate.totalFermenters,
          cooks: estimate.totalCooks,
          totalGrainLoad: Math.round(grainPerCook),
        }
        updateFormData(updates)
        console.log('Yield estimate applied:', estimate)
      }
    } catch (err) {
      console.warn('Yield estimation unavailable, using defaults:', err)
    } finally {
      setYieldLoading(false)
    }
  }, [updateFormData])

  // Auto-fetch yield estimate when recipe is selected and quantity is available
  const hasFetchedYieldRef = useRef<string | null>(null)
  useEffect(() => {
    const recipe = formData.selectedRecipe
    const quantity = typeof formData.quantity === 'number' ? formData.quantity : 0
    if (!recipe || quantity <= 0) return

    // Only auto-fetch once per recipe+quantity combo to avoid loops
    const key = `${recipe.id}-${quantity}`
    if (hasFetchedYieldRef.current === key) return
    hasFetchedYieldRef.current = key

    const proof = typeof formData.finalProof === 'number' ? formData.finalProof : 125
    fetchYieldEstimate(
      recipe.whiskeyType,
      quantity,
      proof,
      formData.containerType,
      recipe.cooksPerFermenter,
    )
  }, [formData.selectedRecipe, formData.quantity, formData.finalProof, formData.containerType, fetchYieldEstimate])

  // Function to calculate control limits based on quantity
  const calculateControlLimits = (quantity: number) => {
    const upperLimit = quantity * 1.05 // +5%
    const lowerLimit = quantity * 0.95 // -5%
    return { upperLimit, lowerLimit }
  }

  // Handle quantity change with automatic control limit calculation + yield estimation
  const handleQuantityChange = (value: string) => {
    const quantity = value === '' ? '' : Number(value)
    const updates: Partial<ProductionOrderData> = { quantity }

    // Auto-calculate control limits if quantity is valid
    if (typeof quantity === 'number' && quantity > 0) {
      const { upperLimit, lowerLimit } = calculateControlLimits(quantity)
      updates.upperControlLimit = upperLimit
      updates.lowerControlLimit = lowerLimit

      // Auto-calculate fermenters if estBblsPerFerm is set
      if (typeof formData.estBblsPerFerm === 'number' && formData.estBblsPerFerm > 0) {
        updates.fermenters = Math.ceil(quantity / formData.estBblsPerFerm)
      }

      // Fetch yield estimate if recipe is selected
      if (formData.selectedRecipe) {
        const proof = typeof formData.finalProof === 'number' ? formData.finalProof : 125
        fetchYieldEstimate(
          formData.selectedRecipe.whiskeyType,
          quantity,
          proof,
          formData.containerType,
          formData.selectedRecipe.cooksPerFermenter,
        )
      }
    }

    updateFormData(updates)
  }

  // Handle Est. Bbls Per Ferm change with automatic fermenter calculation
  const handleEstBblsPerFermChange = (value: string) => {
    const estBblsPerFerm = value === '' ? '' : Number(value)
    
    // Allow any input value but provide validation feedback
    const updates: Partial<ProductionOrderData> = { 
      estBblsPerFerm 
    }
    
    // If quantity is set and value is valid, recalculate fermenters
    if (typeof estBblsPerFerm === 'number' && typeof formData.quantity === 'number' && 
        formData.quantity > 0 && estBblsPerFerm > 0) {
      const calculatedFermenters = Math.ceil(formData.quantity / estBblsPerFerm)
      updates.fermenters = calculatedFermenters
    }
    
    updateFormData(updates)
  }

  // Handle fermenters change with automatic cooks calculation
  const handleFermentersChange = (value: string) => {
    const fermenters = value === '' ? '' : Number(value)
    const updates: Partial<ProductionOrderData> = { fermenters }
    
    // Auto-calculate cooks (3x fermenters)
    if (typeof fermenters === 'number' && fermenters > 0) {
      updates.cooks = fermenters * 3
    }
    
    updateFormData(updates)
  }

  // Handle container item selection with automatic container type setting
  const handleContainerItemChange = (value: string) => {
    const updates: Partial<ProductionOrderData> = { containerItem: value }
    
    // If a container item is selected, determine appropriate container type based on item details
    if (value) {
      const selectedItem = containerItems.find(item => item.id === value)
      if (selectedItem) {
        // Check item group to determine container type
        const itemGroupName = selectedItem.itemGroup?.toLowerCase() || ''
        if (itemGroupName.includes('barrel') && itemGroupName.includes('53')) {
          updates.containerType = 'LargeBarrel'
        } else if (itemGroupName.includes('barrel') && itemGroupName.includes('30')) {
          updates.containerType = 'SmallBarrel'
        } else {
          // Default to LargeBarrel for other barrel items
          updates.containerType = 'LargeBarrel'
        }
      }
    } else {
      // Clear container type when no container item is selected
      updates.containerType = ''
    }
    
    updateFormData(updates)
  }

  // Handle container type changes with validation
  const handleContainerTypeChange = (value: string) => {
    const updates: Partial<ProductionOrderData> = { containerType: value }
    
    // Auto-select units based on container type
    const unitMap: Record<string, string> = {
      'LargeBarrel': '53-bbl',
      'SmallBarrel': '30-bbl',
      'PlasticDrum': 'drum',
      'IbcTote275': 'ibc-275',
      'SsTote275': 'ss-275',
      'BulkLoadout': 'gal'
    }

    const targetUnitAbbr = unitMap[value]
    if (targetUnitAbbr) {
      // Find unit by abbreviation
      const targetUnit = units.find(u => u.abbreviation?.toLowerCase() === targetUnitAbbr.toLowerCase())
      if (targetUnit) {
        updates.units = targetUnit.id
      } else if (value === 'BulkLoadout') {
        // Fallback for bulk if 'gal' isn't found (unlikely)
        updates.units = 'Gallons'
      }
    }
    
    // Clear container item if the new container type doesn't require container item selection
    const requiresContainerItem = ['LargeBarrel', 'SmallBarrel'].includes(value)
    if (!requiresContainerItem) {
      updates.containerItem = ''
    } else if (formData.containerItem) {
      // Validate if current container item is compatible with new container type
      const selectedItem = containerItems.find(item => item.id === formData.containerItem)
      if (selectedItem) {
        const itemGroupName = selectedItem.itemGroup?.toLowerCase() || ''
        const isCompatible = 
          (value === 'LargeBarrel' && (itemGroupName.includes('53') || itemGroupName.includes('rm-bbl'))) ||
          (value === 'SmallBarrel' && (itemGroupName.includes('30') || itemGroupName.includes('rm-bbl')))
        
        if (!isCompatible) {
          updates.containerItem = ''
          toast.error(`Selected container item is not compatible with ${value}. Please select a different container item.`)
        }
      }
    }
    
    updateFormData(updates)
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Basic Information & Parameters</h3>
        <p className="text-gray-600 mb-4">Configure the basic details and production parameters for this order</p>
      </div>

      {/* Basic Information */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="orderName">Order Name *</Label>
          <Input
            id="orderName"
            value={formData.orderName}
            onChange={(e) => updateFormData({ orderName: e.target.value })}
            placeholder="Enter order name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="startDate">Start Date *</Label>
          <Input
            id="startDate"
            type="date"
            value={formData.startDate ? new Date(formData.startDate).toISOString().slice(0, 10) : ''}
            onChange={(e) => {
              // Convert local date to UTC ISO string
              const localDate = e.target.value; // "YYYY-MM-DD"
              const utcDate = localDate ? new Date(localDate + 'T00:00:00.000Z').toISOString() : '';
              updateFormData({ startDate: utcDate });
            }}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="endDate">End Date *</Label>
          <Input
            id="endDate"
            type="date"
            value={formData.endDate ? new Date(formData.endDate).toISOString().slice(0, 10) : ''}
            onChange={(e) => {
              // Convert local date to UTC ISO string
              const localDate = e.target.value; // "YYYY-MM-DD"
              const utcDate = localDate ? new Date(localDate + 'T00:00:00.000Z').toISOString() : '';
              updateFormData({ endDate: utcDate });
            }}
            min={formData.startDate ? new Date(formData.startDate).toISOString().slice(0, 10) : ''}
          />
          {formData.startDate && formData.endDate && formData.endDate < formData.startDate && (
            <p className="text-sm text-red-600">End date cannot be before start date</p>
          )}
        </div>

        <div className="flex items-end pb-2">
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="autoSchedule" 
              checked={formData.autoSchedule || false}
              onCheckedChange={(checked) => updateFormData({ autoSchedule: checked === true })}
            />
            <div className="grid gap-1.5 leading-none">
              <Label 
                htmlFor="autoSchedule"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Automatically Add to Schedule
              </Label>
              <p className="text-xs text-muted-foreground">
                If checked, the order will be automatically scheduled upon creation.
              </p>
            </div>
          </div>
        </div>


        <div className="space-y-2">
          <Label htmlFor="quantity">Quantity *</Label>
          <Input
            id="quantity"
            type="number"
            value={formData.quantity}
            onChange={(e) => handleQuantityChange(e.target.value)}
            placeholder="Enter quantity"
            min="1"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="finalProof">Final Proof *</Label>
          <Input
            id="finalProof"
            type="number"
            value={formData.finalProof}
            onChange={(e) => updateFormData({ finalProof: e.target.value === '' ? '' : Number(e.target.value) })}
            placeholder="Enter final proof"
            min="0"
            max="200"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="upperControlLimit">Upper Control Limit</Label>
          <Input
            id="upperControlLimit"
            type="number"
            value={formData.upperControlLimit}
            onChange={(e) => updateFormData({ upperControlLimit: e.target.value === '' ? '' : Number(e.target.value) })}
            placeholder="Auto-calculated (+5%)"
            min="0"
            step="0.01"
          />
          {typeof formData.quantity === 'number' && formData.quantity > 0 && (
            <p className="text-sm text-gray-500">
              Auto-calculated as quantity + 5%
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="lowerControlLimit">Lower Control Limit</Label>
          <Input
            id="lowerControlLimit"
            type="number"
            value={formData.lowerControlLimit}
            onChange={(e) => updateFormData({ lowerControlLimit: e.target.value === '' ? '' : Number(e.target.value) })}
            placeholder="Auto-calculated (-5%)"
            min="0"
            step="0.01"
          />
          {typeof formData.quantity === 'number' && formData.quantity > 0 && (
            <p className="text-sm text-gray-500">
              Auto-calculated as quantity - 5%
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="containerType">Container Type *</Label>
          <Select
            value={formData.containerType}
            onValueChange={(value) => handleContainerTypeChange(value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select container type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="LargeBarrel">53-Gallon Barrel</SelectItem>
              <SelectItem value="SmallBarrel">30-Gallon Barrel</SelectItem>
              <SelectItem value="BulkLoadout">Bulk Loadout</SelectItem>
              <SelectItem value="PlasticDrum">Plastic Drum</SelectItem>
              <SelectItem value="IbcTote275">275-Gallon IBC Tote</SelectItem>
              <SelectItem value="SsTote275">275-Gallon SS Tote</SelectItem>
            </SelectContent>
          </Select>
          {formData.containerType && ['LargeBarrel', 'SmallBarrel'].includes(formData.containerType) && (
            <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
              <span>⚠️ Container item selection required for barrel types</span>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="containerItem">
            Container Item {['LargeBarrel', 'SmallBarrel'].includes(formData.containerType) && '*'}
          </Label>
          <Select
            value={formData.containerItem}
            onValueChange={(value) => handleContainerItemChange(value)}
            disabled={!['LargeBarrel', 'SmallBarrel'].includes(formData.containerType)}
          >
            <SelectTrigger>
              <SelectValue placeholder={
                !['LargeBarrel', 'SmallBarrel'].includes(formData.containerType) 
                  ? "Select container type first" 
                  : "Select container item"
              } />
            </SelectTrigger>
            <SelectContent>
              {containerItems
                .filter(item => {
                  if (!formData.containerType) return false
                  const itemGroupName = item.itemGroup?.toLowerCase() || ''
                  const itemName = item.itemName?.toLowerCase() || ''
                  const itemNumber = item.itemNumber?.toLowerCase() || ''
                  
                  if (formData.containerType === 'LargeBarrel') {
                    const is53 = itemName.includes('53') || itemNumber.includes('53') || itemGroupName.includes('53')
                    const isBarrel = itemGroupName.includes('barrel') || itemGroupName.includes('rm-bbl')
                    return (isBarrel && is53) || (itemGroupName.includes('rm-bbl') && !itemName.includes('30') && !itemNumber.includes('30'))
                  } else if (formData.containerType === 'SmallBarrel') {
                    const is30 = itemName.includes('30') || itemNumber.includes('30') || itemGroupName.includes('30')
                    const isBarrel = itemGroupName.includes('barrel') || itemGroupName.includes('rm-bbl')
                    return (isBarrel && is30) || (itemGroupName.includes('rm-bbl') && !itemName.includes('53') && !itemNumber.includes('53'))
                  }
                  return false
                })
                .map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.itemName} ({item.itemNumber})
                  </SelectItem>
                ))
              }
            </SelectContent>
          </Select>
          {formData.containerType && !['LargeBarrel', 'SmallBarrel'].includes(formData.containerType) && (
            <div className="flex items-center gap-2 p-2 bg-gray-50 border border-gray-200 rounded text-sm text-gray-600">
              <span>Container items are not required for {formData.containerType}</span>
            </div>
          )}
          {formData.containerItem && formData.containerType && (
            <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded text-sm text-green-800">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span>Container item selected for {formData.containerType}</span>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="priority">Priority</Label>
          <Select
            value={formData.priority}
            onValueChange={(value) => updateFormData({ priority: value as 'high' | 'medium' | 'low' })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Production Parameters */}
      <div>
        <h4 className="text-md font-semibold mb-4">Production Parameters</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="fermenters">Fermenters *</Label>
            <Input
              id="fermenters"
              type="number"
              value={formData.fermenters}
              onChange={(e) => handleFermentersChange(e.target.value)}
              placeholder="Enter number of fermenters"
              min="1"
            />
            {typeof formData.quantity === 'number' && typeof formData.estBblsPerFerm === 'number' && 
             formData.quantity > 0 && formData.estBblsPerFerm > 0 && (
              <p className="text-sm text-gray-500">
                Auto-calculated from quantity ÷ Est. Bbls Per Ferm ({formData.quantity} ÷ {formData.estBblsPerFerm})
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="cooks">Cooks *</Label>
            <Input
              id="cooks"
              type="number"
              value={formData.cooks}
              onChange={(e) => updateFormData({ cooks: e.target.value === '' ? '' : Number(e.target.value) })}
              placeholder="Auto-calculated (3x fermenters)"
              min="1"
            />
            {typeof formData.fermenters === 'number' && formData.fermenters > 0 && (
              <p className="text-sm text-gray-500">
                Auto-calculated as fermenters × 3 ({formData.fermenters} × 3 = {formData.fermenters * 3})
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="totalGrainLoad">Grain Per Cook (lbs) *</Label>
            <Input
              id="totalGrainLoad"
              type="number"
              value={formData.totalGrainLoad}
              onChange={(e) => updateFormData({ totalGrainLoad: e.target.value === '' ? '' : Number(e.target.value) })}
              placeholder="Enter total grain load"
              min="0"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="estBblsPerFerm">Est. Bbls Per Ferm</Label>
            <Input
              id="estBblsPerFerm"
              type="number"
              value={formData.estBblsPerFerm}
              onChange={(e) => handleEstBblsPerFermChange(e.target.value)}
              placeholder="Auto-calculated from yield metrics"
              step="0.1"
            />
            {typeof formData.estBblsPerFerm === 'number' && (formData.estBblsPerFerm < 50 || formData.estBblsPerFerm > 150) && (
              <p className="text-sm text-amber-600">
                Recommended range is 50-150 barrels per fermenter
              </p>
            )}
            <p className="text-sm text-gray-500">
              Auto-populated from yield estimation. Override if needed.
            </p>
            {typeof formData.quantity === 'number' && typeof formData.estBblsPerFerm === 'number' && 
             formData.quantity > 0 && formData.estBblsPerFerm > 0 && (
              <p className="text-sm text-blue-600">
                Calculated fermenters: {Math.ceil(formData.quantity / formData.estBblsPerFerm)}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="estPGsPerBshl">Est. PGs Per Bshl</Label>
            <Input
              id="estPGsPerBshl"
              type="number"
              value={formData.estPGsPerBshl}
              onChange={(e) => updateFormData({ estPGsPerBshl: e.target.value === '' ? '' : Number(e.target.value) })}
              placeholder="Auto-calculated from yield metrics"
              min="0"
              step="0.1"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="estPGsPerBbl">Est. PGs Per Bbl</Label>
            <Input
              id="estPGsPerBbl"
              type="number"
              value={formData.estPGsPerBbl}
              onChange={(e) => updateFormData({ estPGsPerBbl: e.target.value === '' ? '' : Number(e.target.value) })}
              placeholder="Auto-calculated from yield metrics"
              min="0"
              step="0.1"
            />
          </div>
        </div>
      </div>

      {/* Yield Estimation Preview */}
      {formData.selectedRecipe && (
        <div className="border rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => {
              if (!yieldPreview && !yieldLoading && typeof formData.quantity === 'number' && formData.quantity > 0) {
                const proof = typeof formData.finalProof === 'number' ? formData.finalProof : 125
                fetchYieldEstimate(
                  formData.selectedRecipe!.whiskeyType,
                  formData.quantity,
                  proof,
                  formData.containerType,
                  formData.selectedRecipe!.cooksPerFermenter,
                )
              }
              setShowYieldPreview(prev => !prev)
            }}
            className="w-full flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Calculator className="h-4 w-4 text-amber-600" />
              <span className="font-medium text-amber-800 dark:text-amber-300 text-sm">Yield Estimation Preview</span>
              {yieldPreview && (
                <span className="inline-flex items-center rounded-full bg-amber-200 dark:bg-amber-800 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-200">
                  {yieldPreview.estimatedPGsPerBushel} PG/GU
                </span>
              )}
              {yieldLoading && (
                <span className="text-xs text-amber-600 animate-pulse">Calculating...</span>
              )}
            </div>
            <ChevronRight className={`h-4 w-4 text-amber-600 transition-transform ${showYieldPreview ? 'rotate-90' : ''}`} />
          </button>

          {showYieldPreview && yieldPreview && (
            <div className="p-4 bg-amber-50/50 dark:bg-amber-950/20 border-t border-amber-200 dark:border-amber-800 space-y-3">
              {/* Whiskey type + yield rate badge */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/40 px-3 py-1 text-sm font-medium text-amber-800 dark:text-amber-200">
                  {yieldPreview.estimatedPGsPerBushel} PG/GU — {['RyeBourbon', 'WheatedBourbon', 'FourGrainBourbon'].includes(yieldPreview.whiskeyType) ? 'Bourbon' : 'Whiskey'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {yieldPreview.whiskeyType.replace(/([A-Z])/g, ' $1').trim()} | {yieldPreview.entryProof}° proof
                </span>
              </div>

              {/* Calculation chain */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                <div className="p-2 rounded bg-white/80 dark:bg-gray-800/60 border">
                  <div className="text-xs text-muted-foreground">GU / Fermenter</div>
                  <div className="font-semibold">{yieldPreview.grainUnitsPerFerm.toFixed(1)} bu</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    grainPerCook &times; cooksPerFerm / 56
                  </div>
                </div>
                <div className="p-2 rounded bg-white/80 dark:bg-gray-800/60 border">
                  <div className="text-xs text-muted-foreground">PG / Barrel</div>
                  <div className="font-semibold">{yieldPreview.estimatedPGsPerBbl.toFixed(1)}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    ({yieldPreview.entryProof}/100) &times; avgBarrelFill
                  </div>
                </div>
                <div className="p-2 rounded bg-white/80 dark:bg-gray-800/60 border">
                  <div className="text-xs text-muted-foreground">PG / Fermenter</div>
                  <div className="font-semibold">{yieldPreview.pgPerFerm.toFixed(0)}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {yieldPreview.grainUnitsPerFerm.toFixed(1)} &times; {yieldPreview.estimatedPGsPerBushel}
                  </div>
                </div>
                <div className="p-2 rounded bg-white/80 dark:bg-gray-800/60 border">
                  <div className="text-xs text-muted-foreground">BBL / Fermenter</div>
                  <div className="font-semibold">{yieldPreview.estimatedBarrelsPerFermenter.toFixed(1)}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {yieldPreview.pgPerFerm.toFixed(0)} / {yieldPreview.estimatedPGsPerBbl.toFixed(1)}
                  </div>
                </div>
              </div>

              {/* Computed totals */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                <div className="p-2 rounded bg-white/80 dark:bg-gray-800/60 border">
                  <div className="text-xs text-muted-foreground">Fermenters</div>
                  <div className="font-semibold">{yieldPreview.totalFermenters}</div>
                </div>
                <div className="p-2 rounded bg-white/80 dark:bg-gray-800/60 border">
                  <div className="text-xs text-muted-foreground">Cooks</div>
                  <div className="font-semibold">{yieldPreview.totalCooks}</div>
                </div>
                <div className="p-2 rounded bg-white/80 dark:bg-gray-800/60 border">
                  <div className="text-xs text-muted-foreground">Total Grain</div>
                  <div className="font-semibold">{(yieldPreview.totalGrainWeight / 1000).toFixed(1)}k lbs</div>
                </div>
                <div className="p-2 rounded bg-white/80 dark:bg-gray-800/60 border">
                  <div className="text-xs text-muted-foreground">Total PG</div>
                  <div className="font-semibold">{yieldPreview.totalProofGallons.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                </div>
              </div>

              {/* Metrics used */}
              {yieldPreview.metricsUsed.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-amber-700 dark:text-amber-400 font-medium">
                    Metrics used ({yieldPreview.metricsUsed.length})
                  </summary>
                  <div className="mt-1 grid grid-cols-2 md:grid-cols-3 gap-1">
                    {yieldPreview.metricsUsed.map((m) => (
                      <div key={m.name} className="flex justify-between px-2 py-1 rounded bg-white/60 dark:bg-gray-800/40 border">
                        <span className="text-muted-foreground">{m.name.replace(/_/g, ' ')}</span>
                        <span className="font-mono font-medium">{m.value}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {/* Recalculate button */}
              <div className="flex items-center gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (typeof formData.quantity === 'number' && formData.quantity > 0 && formData.selectedRecipe) {
                      hasFetchedYieldRef.current = null
                      const proof = typeof formData.finalProof === 'number' ? formData.finalProof : 125
                      fetchYieldEstimate(
                        formData.selectedRecipe.whiskeyType,
                        formData.quantity,
                        proof,
                        formData.containerType,
                        formData.selectedRecipe.cooksPerFermenter,
                      )
                    }
                  }}
                  disabled={yieldLoading || typeof formData.quantity !== 'number' || formData.quantity <= 0}
                  className="text-amber-700 border-amber-300 hover:bg-amber-100 dark:text-amber-300 dark:border-amber-700 dark:hover:bg-amber-900/30"
                >
                  <Calculator className="h-3 w-3 mr-1" />
                  {yieldLoading ? 'Calculating...' : 'Recalculate'}
                </Button>
                <span className="text-xs text-muted-foreground">
                  Values above auto-populate the Production Parameters. You can override any field.
                </span>
              </div>
            </div>
          )}

          {showYieldPreview && !yieldPreview && !yieldLoading && (
            <div className="p-4 bg-amber-50/50 dark:bg-amber-950/20 border-t border-amber-200 dark:border-amber-800">
              <p className="text-sm text-muted-foreground">
                Enter a quantity (total barrels) to see yield estimation calculations.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Additional Information */}
      <div className="space-y-2">
        <Label htmlFor="customerCode">Customer Code</Label>
        <Input
          id="customerCode"
          value={formData.customerCode}
          onChange={(e) => updateFormData({ customerCode: e.target.value })}
          placeholder="Customer code (auto-filled from recipe)"
          disabled={!!formData.selectedRecipe}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => updateFormData({ notes: e.target.value })}
          placeholder="Additional notes or requirements..."
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="createdBy">Created By</Label>
        <Input
          id="createdBy"
          value={user?.email || 'unknown-user'}
          readOnly
          className="bg-muted"
          placeholder="Automatically set to the logged-in user"
        />
        <p className="text-sm text-muted-foreground">
          Automatically set to the logged-in user
        </p>
      </div>
    </div>
  )
}

// Step 3: BOM Configuration
function BOMConfigurationStep({ formData, units }: {
  formData: ProductionOrderData
  units: Unit[]
}) {
  // Map itemGroup codes to display names
  const getItemGroupDisplayName = (itemGroup?: string): string => {
    if (!itemGroup) return 'Other'

    const itemGroupMap: Record<string, string> = {
      'RM-GR': 'Grain',
      'RM-YEA': 'Yeast',
      'RM-BBL': 'Barrel',
      'RM-ENZ': 'Enzyme'
    }

    return itemGroupMap[itemGroup] || itemGroup
  }

  // Helper function to get unit display name from ID
  const getUnitDisplayName = (unitId: string): string => {
    const unit = units.find(u => u.id === unitId)
    return unit ? unit.abbreviation : unitId || 'ea'
  }

  // Helper to get formula display info
  const getFormulaDisplayInfo = (item: BOMItem): {
    hasFormula: boolean
    icon: React.ReactNode
    label: string
    description: string
    className: string
  } | null => {
    if (!item.calculationMode || item.calculationMode === 'STATIC') {
      return null
    }

    const formulaInfo: Record<string, {
      icon: React.ReactNode
      label: string
      description: string
      className: string
    }> = {
      'FORMULA_GRAIN': {
        icon: <Wheat className="h-3 w-3" />,
        label: 'Grain',
        description: `Grain load × ${item.formulaMultiplier ?? 1}`,
        className: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700'
      },
      'FORMULA_WATER': {
        icon: <Droplets className="h-3 w-3" />,
        label: 'Water',
        description: `Water load × ${item.formulaMultiplier ?? 1}`,
        className: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700'
      },
      'ENZYME_NORMALIZED': {
        icon: <FlaskConical className="h-3 w-3" />,
        label: 'Enzyme',
        description: 'Normalized enzyme dosing',
        className: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700'
      },
      'EXPRESSION': {
        icon: <Code className="h-3 w-3" />,
        label: 'Formula',
        description: item.customExpression || 'Custom expression',
        className: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700'
      }
    }

    const info = formulaInfo[item.calculationMode]
    return info ? { hasFormula: true, ...info } : null
  }

  // Check if any items have formulas
  const hasFormulaItems = formData.bomItems.some(item =>
    item.calculationMode && item.calculationMode !== 'STATIC'
  )

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Bill of Materials Configuration</h3>
        <p className="text-muted-foreground mb-4">The BOM will be automatically generated from the selected recipe</p>
      </div>

      {formData.selectedRecipe ? (
        <div className="space-y-4">
          {/* Status and Info */}
          <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
              <span className="text-green-800 dark:text-green-100 font-medium">BOM Generated from Recipe</span>
            </div>
            <Badge variant="outline" className="bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-700">
              {formData.bomItems.length} items
            </Badge>
          </div>

          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mt-0.5">
                <span className="text-blue-600 dark:text-blue-400 text-xs font-medium">ℹ</span>
              </div>
              <div className="text-sm text-blue-800 dark:text-blue-100">
                <p className="font-medium mb-1">Automatic BOM Generation</p>
                <p className="text-blue-700 dark:text-blue-300">The Bill of Materials will include all recipe ingredients plus the selected container item. Item categories are automatically mapped based on item groups.</p>
              </div>
            </div>
          </div>

          {/* Formula Calculation Info */}
          {hasFormulaItems && (
            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  <Calculator className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="text-sm text-amber-800 dark:text-amber-100">
                  <p className="font-medium mb-1">Formula-Based Quantities</p>
                  <p className="text-amber-700 dark:text-amber-300">
                    Items with formula badges will have their quantities calculated when the order is created,
                    based on grain load, water load, and other production parameters.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* BOM Items Display */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recipe BOM Items</CardTitle>
              <CardDescription>
                Items from recipe: {formData.selectedRecipe.name}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {formData.bomItems.length > 0 ? (
                <div className="divide-y">
                  {formData.bomItems.map((item) => {
                    const formulaInfo = getFormulaDisplayInfo(item)
                    return (
                      <div key={item.id} className="flex items-center justify-between py-2.5">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="font-medium text-sm truncate">{item.name}</span>
                          <Badge variant="secondary" className="text-[10px] shrink-0 opacity-60">
                            {getItemGroupDisplayName(item.itemGroup || item.category)}
                          </Badge>
                          {/* Formula indicator */}
                          {formulaInfo && (
                            <Badge
                              variant="outline"
                              className={`text-[10px] shrink-0 flex items-center gap-1 ${formulaInfo.className}`}
                              title={formulaInfo.description}
                            >
                              {formulaInfo.icon}
                              <span>{formulaInfo.label}</span>
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-4">
                          {formulaInfo ? (
                            <span className="text-xs text-muted-foreground italic" title={formulaInfo.description}>
                              {formulaInfo.description}
                            </span>
                          ) : (
                            <span className="text-sm font-medium">
                              {typeof item.quantity === 'number'
                                ? item.quantity < 1
                                  ? `${(item.quantity * 100).toFixed(2)}%`
                                  : item.quantity.toFixed(2)
                                : item.quantity} {getUnitDisplayName(item.unit)}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}

                  {/* Container Item Preview */}
                  {formData.containerItem && formData.containerType && (
                    <div className="flex items-center justify-between py-2 bg-blue-50 dark:bg-blue-900/20 -mx-6 px-6 mt-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700">
                          Barrel
                        </Badge>
                        <span className="font-medium text-sm">{formData.containerType}</span>
                      </div>
                      <span className="text-sm text-blue-700 dark:text-blue-300">
                        {formData.quantity || 0} {getUnitDisplayName(formData.units)}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 text-center text-gray-500">
                  <p>No BOM items found for this recipe.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="p-8 text-center">
            <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">Select a recipe first to generate the BOM</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// Step 4: Bin Configuration
function BinConfigurationStep({ formData, updateFormData }: {
  formData: ProductionOrderData
  updateFormData: (updates: Partial<ProductionOrderData>) => void
}) {
  const handleBinConfigChange = React.useCallback((field: keyof BinConfigurationData, value: number | string) => {
    updateFormData({
      binConfigurations: {
        ...formData.binConfigurations,
        [field]: value
      }
    })
  }, [formData.binConfigurations, updateFormData])

  // Auto-fill totalCooks when cooks value changes
  React.useEffect(() => {
    if (typeof formData.cooks === 'number' && formData.cooks > 0) {
      if (formData.binConfigurations.totalCooks !== formData.cooks) {
        handleBinConfigChange('totalCooks', formData.cooks)
      }
    }
  }, [formData.cooks, formData.binConfigurations.totalCooks, handleBinConfigChange])

  // Auto-fill totalFermenters when fermenters value changes
  React.useEffect(() => {
    if (typeof formData.fermenters === 'number' && formData.fermenters > 0) {
      if (formData.binConfigurations.totalFermenters !== formData.fermenters) {
        handleBinConfigChange('totalFermenters', formData.fermenters)
      }
    }
  }, [formData.fermenters, formData.binConfigurations.totalFermenters, handleBinConfigChange])

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Bin Configuration</h3>
        <p className="text-gray-600 mb-4">Configure the bin assignments for this production order</p>
      </div>

      {/* Production Parameters Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Production Parameters</CardTitle>
          <CardDescription>
            Auto-calculated values from the basic information step
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <Label className="text-sm text-muted-foreground">Total Cooks</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={formData.binConfigurations.totalCooks}
                  onChange={(e) => handleBinConfigChange('totalCooks', e.target.value === '' ? 0 : Number(e.target.value))}
                  className="h-8"
                  min="0"
                />
                {typeof formData.cooks === 'number' && formData.cooks > 0 && (
                  <Badge variant="outline" className="text-xs">
                    Auto-filled
                  </Badge>
                )}
              </div>
              {typeof formData.cooks === 'number' && formData.cooks > 0 && (
                <p className="text-xs text-muted-foreground">
                  From cooks: {formData.cooks}
                </p>
              )}
            </div>
            
            <div className="space-y-1">
              <Label className="text-sm text-muted-foreground">Total Fermenters</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={formData.binConfigurations.totalFermenters}
                  onChange={(e) => handleBinConfigChange('totalFermenters', e.target.value === '' ? 0 : Number(e.target.value))}
                  className="h-8"
                  min="0"
                />
                {typeof formData.fermenters === 'number' && formData.fermenters > 0 && (
                  <Badge variant="outline" className="text-xs">
                    Auto-filled
                  </Badge>
                )}
              </div>
              {typeof formData.fermenters === 'number' && formData.fermenters > 0 && (
                <p className="text-xs text-muted-foreground">
                  From fermenters: {formData.fermenters}
                </p>
              )}
            </div>
            
            <div className="space-y-1">
              <Label className="text-sm text-muted-foreground">Cooks Per Fermenter</Label>
              <Input
                type="number"
                value={formData.binConfigurations.cooksPerFermenter}
                onChange={(e) => handleBinConfigChange('cooksPerFermenter', e.target.value === '' ? 0 : Number(e.target.value))}
                className="h-8"
                min="0"
                step="0.1"
              />
              {formData.selectedRecipe?.cooksPerFermenter && (
                <p className="text-xs text-muted-foreground">
                  Recipe default: {formData.selectedRecipe.cooksPerFermenter}
                </p>
              )}
            </div>
            
            <div className="space-y-1">
              <Label className="text-sm text-muted-foreground">Entry Proof</Label>
              <Input
                type="text"
                value={formData.binConfigurations.entryProof || formData.finalProof || ''}
                onChange={(e) => {
                  const value = e.target.value;
                  // Allow empty string or valid decimal numbers
                  if (value === '' || /^\d*\.?\d*$/.test(value)) {
                    handleBinConfigChange('entryProof', value === '' ? 0 : parseFloat(value));
                  }
                }}
                onBlur={(e) => {
                  // Validate range on blur
                  const num = parseFloat(e.target.value) || 0;
                  if (num < 0 || num > 200) {
                    handleBinConfigChange('entryProof', Math.max(0, Math.min(200, num)));
                  }
                }}
                placeholder="From Final Proof"
                className="h-8"
              />
              <p className="text-xs text-muted-foreground">Auto-filled from Final Proof (valid range: 0-200)</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bin Configuration Selectors */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bin Assignments</CardTitle>
          <CardDescription>
            Select the configured bins for each silo. All three bins must be configured for the production order.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <BinConfigurationSelector
              value={formData.binConfigurations.sil110ConfigId}
              onValueChange={(value) => handleBinConfigChange('sil110ConfigId', value)}
              label="SIL-110 Configuration"
              placeholder="Select SIL-110 bin configuration..."
              filterByAsset="SIL-110"
              required
            />
            
            <BinConfigurationSelector
              value={formData.binConfigurations.sil115ConfigId}
              onValueChange={(value) => handleBinConfigChange('sil115ConfigId', value)}
              label="SIL-115 Configuration"
              placeholder="Select SIL-115 bin configuration..."
              filterByAsset="SIL-115"
              required
            />
            
            <BinConfigurationSelector
              value={formData.binConfigurations.sil120ConfigId}
              onValueChange={(value) => handleBinConfigChange('sil120ConfigId', value)}
              label="SIL-120 Configuration"
              placeholder="Select SIL-120 bin configuration..."
              filterByAsset="SIL-120"
              required
            />
          </div>
          
          {/* Configuration Status */}
          <div className="mt-4 p-3 bg-muted rounded-lg">
            <div className="flex items-center justify-between text-sm">
              <span>Configuration Status:</span>
              <div className="flex gap-2">
                <Badge variant={formData.binConfigurations.sil110ConfigId ? "default" : "secondary"}>
                  SIL-110: {formData.binConfigurations.sil110ConfigId ? "✓" : "○"}
                </Badge>
                <Badge variant={formData.binConfigurations.sil115ConfigId ? "default" : "secondary"}>
                  SIL-115: {formData.binConfigurations.sil115ConfigId ? "✓" : "○"}
                </Badge>
                <Badge variant={formData.binConfigurations.sil120ConfigId ? "default" : "secondary"}>
                  SIL-120: {formData.binConfigurations.sil120ConfigId ? "✓" : "○"}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 