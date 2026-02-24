'use client'

import { useState, useEffect, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatRecipeName } from '@/lib/utils'
import { toast } from 'sonner'
import { 
  Save, 
  AlertTriangle, 
  CheckCircle2, 
  Edit,
  Package,
  FileText,
  Settings,
  Beaker
} from 'lucide-react'

// Import existing recipe components
import { 
  RecipeBOMEditor, 
  RecipeParametersEditor, 
  MashingProtocolEditor,
  type RecipeIngredient,
  type RecipeParameter,
  type MashingStep
} from '@/components/ui/recipe-components'

interface RunningRecipeData {
  id: string
  name: string
  ingredients: RecipeIngredient[]
  parameters: RecipeParameter[]
  mashingSteps: MashingStep[]
  originalRecipeId?: string
}

// Export the interface
export type { RunningRecipeData }

interface ScheduleOrder {
  id: string
  name: string
  recipeName?: string
  status: 'Created' | 'Scheduled' | 'InProgress' | 'Complete'
  estimatedStart: string
  estimatedEnd: string
  actualStart?: string
  actualEnd?: string
  totalBarrels?: number
  totalProofGallons?: number
}

interface ScheduleOrderQueue {
  id: string
  queueIndex: number
  areas: { id: string; name: string }[]
  scheduleOrder: ScheduleOrder
}

interface EditRunningRecipeModalProps {
  isOpen: boolean
  onClose: () => void
  orderQueue: ScheduleOrderQueue | null
  onSave: (data: RunningRecipeData, updateMasterRecipe: boolean) => Promise<void>
}

interface ChangesSummary {
  ingredients: {
    added: RecipeIngredient[]
    modified: RecipeIngredient[]
    removed: RecipeIngredient[]
  }
  parameters: {
    added: RecipeParameter[]
    modified: RecipeParameter[]
    removed: RecipeParameter[]
  }
  mashingSteps: {
    added: MashingStep[]
    modified: MashingStep[]
    removed: MashingStep[]
  }
}

export function EditRunningRecipeModal({ 
  isOpen, 
  onClose, 
  orderQueue,
  onSave 
}: EditRunningRecipeModalProps) {
  const [activeTab, setActiveTab] = useState('bom')
  const [isSaving, setIsSaving] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [updateMasterRecipe, setUpdateMasterRecipe] = useState(false)
  
  // Recipe data state
  const [originalRecipeData, setOriginalRecipeData] = useState<RunningRecipeData | null>(null)
  const [currentRecipeData, setCurrentRecipeData] = useState<RunningRecipeData | null>(null)
  const [changesSummary, setChangesSummary] = useState<ChangesSummary | null>(null)

  // Load recipe data when modal opens
  useEffect(() => {
    if (isOpen && orderQueue) {
      loadRecipeData()
    }
  }, [isOpen, orderQueue])

  const loadRecipeData = async () => {
    if (!orderQueue) return

    try {
      // Use the MCP GraphQL tool directly to fetch running recipe data
      const queryString = `
        query GetRunningRecipeByScheduleOrderQueue($scheduleOrderQueueId: String!) {
          scheduleOrderQueue(where: { id: $scheduleOrderQueueId }) {
            id
            queueIndex
            scheduleOrder {
              id
              name
              recipeName
              status
              productionOrders {
                id
                name
                status
                recipe {
                  id
                  Recipe
                  whiskeyType
                  parameters {
                    id
                    recipeParamName
                    recipeParamDescription
                    recipeSetpointType
                    recipeNumericalSetpoint
                    recipeSetpointBooleanValue
                    units {
                      id
                      name
                      abbreviation
                    }
                  }
                  recipeBoms {
                    id
                    recipeBomITem {
                      id
                      quantity
                      operation
                      item {
                        id
                        itemNumber
                        itemName
                        itemType
                        itemGroup
                      }
                      displayUnits {
                        id
                        name
                        abbreviation
                      }
                    }
                  }
                  mashingProtocol {
                    id
                    name
                    steps {
                      id
                      stepType
                      holdType
                      index
                      temperatureSetpoint
                      stepTime
                      heatEnabled
                      coolEnabled
                      heatTempSp
                      coolTempSp
                      agitatorEnabled
                      agitatorSpdSp
                      promptMessage
                    }
                  }
                }
                productionOrderRecipeInstances {
                  id
                  recipe {
                    id
                    Recipe
                  }
                  mashingProtocol {
                    id
                    name
                    running
                    steps {
                      id
                      stepType
                      holdType
                      index
                      temperatureSetpoint
                      stepTime
                      heatEnabled
                      coolEnabled
                      heatTempSp
                      coolTempSp
                      agitatorEnabled
                      agitatorSpdSp
                      promptMessage
                    }
                  }
                  recipeBom {
                    id
                    running
                    recipeBomITem {
                      id
                      quantity
                      operation
                      item {
                        id
                        itemNumber
                        itemName
                        itemType
                        itemGroup
                      }
                      displayUnits {
                        id
                        name
                        abbreviation
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `
      
      // Execute the query using MCP GraphQL tool
      const result = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: queryString,
          variables: { scheduleOrderQueueId: orderQueue.id }
        })
      })
      
      const { data } = await result.json()
      
      if (data?.scheduleOrderQueue?.scheduleOrder?.productionOrders?.length) {
        const productionOrder = data.scheduleOrderQueue.scheduleOrder.productionOrders[0]
        const recipe = productionOrder.recipe
        const recipeInstance = productionOrder.productionOrderRecipeInstances?.[0]
        
        // Convert GraphQL data to component format
        const recipeData: RunningRecipeData = {
          id: recipeInstance?.id || `master-${recipe.id}`,
          name: recipe.Recipe,
          ingredients: (recipeInstance?.recipeBom?.recipeBomITem || recipe.recipeBoms?.flatMap((bom: any) => bom.recipeBomITem) || []).map((item: any) => ({
            id: item.id,
            itemCode: item.item.itemNumber,
            name: item.item.itemName,
            quantity: item.quantity,
            unit: item.displayUnits?.abbreviation || 'lbs',
            category: mapItemTypeToCategory(item.item.itemType),
            operation: item.operation,
            createdAt: new Date()
          })),
          parameters: (recipe.parameters || []).map((param: any) => ({
            id: param.id,
            name: param.recipeParamName,
            description: param.recipeParamDescription,
            type: mapParameterType(param.recipeSetpointType),
            value: param.recipeNumericalSetpoint ?? param.recipeSetpointBooleanValue ?? '',
            unit: param.units?.abbreviation
          })),
          mashingSteps: (recipeInstance?.mashingProtocol?.steps || recipe.mashingProtocol?.steps || []).map((step: any) => ({
            id: step.id,
            stepType: mapStepType(step.stepType),
            holdType: step.holdType ? mapHoldType(step.holdType) : undefined,
            included: true,
            notes: step.promptMessage || '',
            heatTempSp: step.heatTempSp,
            timeDuration: step.stepTime,
            index: step.index,
            coolTempSp: step.coolTempSp
          }))
        }

        setOriginalRecipeData(recipeData)
        setCurrentRecipeData(recipeData)
      } else {
        // No recipe data found
        setOriginalRecipeData(null)
        setCurrentRecipeData(null)
      }
    } catch (error) {
      console.error('Error loading recipe data:', error)
      setOriginalRecipeData(null)
      setCurrentRecipeData(null)
    } finally {
      setIsSaving(false)
    }
  }

  // Helper functions to map GraphQL types to component types
  const mapItemTypeToCategory = (itemType: string): 'water' | 'grains' | 'yeast' | 'enzymes' | 'other' => {
    const typeMap: Record<string, 'water' | 'grains' | 'yeast' | 'enzymes' | 'other'> = {
      'Water': 'water',
      'Grain': 'grains',
      'Malt': 'grains',
      'Corn': 'grains',
      'Rye': 'grains',
      'Wheat': 'grains',
      'Yeast': 'yeast',
      'Enzyme': 'enzymes',
      'Additive': 'other',
    }
    return typeMap[itemType] || 'other'
  }

  const mapParameterType = (type: string): 'numeric' | 'boolean' | 'text' => {
    const typeMap: Record<string, 'numeric' | 'boolean' | 'text'> = {
      'Numeric': 'numeric',
      'Boolean': 'boolean',
      'Text': 'text',
    }
    return typeMap[type] || 'text'
  }

  const mapStepType = (type: string): 'LiquidAdd' | 'Hold' | 'AdditiveAdd' | 'Malt' | 'Corn' | 'Rye' | 'Wheat' => {
    const typeMap: Record<string, 'LiquidAdd' | 'Hold' | 'AdditiveAdd' | 'Malt' | 'Corn' | 'Rye' | 'Wheat'> = {
      'LiquidAdd': 'LiquidAdd',
      'Hold': 'Hold',
      'AdditiveAdd': 'AdditiveAdd',
      'Malt': 'Malt',
      'Corn': 'Corn',
      'Rye': 'Rye',
      'Wheat': 'Wheat',
    }
    return typeMap[type] || 'Hold'
  }

  const mapHoldType = (type: string): 'Heat' | 'Cool' | 'None' => {
    const typeMap: Record<string, 'Heat' | 'Cool' | 'None'> = {
      'Heat': 'Heat',
      'Cool': 'Cool',
      'None': 'None',
    }
    return typeMap[type] || 'None'
  }

  const calculateChanges = useCallback((): ChangesSummary => {
    if (!originalRecipeData || !currentRecipeData) {
      return {
        ingredients: { added: [], modified: [], removed: [] },
        parameters: { added: [], modified: [], removed: [] },
        mashingSteps: { added: [], modified: [], removed: [] }
      }
    }

    const changes: ChangesSummary = {
      ingredients: { added: [], modified: [], removed: [] },
      parameters: { added: [], modified: [], removed: [] },
      mashingSteps: { added: [], modified: [], removed: [] }
    }

    // Calculate ingredient changes
    const originalIngredientIds = new Set(originalRecipeData.ingredients.map(i => i.id))
    const currentIngredientIds = new Set(currentRecipeData.ingredients.map(i => i.id))

    changes.ingredients.added = currentRecipeData.ingredients.filter(i => !originalIngredientIds.has(i.id))
    changes.ingredients.removed = originalRecipeData.ingredients.filter(i => !currentIngredientIds.has(i.id))
    changes.ingredients.modified = currentRecipeData.ingredients.filter(current => {
      const original = originalRecipeData.ingredients.find(o => o.id === current.id)
      return original && (
        original.quantity !== current.quantity ||
        original.unit !== current.unit ||
        original.name !== current.name ||
        original.itemCode !== current.itemCode
      )
    })

    // Calculate parameter changes
    const originalParameterIds = new Set(originalRecipeData.parameters.map(p => p.id))
    const currentParameterIds = new Set(currentRecipeData.parameters.map(p => p.id))

    changes.parameters.added = currentRecipeData.parameters.filter(p => !originalParameterIds.has(p.id))
    changes.parameters.removed = originalRecipeData.parameters.filter(p => !currentParameterIds.has(p.id))
    changes.parameters.modified = currentRecipeData.parameters.filter(current => {
      const original = originalRecipeData.parameters.find(o => o.id === current.id)
      return original && (
        original.value !== current.value ||
        original.unit !== current.unit ||
        original.description !== current.description
      )
    })

    // Calculate mashing step changes
    const originalStepIds = new Set(originalRecipeData.mashingSteps.map(s => s.id))
    const currentStepIds = new Set(currentRecipeData.mashingSteps.map(s => s.id))

    changes.mashingSteps.added = currentRecipeData.mashingSteps.filter(s => !originalStepIds.has(s.id))
    changes.mashingSteps.removed = originalRecipeData.mashingSteps.filter(s => !currentStepIds.has(s.id))
    changes.mashingSteps.modified = currentRecipeData.mashingSteps.filter(current => {
      const original = originalRecipeData.mashingSteps.find(o => o.id === current.id)
      return original && JSON.stringify(original) !== JSON.stringify(current)
    })

    return changes
  }, [originalRecipeData, currentRecipeData])

  const hasChanges = useCallback(() => {
    const changes = calculateChanges()
    return (
      changes.ingredients.added.length > 0 ||
      changes.ingredients.modified.length > 0 ||
      changes.ingredients.removed.length > 0 ||
      changes.parameters.added.length > 0 ||
      changes.parameters.modified.length > 0 ||
      changes.parameters.removed.length > 0 ||
      changes.mashingSteps.added.length > 0 ||
      changes.mashingSteps.modified.length > 0 ||
      changes.mashingSteps.removed.length > 0
    )
  }, [calculateChanges])

  const handleIngredientsChange = (ingredients: RecipeIngredient[]) => {
    if (currentRecipeData) {
      setCurrentRecipeData({ ...currentRecipeData, ingredients })
    }
  }

  const handleParametersChange = (parameters: RecipeParameter[]) => {
    if (currentRecipeData) {
      setCurrentRecipeData({ ...currentRecipeData, parameters })
    }
  }

  const handleMashingStepsChange = (mashingSteps: MashingStep[]) => {
    if (currentRecipeData) {
      setCurrentRecipeData({ ...currentRecipeData, mashingSteps })
    }
  }

  const handleSaveClick = () => {
    if (!hasChanges()) {
      toast.info('No changes detected')
      return
    }

    const changes = calculateChanges()
    setChangesSummary(changes)
    setShowSummary(true)
  }

  const handleConfirmSave = async () => {
    if (!currentRecipeData) return

    setIsSaving(true)
    try {
      await onSave(currentRecipeData, updateMasterRecipe)
      toast.success('Running recipe updated successfully!')
      setShowSummary(false)
      onClose()
    } catch (error) {
      console.error('Error saving recipe:', error)
      toast.error('Failed to save recipe changes')
    } finally {
      setIsSaving(false)
    }
  }

  const handleClose = () => {
    if (hasChanges()) {
      if (confirm(`You have unsaved changes. Are you sure you want to close?`)) {
        onClose()
      }
    } else {
      onClose()
    }
  }

  if (!orderQueue || !currentRecipeData) return null

  const { scheduleOrder } = orderQueue

  return (
    <>
      {/* Main Edit Modal */}
      <Dialog open={isOpen && !showSummary} onOpenChange={handleClose}>
        <DialogContent className="max-w-6xl h-[95vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-3">
              <Edit className="h-5 w-5" />
              Edit Running Recipe
            </DialogTitle>
            <DialogDescription>
              Modify the recipe for {scheduleOrder.name || `Order ${scheduleOrder.id.slice(-8)}`} - {formatRecipeName(scheduleOrder.recipeName)}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-hidden min-h-0">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
              <TabsList className="grid w-full grid-cols-3 flex-shrink-0">
                <TabsTrigger value="bom" className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Bill of Materials
                </TabsTrigger>
                <TabsTrigger value="parameters" className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Parameters
                </TabsTrigger>
                <TabsTrigger value="mashing" className="flex items-center gap-2">
                  <Beaker className="h-4 w-4" />
                  Mashing Protocol
                </TabsTrigger>
              </TabsList>

              <div className="flex-1 overflow-hidden mt-4 min-h-0">
                <TabsContent value="bom" className="mt-0 h-full overflow-auto">
                  <div className="pr-2">
                    <RecipeBOMEditor
                      ingredients={currentRecipeData.ingredients}
                      onIngredientsChange={handleIngredientsChange}
                      isEditing={true}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="parameters" className="mt-0 h-full overflow-auto">
                  <div className="pr-2">
                    <RecipeParametersEditor
                      parameters={currentRecipeData.parameters}
                      onParametersChange={handleParametersChange}
                      isEditing={true}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="mashing" className="mt-0 h-full overflow-auto">
                  <div className="pr-2">
                    <MashingProtocolEditor
                      steps={currentRecipeData.mashingSteps}
                      onStepsChange={handleMashingStepsChange}
                      isEditing={true}
                    />
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          </div>

          <Separator />

          <div className="flex-shrink-0 flex items-center justify-between pt-4">
            <div className="text-sm text-muted-foreground">
              {hasChanges() ? (
                <span className="text-orange-600 flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" />
                  Unsaved changes detected
                </span>
              ) : (
                <span className="text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4" />
                  No changes
                </span>
              )}
            </div>

            <div className="flex space-x-3">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button 
                onClick={handleSaveClick}
                disabled={!hasChanges()}
                className="flex items-center gap-2"
              >
                <Save className="h-4 w-4" />
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Changes Summary Modal */}
      <Dialog open={showSummary} onOpenChange={() => setShowSummary(false)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-3">
              <FileText className="h-5 w-5" />
              Review Changes
            </DialogTitle>
            <DialogDescription>
              Review the changes you&apos;ve made to the running recipe before saving
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-6">
            {changesSummary && (
              <>
                {/* Master Recipe Update Option */}
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-3">
                      <p>You are about to modify the running recipe for this production order.</p>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="updateMaster"
                          checked={updateMasterRecipe}
                          onCheckedChange={(checked) => setUpdateMasterRecipe(checked as boolean)}
                        />
                        <label htmlFor="updateMaster" className="text-sm font-medium">
                          Also update the master recipe with these changes
                        </label>
                      </div>
                      {updateMasterRecipe && (
                        <p className="text-sm text-orange-600">
                          ⚠️ This will affect all future production orders using this recipe
                        </p>
                      )}
                    </div>
                  </AlertDescription>
                </Alert>

                {/* Changes Summary */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Summary of Changes</h3>
                  
                  {/* Ingredients Changes */}
                  {(changesSummary.ingredients.added.length > 0 || 
                    changesSummary.ingredients.modified.length > 0 || 
                    changesSummary.ingredients.removed.length > 0) && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Bill of Materials</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {changesSummary.ingredients.added.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium text-green-700 mb-2">Added ({changesSummary.ingredients.added.length})</h4>
                            <div className="space-y-1">
                              {changesSummary.ingredients.added.map(ing => (
                                <div key={ing.id} className="text-sm bg-green-50 p-2 rounded">
                                  {ing.name} - {ing.quantity} {ing.unit}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {changesSummary.ingredients.modified.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium text-blue-700 mb-2">Modified ({changesSummary.ingredients.modified.length})</h4>
                            <div className="space-y-1">
                              {changesSummary.ingredients.modified.map(ing => (
                                <div key={ing.id} className="text-sm bg-blue-50 p-2 rounded">
                                  {ing.name} - {ing.quantity} {ing.unit}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {changesSummary.ingredients.removed.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium text-red-700 mb-2">Removed ({changesSummary.ingredients.removed.length})</h4>
                            <div className="space-y-1">
                              {changesSummary.ingredients.removed.map(ing => (
                                <div key={ing.id} className="text-sm bg-red-50 p-2 rounded">
                                  {ing.name} - {ing.quantity} {ing.unit}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Parameters Changes */}
                  {(changesSummary.parameters.added.length > 0 || 
                    changesSummary.parameters.modified.length > 0 || 
                    changesSummary.parameters.removed.length > 0) && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Parameters</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {changesSummary.parameters.added.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium text-green-700 mb-2">Added ({changesSummary.parameters.added.length})</h4>
                            <div className="space-y-1">
                              {changesSummary.parameters.added.map(param => (
                                <div key={param.id} className="text-sm bg-green-50 p-2 rounded">
                                  {param.name}: {param.value} {param.unit}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {changesSummary.parameters.modified.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium text-blue-700 mb-2">Modified ({changesSummary.parameters.modified.length})</h4>
                            <div className="space-y-1">
                              {changesSummary.parameters.modified.map(param => (
                                <div key={param.id} className="text-sm bg-blue-50 p-2 rounded">
                                  {param.name}: {param.value} {param.unit}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {changesSummary.parameters.removed.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium text-red-700 mb-2">Removed ({changesSummary.parameters.removed.length})</h4>
                            <div className="space-y-1">
                              {changesSummary.parameters.removed.map(param => (
                                <div key={param.id} className="text-sm bg-red-50 p-2 rounded">
                                  {param.name}: {param.value} {param.unit}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Mashing Steps Changes */}
                  {(changesSummary.mashingSteps.added.length > 0 || 
                    changesSummary.mashingSteps.modified.length > 0 || 
                    changesSummary.mashingSteps.removed.length > 0) && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Mashing Protocol</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {changesSummary.mashingSteps.added.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium text-green-700 mb-2">Added ({changesSummary.mashingSteps.added.length})</h4>
                            <div className="space-y-1">
                              {changesSummary.mashingSteps.added.map(step => (
                                <div key={step.id} className="text-sm bg-green-50 p-2 rounded">
                                  {step.stepType} - {step.holdType || 'No hold'}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {changesSummary.mashingSteps.modified.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium text-blue-700 mb-2">Modified ({changesSummary.mashingSteps.modified.length})</h4>
                            <div className="space-y-1">
                              {changesSummary.mashingSteps.modified.map(step => (
                                <div key={step.id} className="text-sm bg-blue-50 p-2 rounded">
                                  {step.stepType} - {step.holdType || 'No hold'}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {changesSummary.mashingSteps.removed.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium text-red-700 mb-2">Removed ({changesSummary.mashingSteps.removed.length})</h4>
                            <div className="space-y-1">
                              {changesSummary.mashingSteps.removed.map(step => (
                                <div key={step.id} className="text-sm bg-red-50 p-2 rounded">
                                  {step.stepType} - {step.holdType || 'No hold'}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>
              </>
            )}
          </div>

          <Separator />

          <div className="flex-shrink-0 flex items-center justify-between pt-4">
            <div className="text-sm text-muted-foreground">
              {updateMasterRecipe ? 
                'Changes will be applied to both running and master recipe' : 
                'Changes will only be applied to the running recipe'
              }
            </div>

            <div className="flex space-x-3">
              <Button variant="outline" onClick={() => setShowSummary(false)}>
                Back to Edit
              </Button>
              <Button 
                onClick={handleConfirmSave}
                disabled={isSaving}
                className="flex items-center gap-2"
              >
                <Save className="h-4 w-4" />
                {isSaving ? 'Saving...' : 'Confirm & Save'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
} 