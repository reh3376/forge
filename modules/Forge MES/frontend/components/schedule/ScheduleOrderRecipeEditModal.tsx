'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import {
  Save,
  AlertTriangle,
  CheckCircle2,
  Edit,
  Package,
  Settings,
  Beaker,
  Loader2
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

interface ScheduleOrderRecipeEditModalProps {
  isOpen: boolean
  onClose: () => void
  scheduleOrderId: string | null
  scheduleOrderStatus: 'Scheduled' | 'InProgress' | string
  queueIndex?: number
  onSave?: () => Promise<void>
}

interface SORecipeInstanceData {
  id: string
  status: string
  scheduleOrder?: {
    id: string
    status?: string
    scheduleOrderNumber?: string
  }
  recipe?: {
    id: string
    name?: string
    revision?: number
  }
  recipeBoms: Array<{
    id: string
    recipeBomITem: Array<{
      id: string
      quantity?: number
      item?: {
        id: string
        itemName?: string
        itemCode?: string
        itemNumber?: string
      }
      displayUnits?: {
        id: string
        name?: string
        abbreviation?: string
      }
    }>
  }>
  recipeParameters: Array<{
    id: string
    recipeParamName?: string
    recipeParamDescription?: string
    recipeSetpointType?: string
    recipeNumericalSetpoint?: number
    recipeSetpointBooleanValue?: boolean
    recipeSetpointUpperLimit?: number
    recipeSetpointLowerLimit?: number
    parameterCategory?: string
    units?: {
      id: string
      name?: string
      abbreviation?: string
    }
  }>
  mashingProtocols: Array<{
    id: string
    name?: string
    steps: Array<{
      id: string
      index?: number
      stepType?: string
      holdType?: string
      stepTime?: number
      temperatureSetpoint?: number
      heatEnabled?: boolean
      heatTempSp?: number
      coolEnabled?: boolean
      coolTempSp?: number
      agitatorEnabled?: boolean
      agitatorSpdSp?: number
      promptMessage?: string
      recipeBomItem?: Array<{
        id: string
        quantity?: number
        item?: {
          id: string
          itemName?: string
          itemCode?: string
          itemNumber?: string
        }
        displayUnits?: {
          id: string
          name?: string
          abbreviation?: string
        }
      }>
    }>
  }>
}

export function ScheduleOrderRecipeEditModal({
  isOpen,
  onClose,
  scheduleOrderId,
  scheduleOrderStatus,
  queueIndex,
  onSave
}: ScheduleOrderRecipeEditModalProps) {
  const [activeTab, setActiveTab] = useState('bom')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Recipe data state
  const [instanceData, setInstanceData] = useState<SORecipeInstanceData | null>(null)
  const [originalIngredients, setOriginalIngredients] = useState<RecipeIngredient[]>([])
  const [originalParameters, setOriginalParameters] = useState<RecipeParameter[]>([])
  const [originalMashingSteps, setOriginalMashingSteps] = useState<MashingStep[]>([])

  const [currentIngredients, setCurrentIngredients] = useState<RecipeIngredient[]>([])
  const [currentParameters, setCurrentParameters] = useState<RecipeParameter[]>([])
  const [currentMashingSteps, setCurrentMashingSteps] = useState<MashingStep[]>([])

  // Load recipe instance data when modal opens
  useEffect(() => {
    if (isOpen && scheduleOrderId) {
      loadRecipeInstanceData()
    }
  }, [isOpen, scheduleOrderId])

  const loadRecipeInstanceData = async () => {
    if (!scheduleOrderId) return

    setIsLoading(true)
    try {
      const queryString = `
        query GetSORecipeInstanceWithComponents($scheduleOrderId: String!) {
          scheduleOrderRecipeInstanceWithComponents(scheduleOrderId: $scheduleOrderId) {
            id
            status
            scheduleOrder {
              id
              status
              scheduleOrderNumber
            }
            recipe {
              id
              name
              revision
            }
            recipeBoms {
              id
              recipeBomITem {
                id
                quantity
                item {
                  id
                  itemName
                  itemCode
                  itemNumber
                }
                displayUnits {
                  id
                  name
                  abbreviation
                }
              }
            }
            recipeParameters {
              id
              recipeParamName
              recipeParamDescription
              recipeSetpointType
              recipeNumericalSetpoint
              recipeSetpointBooleanValue
              recipeSetpointUpperLimit
              recipeSetpointLowerLimit
              parameterCategory
              units {
                id
                name
                abbreviation
              }
            }
            mashingProtocols {
              id
              name
              steps {
                id
                index
                stepType
                holdType
                stepTime
                temperatureSetpoint
                heatEnabled
                heatTempSp
                coolEnabled
                coolTempSp
                agitatorEnabled
                agitatorSpdSp
                promptMessage
                recipeBomItem {
                  id
                  quantity
                  item {
                    id
                    itemName
                    itemCode
                    itemNumber
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
      `

      const result = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: queryString,
          variables: { scheduleOrderId }
        })
      })

      const { data, errors } = await result.json()

      if (errors) {
        console.error('GraphQL errors:', errors)
        toast.error('Failed to load recipe instance data')
        return
      }

      const instance = data?.scheduleOrderRecipeInstanceWithComponents
      if (!instance) {
        toast.error('No recipe instance found for this schedule order')
        return
      }

      setInstanceData(instance)

      // Convert to component format
      const ingredients = convertToIngredients(instance)
      const parameters = convertToParameters(instance)
      const mashingSteps = convertToMashingSteps(instance)

      setOriginalIngredients(ingredients)
      setOriginalParameters(parameters)
      setOriginalMashingSteps(mashingSteps)

      setCurrentIngredients([...ingredients])
      setCurrentParameters([...parameters])
      setCurrentMashingSteps([...mashingSteps])

    } catch (error) {
      console.error('Error loading recipe instance data:', error)
      toast.error('Failed to load recipe instance data')
    } finally {
      setIsLoading(false)
    }
  }

  const convertToIngredients = (instance: SORecipeInstanceData): RecipeIngredient[] => {
    const allItems: RecipeIngredient[] = []
    for (const bom of instance.recipeBoms || []) {
      for (const item of bom.recipeBomITem || []) {
        allItems.push({
          id: item.id,
          itemCode: item.item?.itemCode || '',
          name: item.item?.itemNumber || item.item?.itemName || 'Unknown',
          quantity: item.quantity || 0,
          unit: item.displayUnits?.abbreviation || 'lbs',
          category: 'other',
          createdAt: new Date()
        })
      }
    }
    return allItems
  }

  const convertToParameters = (instance: SORecipeInstanceData): RecipeParameter[] => {
    return (instance.recipeParameters || []).map(param => ({
      id: param.id,
      name: param.recipeParamName || 'Unknown',
      description: param.recipeParamDescription || '',
      type: mapParameterType(param.recipeSetpointType),
      value: param.recipeNumericalSetpoint ?? param.recipeSetpointBooleanValue ?? '',
      unit: param.units?.abbreviation,
      category: param.parameterCategory as 'Input' | 'Output' | 'Calculated' | undefined,
      createdAt: new Date()
    }))
  }

  const convertToMashingSteps = (instance: SORecipeInstanceData): MashingStep[] => {
    const allSteps: MashingStep[] = []
    for (const protocol of instance.mashingProtocols || []) {
      for (const step of protocol.steps || []) {
        allSteps.push({
          id: step.id,
          stepType: mapStepType(step.stepType),
          holdType: step.holdType ? mapHoldType(step.holdType) : undefined,
          included: true,
          notes: step.promptMessage || '',
          heatTempSp: step.heatTempSp,
          timeDuration: step.stepTime,
          index: step.index ?? 0,
          coolTempSp: step.coolTempSp,
          recipeBomItems: (step.recipeBomItem || []).map(item => ({
            id: item.id,
            quantity: item.quantity ?? 0,
            item: {
              id: item.item?.id || '',
              itemName: item.item?.itemName || 'Unknown',
              itemNumber: item.item?.itemNumber,
              itemType: '',
              itemClass: '',
              itemGroup: null,
            },
            displayUnits: item.displayUnits ? {
              id: item.displayUnits.id,
              name: item.displayUnits.name || ''
            } : null,
            operation: ''
          }))
        })
      }
    }
    return allSteps.sort((a, b) => a.index - b.index)
  }

  const mapParameterType = (type?: string): 'numeric' | 'boolean' | 'text' => {
    const typeMap: Record<string, 'numeric' | 'boolean' | 'text'> = {
      'Numeric': 'numeric',
      'Boolean': 'boolean',
      'Text': 'text',
    }
    return typeMap[type || ''] || 'text'
  }

  const mapStepType = (type?: string): 'LiquidAdd' | 'Hold' | 'AdditiveAdd' | 'Malt' | 'Corn' | 'Rye' | 'Wheat' => {
    const typeMap: Record<string, 'LiquidAdd' | 'Hold' | 'AdditiveAdd' | 'Malt' | 'Corn' | 'Rye' | 'Wheat'> = {
      'LiquidAdd': 'LiquidAdd',
      'Hold': 'Hold',
      'AdditiveAdd': 'AdditiveAdd',
      'Malt': 'Malt',
      'Corn': 'Corn',
      'Rye': 'Rye',
      'Wheat': 'Wheat',
    }
    return typeMap[type || ''] || 'Hold'
  }

  const mapHoldType = (type: string): 'Heat' | 'Cool' | 'None' => {
    const typeMap: Record<string, 'Heat' | 'Cool' | 'None'> = {
      'Heat': 'Heat',
      'Cool': 'Cool',
      'None': 'None',
    }
    return typeMap[type] || 'None'
  }

  const hasChanges = useMemo(() => {
    // Compare ingredients
    const ingredientsChanged = JSON.stringify(currentIngredients) !== JSON.stringify(originalIngredients)

    // Compare parameters
    const parametersChanged = JSON.stringify(currentParameters) !== JSON.stringify(originalParameters)

    // Compare mashing steps
    const mashingStepsChanged = JSON.stringify(currentMashingSteps) !== JSON.stringify(originalMashingSteps)

    return ingredientsChanged || parametersChanged || mashingStepsChanged
  }, [currentIngredients, currentParameters, currentMashingSteps, originalIngredients, originalParameters, originalMashingSteps])

  const handleSave = async () => {
    if (!instanceData || !hasChanges) {
      toast.info('No changes to save')
      return
    }

    setIsSaving(true)
    try {
      // Build the update input
      const bomItems = currentIngredients
        .filter(ing => {
          const original = originalIngredients.find(o => o.id === ing.id)
          return original && original.quantity !== ing.quantity
        })
        .map(ing => ({
          id: ing.id,
          quantity: ing.quantity
        }))

      const parameters = currentParameters
        .filter(param => {
          const original = originalParameters.find(o => o.id === param.id)
          return original && original.value !== param.value
        })
        .map(param => ({
          id: param.id,
          recipeNumericalSetpoint: typeof param.value === 'number' ? param.value : undefined,
          recipeSetpointBooleanValue: typeof param.value === 'boolean' ? param.value : undefined
        }))

      const mashingSteps = currentMashingSteps
        .filter(step => {
          const original = originalMashingSteps.find(o => o.id === step.id)
          return original && JSON.stringify(original) !== JSON.stringify(step)
        })
        .map(step => ({
          id: step.id,
          stepTime: step.timeDuration,
          temperatureSetpoint: step.heatTempSp || step.coolTempSp,
          heatEnabled: step.holdType === 'Heat',
          heatTempSp: step.heatTempSp,
          coolEnabled: step.holdType === 'Cool',
          coolTempSp: step.coolTempSp,
          promptMessage: step.notes
        }))

      const mutationString = `
        mutation UpdateSORecipeComponents(
          $instanceId: String!,
          $input: UpdateSORecipeComponentsInput!,
          $updatedBy: String
        ) {
          updateScheduleOrderRecipeInstanceComponents(
            instanceId: $instanceId,
            input: $input,
            updatedBy: $updatedBy
          ) {
            id
            status
          }
        }
      `

      const result = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: mutationString,
          variables: {
            instanceId: instanceData.id,
            input: {
              bomItems: bomItems.length > 0 ? bomItems : undefined,
              parameters: parameters.length > 0 ? parameters : undefined,
              mashingSteps: mashingSteps.length > 0 ? mashingSteps : undefined
            },
            updatedBy: 'user'
          }
        })
      })

      const { data, errors } = await result.json()

      if (errors) {
        console.error('GraphQL errors:', errors)
        toast.error('Failed to save changes')
        return
      }

      if (data?.updateScheduleOrderRecipeInstanceComponents) {
        toast.success('Recipe instance updated successfully')

        // Update original data to match current
        setOriginalIngredients([...currentIngredients])
        setOriginalParameters([...currentParameters])
        setOriginalMashingSteps([...currentMashingSteps])

        if (onSave) {
          await onSave()
        }

        onClose()
      }
    } catch (error) {
      console.error('Error saving recipe instance:', error)
      toast.error('Failed to save changes')
    } finally {
      setIsSaving(false)
    }
  }

  const handleClose = () => {
    if (hasChanges) {
      if (confirm('You have unsaved changes. Are you sure you want to close?')) {
        onClose()
      }
    } else {
      onClose()
    }
  }

  const isInProgress = scheduleOrderStatus === 'InProgress' && (queueIndex ?? 1) <= 0

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-6xl h-[95vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-3">
            <Edit className="h-5 w-5" />
            Edit Recipe Instance
          </DialogTitle>
          <DialogDescription>
            Modify the recipe components for this schedule order
            {instanceData?.recipe?.name && ` - ${instanceData.recipe.name}`}
          </DialogDescription>
        </DialogHeader>

        {/* Warning for in-progress orders */}
        {isInProgress && (
          <Alert variant="destructive" className="flex-shrink-0">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              This order is currently in production. Changes will affect the running batch.
              Proceed with caution and coordinate with production staff.
            </AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading recipe data...</span>
          </div>
        ) : !instanceData ? (
          <div className="flex-1 flex items-center justify-center">
            <span className="text-muted-foreground">No recipe instance data available</span>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden min-h-0">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
              <TabsList className="grid w-full grid-cols-3 flex-shrink-0">
                <TabsTrigger value="bom" className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Bill of Materials ({currentIngredients.length})
                </TabsTrigger>
                <TabsTrigger value="parameters" className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Parameters ({currentParameters.length})
                </TabsTrigger>
                <TabsTrigger value="mashing" className="flex items-center gap-2">
                  <Beaker className="h-4 w-4" />
                  Mashing Protocol ({currentMashingSteps.length})
                </TabsTrigger>
              </TabsList>

              <div className="flex-1 overflow-hidden mt-4 min-h-0">
                <TabsContent value="bom" className="mt-0 h-full overflow-auto">
                  <div className="pr-2">
                    <RecipeBOMEditor
                      ingredients={currentIngredients}
                      onIngredientsChange={setCurrentIngredients}
                      isEditing={true}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="parameters" className="mt-0 h-full overflow-auto">
                  <div className="pr-2">
                    <RecipeParametersEditor
                      parameters={currentParameters}
                      onParametersChange={setCurrentParameters}
                      isEditing={true}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="mashing" className="mt-0 h-full overflow-auto">
                  <div className="pr-2">
                    <MashingProtocolEditor
                      steps={currentMashingSteps}
                      onStepsChange={setCurrentMashingSteps}
                      isEditing={true}
                    />
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          </div>
        )}

        <Separator />

        <div className="flex-shrink-0 flex items-center justify-between pt-4">
          <div className="text-sm text-muted-foreground">
            {hasChanges ? (
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
              onClick={handleSave}
              disabled={!hasChanges || isSaving || isLoading}
              className="flex items-center gap-2"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
