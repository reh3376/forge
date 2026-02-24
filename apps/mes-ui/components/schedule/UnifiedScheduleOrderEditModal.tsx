'use client'

import { useState, useEffect, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { useCurrentUserEmail } from '@/lib/utils/user-context'
import {
  Save,
  AlertTriangle,
  CheckCircle2,
  Edit,
  Package,
  Settings,
  Beaker,
  Loader2,
  Calendar,
  ClipboardList,
  History
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

// Import change history component
import { ScheduleOrderChangeHistory } from './ScheduleOrderChangeHistory'

// Types
interface ScheduleOrder {
  id: string
  name: string
  recipeName?: string
  status: string
  estimatedStart?: string
  estimatedEnd?: string
  actualStart?: string
  actualEnd?: string
  totalBarrels?: number
  totalProofGallons?: number
  duration?: number
  durationUnits?: string
  estimatedMashingDuration?: number
  estimatedMashingStartTime?: string
  estimatedFermentationDuration?: number
  estimatedFermentationStartTime?: string
  estimatedDistillationDuration?: number
  estimatedDistillationStartTime?: string
  estimatedBarrelingStartTime?: string
  estimatedProcessingStartTime?: string
  estimatedTotalProductionDuration?: number
  totalGrainWeight?: number
  totalWaterVolume?: number
  totalCooks?: number
  totalFermenters?: number
  productionOrders?: Array<{
    id: string
    name: string | null
    status: string
    quantity: number | null
    containerType: string | null
    finalProof: number | null
    recipe?: {
      id: string
      Recipe: string
      whiskeyType: string
    }
    customer?: {
      id: string
      name?: string
      customerCode?: string
    }
  }>
}

interface ScheduleOrderQueue {
  id: string
  queueIndex: number
  areas: { id: string; name: string }[]
  scheduleOrder: ScheduleOrder
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

interface UnifiedScheduleOrderEditModalProps {
  isOpen: boolean
  onClose: () => void
  orderQueue: ScheduleOrderQueue | null
  onSave?: () => Promise<void>
}

// Schedule form data type
interface ScheduleFormData {
  name: string
  recipeName: string
  status: string
  queueIndex: string
  duration: string
  durationUnits: string
  estimatedStart: string
  estimatedEnd: string
  actualStart: string
  actualEnd: string
  totalBarrels: string
  totalProofGallons: string
  estimatedTotalProductionDuration: string
  estimatedMashingStartTime: string
  estimatedMashingDuration: string
  estimatedFermentationStartTime: string
  estimatedFermentationDuration: string
  estimatedDistillationStartTime: string
  estimatedDistillationDuration: string
  estimatedBarrelingStartTime: string
  estimatedProcessingStartTime: string
  totalGrainWeight: string
  totalWaterVolume: string
}

export function UnifiedScheduleOrderEditModal({
  isOpen,
  onClose,
  orderQueue,
  onSave
}: UnifiedScheduleOrderEditModalProps) {
  const userEmail = useCurrentUserEmail()
  const [activeTab, setActiveTab] = useState('schedule')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Schedule form data
  const [formData, setFormData] = useState<ScheduleFormData>({
    name: '',
    recipeName: '',
    status: '',
    queueIndex: '',
    duration: '',
    durationUnits: 'hours',
    estimatedStart: '',
    estimatedEnd: '',
    actualStart: '',
    actualEnd: '',
    totalBarrels: '',
    totalProofGallons: '',
    estimatedTotalProductionDuration: '',
    estimatedMashingStartTime: '',
    estimatedMashingDuration: '',
    estimatedFermentationStartTime: '',
    estimatedFermentationDuration: '',
    estimatedDistillationStartTime: '',
    estimatedDistillationDuration: '',
    estimatedBarrelingStartTime: '',
    estimatedProcessingStartTime: '',
    totalGrainWeight: '',
    totalWaterVolume: ''
  })
  const [originalFormData, setOriginalFormData] = useState<ScheduleFormData | null>(null)

  // Production orders
  const [productionOrders, setProductionOrders] = useState<Array<{
    id: string
    name: string | null
    status: string
    quantity: number | null
    containerType: string | null
    finalProof: number | null
  }>>([])
  const [originalProductionOrders, setOriginalProductionOrders] = useState<typeof productionOrders>([])

  // Recipe instance data
  const [instanceData, setInstanceData] = useState<SORecipeInstanceData | null>(null)
  const [originalIngredients, setOriginalIngredients] = useState<RecipeIngredient[]>([])
  const [originalParameters, setOriginalParameters] = useState<RecipeParameter[]>([])
  const [originalMashingSteps, setOriginalMashingSteps] = useState<MashingStep[]>([])
  const [currentIngredients, setCurrentIngredients] = useState<RecipeIngredient[]>([])
  const [currentParameters, setCurrentParameters] = useState<RecipeParameter[]>([])
  const [currentMashingSteps, setCurrentMashingSteps] = useState<MashingStep[]>([])

  // Format datetime for input
  const formatDateTimeLocal = (dateStr?: string | null) => {
    if (!dateStr) return ''
    try {
      return new Date(dateStr).toISOString().slice(0, 16)
    } catch {
      return ''
    }
  }

  // Initialize schedule form data
  useEffect(() => {
    if (orderQueue?.scheduleOrder) {
      const order = orderQueue.scheduleOrder
      const newFormData: ScheduleFormData = {
        name: order.name || '',
        recipeName: order.recipeName || '',
        status: order.status || '',
        queueIndex: orderQueue.queueIndex?.toString() || '',
        duration: order.duration?.toString() || '',
        durationUnits: order.durationUnits || 'hours',
        estimatedStart: formatDateTimeLocal(order.estimatedStart),
        estimatedEnd: formatDateTimeLocal(order.estimatedEnd),
        actualStart: formatDateTimeLocal(order.actualStart),
        actualEnd: formatDateTimeLocal(order.actualEnd),
        totalBarrels: order.totalBarrels?.toString() || '',
        totalProofGallons: order.totalProofGallons?.toString() || '',
        estimatedTotalProductionDuration: order.estimatedTotalProductionDuration?.toString() || '',
        estimatedMashingStartTime: formatDateTimeLocal(order.estimatedMashingStartTime),
        estimatedMashingDuration: order.estimatedMashingDuration?.toString() || '',
        estimatedFermentationStartTime: formatDateTimeLocal(order.estimatedFermentationStartTime),
        estimatedFermentationDuration: order.estimatedFermentationDuration?.toString() || '',
        estimatedDistillationStartTime: formatDateTimeLocal(order.estimatedDistillationStartTime),
        estimatedDistillationDuration: order.estimatedDistillationDuration?.toString() || '',
        estimatedBarrelingStartTime: formatDateTimeLocal(order.estimatedBarrelingStartTime),
        estimatedProcessingStartTime: formatDateTimeLocal(order.estimatedProcessingStartTime),
        totalGrainWeight: order.totalGrainWeight?.toString() || '',
        totalWaterVolume: order.totalWaterVolume?.toString() || ''
      }
      setFormData(newFormData)
      setOriginalFormData(newFormData)

      // Initialize production orders
      const pos = (order.productionOrders || []).map(po => ({
        id: po.id,
        name: po.name,
        status: po.status,
        quantity: po.quantity,
        containerType: po.containerType,
        finalProof: po.finalProof
      }))
      setProductionOrders(pos)
      setOriginalProductionOrders(JSON.parse(JSON.stringify(pos)))
    }
  }, [orderQueue])

  // Load recipe instance data when modal opens
  useEffect(() => {
    if (isOpen && orderQueue?.scheduleOrder?.id) {
      loadRecipeInstanceData()
    }
  }, [isOpen, orderQueue?.scheduleOrder?.id])

  const loadRecipeInstanceData = async () => {
    if (!orderQueue?.scheduleOrder?.id) return

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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: queryString,
          variables: { scheduleOrderId: orderQueue.scheduleOrder.id }
        })
      })

      const { data, errors } = await result.json()

      if (errors) {
        console.error('GraphQL errors:', errors)
        // Don't show error - recipe instance might not exist yet
        return
      }

      const instance = data?.scheduleOrderRecipeInstanceWithComponents
      if (!instance) {
        // No recipe instance - that's okay
        return
      }

      setInstanceData(instance)

      // Convert to component format
      const ingredients = convertToIngredients(instance)
      const parameters = convertToParameters(instance)
      const mashingSteps = convertToMashingSteps(instance)

      // Deep copy to prevent mutations from affecting originals
      setOriginalIngredients(JSON.parse(JSON.stringify(ingredients)))
      setOriginalParameters(JSON.parse(JSON.stringify(parameters)))
      setOriginalMashingSteps(JSON.parse(JSON.stringify(mashingSteps)))

      setCurrentIngredients(JSON.parse(JSON.stringify(ingredients)))
      setCurrentParameters(JSON.parse(JSON.stringify(parameters)))
      setCurrentMashingSteps(JSON.parse(JSON.stringify(mashingSteps)))

    } catch (error) {
      console.error('Error loading recipe instance data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Conversion functions
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

  // Check for changes
  const hasScheduleChanges = useMemo(() => {
    if (!originalFormData) return false
    return JSON.stringify(formData) !== JSON.stringify(originalFormData) ||
           JSON.stringify(productionOrders) !== JSON.stringify(originalProductionOrders)
  }, [formData, originalFormData, productionOrders, originalProductionOrders])

  const hasRecipeChanges = useMemo(() => {
    const ingredientsChanged = JSON.stringify(currentIngredients) !== JSON.stringify(originalIngredients)
    const parametersChanged = JSON.stringify(currentParameters) !== JSON.stringify(originalParameters)
    const mashingStepsChanged = JSON.stringify(currentMashingSteps) !== JSON.stringify(originalMashingSteps)
    return ingredientsChanged || parametersChanged || mashingStepsChanged
  }, [currentIngredients, currentParameters, currentMashingSteps, originalIngredients, originalParameters, originalMashingSteps])

  const hasChanges = hasScheduleChanges || hasRecipeChanges

  // Update form field
  const updateField = (field: keyof ScheduleFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  // Save handler
  const handleSave = async () => {
    if (!orderQueue || !hasChanges) {
      toast.info('No changes to save')
      return
    }

    setIsSaving(true)
    try {
      // Save schedule order changes (excluding loads which need special handling)
      if (hasScheduleChanges) {
        // Check if loads changed - these need to use a separate mutation
        const loadsChanged = originalFormData && (
          formData.totalGrainWeight !== originalFormData.totalGrainWeight ||
          formData.totalWaterVolume !== originalFormData.totalWaterVolume
        )

        // First, update the main schedule order fields
        const response = await fetch('/api/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `
              mutation UpdateScheduleOrder(
                $id: String!
                $name: String
                $recipeName: String
                $status: EnumScheduleOrderStatus
                $duration: Float
                $durationUnits: String
                $estimatedStart: DateTime
                $estimatedEnd: DateTime
                $actualStart: DateTime
                $actualEnd: DateTime
                $totalBarrels: Float
                $totalProofGallons: Float
                $estimatedTotalProductionDuration: Float
                $estimatedMashingStartTime: DateTime
                $estimatedMashingDuration: Float
                $estimatedFermentationStartTime: DateTime
                $estimatedFermentationDuration: Float
                $estimatedDistillationStartTime: DateTime
                $estimatedDistillationDuration: Float
                $estimatedBarrelingStartTime: DateTime
                $estimatedProcessingStartTime: DateTime
                $updatedBy: String
              ) {
                updateScheduleOrder(
                  where: { id: $id }
                  data: {
                    name: $name
                    recipeName: $recipeName
                    status: $status
                    duration: $duration
                    durationUnits: $durationUnits
                    estimatedStart: $estimatedStart
                    estimatedEnd: $estimatedEnd
                    actualStart: $actualStart
                    actualEnd: $actualEnd
                    totalBarrels: $totalBarrels
                    totalProofGallons: $totalProofGallons
                    estimatedTotalProductionDuration: $estimatedTotalProductionDuration
                    estimatedMashingStartTime: $estimatedMashingStartTime
                    estimatedMashingDuration: $estimatedMashingDuration
                    estimatedFermentationStartTime: $estimatedFermentationStartTime
                    estimatedFermentationDuration: $estimatedFermentationDuration
                    estimatedDistillationStartTime: $estimatedDistillationStartTime
                    estimatedDistillationDuration: $estimatedDistillationDuration
                    estimatedBarrelingStartTime: $estimatedBarrelingStartTime
                    estimatedProcessingStartTime: $estimatedProcessingStartTime
                    updatedBy: $updatedBy
                  }
                ) {
                  id
                }
              }
            `,
            variables: {
              id: orderQueue.scheduleOrder.id,
              name: formData.name || null,
              recipeName: formData.recipeName || null,
              status: formData.status || null,
              duration: formData.duration ? parseFloat(formData.duration) : null,
              durationUnits: formData.durationUnits || null,
              estimatedStart: formData.estimatedStart ? new Date(formData.estimatedStart).toISOString() : null,
              estimatedEnd: formData.estimatedEnd ? new Date(formData.estimatedEnd).toISOString() : null,
              actualStart: formData.actualStart ? new Date(formData.actualStart).toISOString() : null,
              actualEnd: formData.actualEnd ? new Date(formData.actualEnd).toISOString() : null,
              totalBarrels: formData.totalBarrels ? parseFloat(formData.totalBarrels) : null,
              totalProofGallons: formData.totalProofGallons ? parseFloat(formData.totalProofGallons) : null,
              estimatedTotalProductionDuration: formData.estimatedTotalProductionDuration ? parseFloat(formData.estimatedTotalProductionDuration) : null,
              estimatedMashingStartTime: formData.estimatedMashingStartTime ? new Date(formData.estimatedMashingStartTime).toISOString() : null,
              estimatedMashingDuration: formData.estimatedMashingDuration ? parseFloat(formData.estimatedMashingDuration) : null,
              estimatedFermentationStartTime: formData.estimatedFermentationStartTime ? new Date(formData.estimatedFermentationStartTime).toISOString() : null,
              estimatedFermentationDuration: formData.estimatedFermentationDuration ? parseFloat(formData.estimatedFermentationDuration) : null,
              estimatedDistillationStartTime: formData.estimatedDistillationStartTime ? new Date(formData.estimatedDistillationStartTime).toISOString() : null,
              estimatedDistillationDuration: formData.estimatedDistillationDuration ? parseFloat(formData.estimatedDistillationDuration) : null,
              estimatedBarrelingStartTime: formData.estimatedBarrelingStartTime ? new Date(formData.estimatedBarrelingStartTime).toISOString() : null,
              estimatedProcessingStartTime: formData.estimatedProcessingStartTime ? new Date(formData.estimatedProcessingStartTime).toISOString() : null,
              updatedBy: userEmail
            }
          })
        })

        const result = await response.json()
        if (result.errors) {
          console.error('GraphQL errors:', result.errors)
          toast.error('Failed to update schedule order')
          return
        }

        // If loads changed, use the special mutation that triggers BOM recalculation
        if (loadsChanged) {
          const loadsResponse = await fetch('/api/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: `
                mutation UpdateScheduleOrderLoads(
                  $scheduleOrderId: String!
                  $data: UpdateScheduleOrderLoadsInput!
                  $userId: String!
                ) {
                  updateScheduleOrderLoads(
                    scheduleOrderId: $scheduleOrderId
                    data: $data
                    userId: $userId
                  ) {
                    id
                    totalGrainWeight
                    totalWaterVolume
                  }
                }
              `,
              variables: {
                scheduleOrderId: orderQueue.scheduleOrder.id,
                data: {
                  grainLoad: formData.totalGrainWeight ? parseFloat(formData.totalGrainWeight) : undefined,
                  waterLoad: formData.totalWaterVolume ? parseFloat(formData.totalWaterVolume) : undefined
                },
                userId: userEmail || 'unknown'
              }
            })
          })

          const loadsResult = await loadsResponse.json()
          if (loadsResult.errors) {
            console.error('GraphQL errors updating loads:', loadsResult.errors)
            toast.warning('Schedule order updated but load recalculation failed')
          }
        }
      }

      // Save recipe instance changes
      if (hasRecipeChanges && instanceData) {
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

        // Debug: Log mashing step comparison
        console.log('🔍 Mashing steps debug:')
        console.log('  Original steps:', originalMashingSteps.map(s => ({ id: s.id.slice(-6), index: s.index })))
        console.log('  Current steps:', currentMashingSteps.map(s => ({ id: s.id.slice(-6), index: s.index })))

        const mashingSteps = currentMashingSteps
          .filter(step => {
            const original = originalMashingSteps.find(o => o.id === step.id)
            const changed = original && JSON.stringify(original) !== JSON.stringify(step)
            if (changed) {
              console.log(`  Step ${step.id.slice(-6)} changed: original index=${original?.index}, current index=${step.index}`)
            }
            return changed
          })
          .map(step => ({
            id: step.id,
            index: step.index,
            stepTime: step.timeDuration,
            temperatureSetpoint: step.heatTempSp || step.coolTempSp,
            heatEnabled: step.holdType === 'Heat',
            heatTempSp: step.heatTempSp,
            coolEnabled: step.holdType === 'Cool',
            coolTempSp: step.coolTempSp,
            promptMessage: step.notes
          }))

        console.log('  Filtered mashingSteps to send:', mashingSteps)

        console.log('🚀 Calling updateScheduleOrderRecipeInstanceComponents mutation...')
        console.log('  instanceId:', instanceData.id)
        console.log('  input:', { bomItems, parameters, mashingSteps })

        const response = await fetch('/api/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `
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
            `,
            variables: {
              instanceId: instanceData.id,
              input: {
                bomItems: bomItems.length > 0 ? bomItems : undefined,
                parameters: parameters.length > 0 ? parameters : undefined,
                mashingSteps: mashingSteps.length > 0 ? mashingSteps : undefined
              },
              updatedBy: userEmail
            }
          })
        })

        const result = await response.json()
        console.log('📥 Mutation response:', result)
        if (result.errors) {
          console.error('GraphQL errors:', result.errors)
          toast.error('Failed to update recipe instance')
          return
        }
        console.log('✅ Recipe instance update successful')
      }

      toast.success('Changes saved successfully')

      // Update original data
      setOriginalFormData({ ...formData })
      setOriginalProductionOrders(JSON.parse(JSON.stringify(productionOrders)))
      setOriginalIngredients([...currentIngredients])
      setOriginalParameters([...currentParameters])
      setOriginalMashingSteps([...currentMashingSteps])

      if (onSave) {
        await onSave()
      }

      onClose()
    } catch (error) {
      console.error('Error saving:', error)
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

  const isInProgress = orderQueue?.scheduleOrder?.status === 'InProgress' && (orderQueue?.queueIndex ?? 1) <= 0

  if (!orderQueue) return null

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-6xl h-[95vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-3">
            <Edit className="h-5 w-5" />
            Edit Schedule Order
          </DialogTitle>
          <DialogDescription>
            {orderQueue.scheduleOrder.name || `Order ${orderQueue.scheduleOrder.id.slice(-8)}`}
            {instanceData?.recipe?.name && ` - Recipe: ${instanceData.recipe.name}`}
            {' '}(Queue Position: {orderQueue.queueIndex})
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
            <span className="ml-2 text-muted-foreground">Loading data...</span>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden min-h-0">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
              <TabsList className="grid w-full grid-cols-5 flex-shrink-0">
                <TabsTrigger value="schedule" className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Schedule
                </TabsTrigger>
                <TabsTrigger value="bom" className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  BOM ({currentIngredients.length})
                </TabsTrigger>
                <TabsTrigger value="parameters" className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Params ({currentParameters.length})
                </TabsTrigger>
                <TabsTrigger value="mashing" className="flex items-center gap-2">
                  <Beaker className="h-4 w-4" />
                  Mashing ({currentMashingSteps.length})
                </TabsTrigger>
                <TabsTrigger value="history" className="flex items-center gap-2">
                  <History className="h-4 w-4" />
                  History
                </TabsTrigger>
              </TabsList>

              <div className="flex-1 overflow-hidden mt-4 min-h-0">
                {/* Schedule Details Tab */}
                <TabsContent value="schedule" className="mt-0 h-full overflow-auto">
                  <div className="pr-2 space-y-6">
                    {/* Basic Information */}
                    <div className="border rounded-lg p-4">
                      <h3 className="text-lg font-semibold mb-4 text-blue-600 flex items-center gap-2">
                        <ClipboardList className="h-5 w-5" />
                        Basic Information
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="name">Schedule Name</Label>
                          <Input
                            id="name"
                            value={formData.name}
                            onChange={(e) => updateField('name', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="queueIndex">Queue Index</Label>
                          <Input
                            id="queueIndex"
                            type="number"
                            value={formData.queueIndex}
                            disabled
                            className="bg-muted"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="recipeName">Recipe Name</Label>
                          <Input
                            id="recipeName"
                            value={formData.recipeName}
                            onChange={(e) => updateField('recipeName', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="status">Status</Label>
                          <Select value={formData.status} onValueChange={(v) => updateField('status', v)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Created">Created</SelectItem>
                              <SelectItem value="Scheduled">Scheduled</SelectItem>
                              <SelectItem value="InProgress">In Progress</SelectItem>
                              <SelectItem value="Complete">Complete</SelectItem>
                              <SelectItem value="ReadyForSeparation">Ready for Separation</SelectItem>
                              <SelectItem value="Separating">Separating</SelectItem>
                              <SelectItem value="Separated">Separated</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="duration">Duration</Label>
                          <Input
                            id="duration"
                            type="number"
                            step="0.01"
                            value={formData.duration}
                            onChange={(e) => updateField('duration', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="durationUnits">Duration Units</Label>
                          <Select value={formData.durationUnits} onValueChange={(v) => updateField('durationUnits', v)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="hours">Hours</SelectItem>
                              <SelectItem value="days">Days</SelectItem>
                              <SelectItem value="weeks">Weeks</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    {/* Production Totals */}
                    <div className="border rounded-lg p-4">
                      <h3 className="text-lg font-semibold mb-4 text-green-600">Production Totals</h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="totalBarrels">Total Barrels</Label>
                          <Input
                            id="totalBarrels"
                            type="number"
                            step="0.01"
                            value={formData.totalBarrels}
                            onChange={(e) => updateField('totalBarrels', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="totalProofGallons">Total Proof Gallons</Label>
                          <Input
                            id="totalProofGallons"
                            type="number"
                            step="0.01"
                            value={formData.totalProofGallons}
                            onChange={(e) => updateField('totalProofGallons', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="estimatedTotalProductionDuration">Total Production Duration (hrs)</Label>
                          <Input
                            id="estimatedTotalProductionDuration"
                            type="number"
                            step="0.01"
                            value={formData.estimatedTotalProductionDuration}
                            onChange={(e) => updateField('estimatedTotalProductionDuration', e.target.value)}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Overall Schedule Timing */}
                    <div className="border rounded-lg p-4">
                      <h3 className="text-lg font-semibold mb-4 text-purple-600">Overall Schedule Timing</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="estimatedStart">Estimated Start</Label>
                          <Input
                            id="estimatedStart"
                            type="datetime-local"
                            value={formData.estimatedStart}
                            onChange={(e) => updateField('estimatedStart', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="estimatedEnd">Estimated End</Label>
                          <Input
                            id="estimatedEnd"
                            type="datetime-local"
                            value={formData.estimatedEnd}
                            onChange={(e) => updateField('estimatedEnd', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="actualStart">Actual Start</Label>
                          <Input
                            id="actualStart"
                            type="datetime-local"
                            value={formData.actualStart}
                            onChange={(e) => updateField('actualStart', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="actualEnd">Actual End</Label>
                          <Input
                            id="actualEnd"
                            type="datetime-local"
                            value={formData.actualEnd}
                            onChange={(e) => updateField('actualEnd', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="estimatedProcessingStartTime">Processing Start Time</Label>
                          <Input
                            id="estimatedProcessingStartTime"
                            type="datetime-local"
                            value={formData.estimatedProcessingStartTime}
                            onChange={(e) => updateField('estimatedProcessingStartTime', e.target.value)}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Process Stage Timing */}
                    <div className="border rounded-lg p-4">
                      <h3 className="text-lg font-semibold mb-4 text-orange-600">Process Stage Timing & Durations</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {/* Mashing */}
                        <div className="space-y-2">
                          <Label htmlFor="estimatedMashingStartTime">Mashing Start Time</Label>
                          <Input
                            id="estimatedMashingStartTime"
                            type="datetime-local"
                            value={formData.estimatedMashingStartTime}
                            onChange={(e) => updateField('estimatedMashingStartTime', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="estimatedMashingDuration">Mashing Duration (hrs)</Label>
                          <Input
                            id="estimatedMashingDuration"
                            type="number"
                            step="0.01"
                            value={formData.estimatedMashingDuration}
                            onChange={(e) => updateField('estimatedMashingDuration', e.target.value)}
                          />
                        </div>
                        {/* Fermentation */}
                        <div className="space-y-2">
                          <Label htmlFor="estimatedFermentationStartTime">Fermentation Start Time</Label>
                          <Input
                            id="estimatedFermentationStartTime"
                            type="datetime-local"
                            value={formData.estimatedFermentationStartTime}
                            onChange={(e) => updateField('estimatedFermentationStartTime', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="estimatedFermentationDuration">Fermentation Duration (hrs)</Label>
                          <Input
                            id="estimatedFermentationDuration"
                            type="number"
                            step="0.01"
                            value={formData.estimatedFermentationDuration}
                            onChange={(e) => updateField('estimatedFermentationDuration', e.target.value)}
                          />
                        </div>
                        {/* Distillation */}
                        <div className="space-y-2">
                          <Label htmlFor="estimatedDistillationStartTime">Distillation Start Time</Label>
                          <Input
                            id="estimatedDistillationStartTime"
                            type="datetime-local"
                            value={formData.estimatedDistillationStartTime}
                            onChange={(e) => updateField('estimatedDistillationStartTime', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="estimatedDistillationDuration">Distillation Duration (hrs)</Label>
                          <Input
                            id="estimatedDistillationDuration"
                            type="number"
                            step="0.01"
                            value={formData.estimatedDistillationDuration}
                            onChange={(e) => updateField('estimatedDistillationDuration', e.target.value)}
                          />
                        </div>
                        {/* Barreling */}
                        <div className="space-y-2">
                          <Label htmlFor="estimatedBarrelingStartTime">Barreling Start Time</Label>
                          <Input
                            id="estimatedBarrelingStartTime"
                            type="datetime-local"
                            value={formData.estimatedBarrelingStartTime}
                            onChange={(e) => updateField('estimatedBarrelingStartTime', e.target.value)}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Load Configuration */}
                    <div className="border rounded-lg p-4 bg-blue-50/50 dark:bg-blue-950/20">
                      <h3 className="text-lg font-semibold mb-4 text-blue-700 dark:text-blue-400">Load Configuration</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="totalGrainWeight">Total Grain Load (lbs)</Label>
                          <Input
                            id="totalGrainWeight"
                            type="number"
                            step="0.01"
                            min="0"
                            value={formData.totalGrainWeight}
                            onChange={(e) => updateField('totalGrainWeight', e.target.value)}
                            placeholder="e.g., 3000"
                          />
                          <p className="text-xs text-muted-foreground">
                            Total weight of all grains for this production run
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="totalWaterVolume">Total Water Volume (gal)</Label>
                          <Input
                            id="totalWaterVolume"
                            type="number"
                            step="0.01"
                            min="0"
                            value={formData.totalWaterVolume}
                            onChange={(e) => updateField('totalWaterVolume', e.target.value)}
                            placeholder="e.g., 241"
                          />
                          <p className="text-xs text-muted-foreground">
                            Total water volume for mashing
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 p-3 bg-blue-100/50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800">
                        <p className="text-xs text-blue-700 dark:text-blue-300">
                          <strong>Note:</strong> Changing these values will automatically recalculate BOM quantities
                          for grains, enzymes, water, and backset based on the recipe formulas.
                        </p>
                      </div>
                    </div>

                    {/* Yield Estimation */}
                    <div className="border rounded-lg p-4 bg-amber-50/50 dark:bg-amber-950/20">
                      <h3 className="text-lg font-semibold mb-4 text-amber-700 dark:text-amber-400">Yield Estimation</h3>
                      {(() => {
                        // Derive yield values from schedule order data
                        const whiskeyType = productionOrders[0]?.recipe?.whiskeyType || 'RyeBourbon'
                        const isBourbon = ['RyeBourbon', 'WheatedBourbon', 'FourGrainBourbon'].includes(whiskeyType)
                        const yieldRate = isBourbon ? 5.2 : 4.9
                        const avgBarrelFill = 53.07
                        const lbsPerBushel = 56
                        const cooksPerFerm = 3
                        const totalBarrels = formData.totalBarrels ? parseFloat(formData.totalBarrels) : 0
                        const totalCooks = formData.totalCooks ?? 0
                        const totalFermenters = formData.totalFermenters ?? 0

                        // Derive grain per cook from solver-computed totals on the SO
                        const totalGrainWeight = formData.totalGrainWeight ? parseFloat(formData.totalGrainWeight) : 0
                        const grainPerCook = totalCooks > 0 ? totalGrainWeight / totalCooks : 23000

                        // Average proof from production orders
                        const avgProof = productionOrders.length > 0
                          ? productionOrders.reduce((sum, po) => sum + (po.finalProof || 125), 0) / productionOrders.length
                          : 125

                        // Calculation chain
                        const guPerFerm = (grainPerCook * cooksPerFerm) / lbsPerBushel
                        const pgPerBarrel = (avgProof / 100) * avgBarrelFill
                        const pgPerFerm = guPerFerm * yieldRate
                        const bblPerFerm = pgPerFerm / pgPerBarrel

                        return (
                          <>
                            <div className="flex items-center gap-2 mb-3">
                              <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/40 px-3 py-1 text-sm font-medium text-amber-800 dark:text-amber-200">
                                {yieldRate} PG/GU — {isBourbon ? 'Bourbon' : 'Whiskey'}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {whiskeyType.replace(/([A-Z])/g, ' $1').trim()}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                              <div className="p-2 rounded bg-white/60 dark:bg-gray-800/40 border">
                                <div className="text-xs text-muted-foreground">GU/Ferm</div>
                                <div className="font-semibold">{guPerFerm.toFixed(1)} bu</div>
                                <div className="text-xs text-muted-foreground mt-0.5">
                                  {grainPerCook.toLocaleString()} x {cooksPerFerm} / {lbsPerBushel}
                                </div>
                              </div>
                              <div className="p-2 rounded bg-white/60 dark:bg-gray-800/40 border">
                                <div className="text-xs text-muted-foreground">PG/Barrel</div>
                                <div className="font-semibold">{pgPerBarrel.toFixed(1)}</div>
                                <div className="text-xs text-muted-foreground mt-0.5">
                                  ({avgProof.toFixed(0)}/100) x {avgBarrelFill}
                                </div>
                              </div>
                              <div className="p-2 rounded bg-white/60 dark:bg-gray-800/40 border">
                                <div className="text-xs text-muted-foreground">PG/Ferm</div>
                                <div className="font-semibold">{pgPerFerm.toFixed(0)}</div>
                                <div className="text-xs text-muted-foreground mt-0.5">
                                  {guPerFerm.toFixed(1)} x {yieldRate}
                                </div>
                              </div>
                              <div className="p-2 rounded bg-white/60 dark:bg-gray-800/40 border">
                                <div className="text-xs text-muted-foreground">BBL/Ferm</div>
                                <div className="font-semibold">{bblPerFerm.toFixed(1)}</div>
                                <div className="text-xs text-muted-foreground mt-0.5">
                                  {pgPerFerm.toFixed(0)} / {pgPerBarrel.toFixed(1)}
                                </div>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mt-3">
                              <div className="p-2 rounded bg-white/60 dark:bg-gray-800/40 border">
                                <div className="text-xs text-muted-foreground">Total Fermenters</div>
                                <div className="font-semibold">{totalFermenters || (totalBarrels > 0 ? Math.ceil(totalBarrels / bblPerFerm) : '—')}</div>
                              </div>
                              <div className="p-2 rounded bg-white/60 dark:bg-gray-800/40 border">
                                <div className="text-xs text-muted-foreground">Total Cooks</div>
                                <div className="font-semibold">{totalCooks || (totalFermenters > 0 ? totalFermenters * cooksPerFerm : '—')}</div>
                              </div>
                              <div className="p-2 rounded bg-white/60 dark:bg-gray-800/40 border">
                                <div className="text-xs text-muted-foreground">Total Grain</div>
                                <div className="font-semibold">{totalGrainWeight > 0 ? `${(totalGrainWeight / 1000).toFixed(1)}k lbs` : '—'}</div>
                              </div>
                              <div className="p-2 rounded bg-white/60 dark:bg-gray-800/40 border">
                                <div className="text-xs text-muted-foreground">Total PG</div>
                                <div className="font-semibold">{totalBarrels > 0 ? `${(totalBarrels * pgPerBarrel).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}</div>
                              </div>
                            </div>
                            <div className="mt-3 p-2 bg-amber-100/50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-800">
                              <p className="text-xs text-amber-700 dark:text-amber-300">
                                Yield estimates sourced from production metrics. Values update when metrics are changed in Configuration.
                              </p>
                            </div>
                          </>
                        )
                      })()}
                    </div>

                    {/* Production Orders */}
                    {productionOrders.length > 0 && (
                      <div className="border rounded-lg p-4">
                        <h3 className="text-lg font-semibold mb-4 text-green-600">Associated Production Orders</h3>
                        <div className="space-y-4">
                          {productionOrders.map((po, index) => (
                            <div key={po.id} className="border rounded p-4 bg-muted/50">
                              <h4 className="font-medium mb-3">
                                Production Order {index + 1}: {po.name || 'Unnamed'}
                              </h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                                <div className="space-y-2">
                                  <Label className="text-sm">Order Name</Label>
                                  <Input
                                    value={po.name || ''}
                                    onChange={(e) => {
                                      const updated = [...productionOrders]
                                      updated[index].name = e.target.value || null
                                      setProductionOrders(updated)
                                    }}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-sm">Status</Label>
                                  <Select
                                    value={po.status}
                                    onValueChange={(v) => {
                                      const updated = [...productionOrders]
                                      updated[index].status = v
                                      setProductionOrders(updated)
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="Planned">Planned</SelectItem>
                                      <SelectItem value="Committed">Committed</SelectItem>
                                      <SelectItem value="Initiated">Initiated</SelectItem>
                                      <SelectItem value="InProgress">In Progress</SelectItem>
                                      <SelectItem value="Complete">Complete</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-sm">Quantity</Label>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    value={po.quantity?.toString() || ''}
                                    onChange={(e) => {
                                      const updated = [...productionOrders]
                                      updated[index].quantity = e.target.value ? parseFloat(e.target.value) : null
                                      setProductionOrders(updated)
                                    }}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-sm">Container Type</Label>
                                  <Select
                                    value={po.containerType || 'LargeBarrel'}
                                    onValueChange={(v) => {
                                      const updated = [...productionOrders]
                                      updated[index].containerType = v
                                      setProductionOrders(updated)
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="LargeBarrel">Large Barrel</SelectItem>
                                      <SelectItem value="SmallBarrel">Small Barrel</SelectItem>
                                      <SelectItem value="Tank">Tank</SelectItem>
                                      <SelectItem value="Tote">Tote</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* BOM Tab */}
                <TabsContent value="bom" className="mt-0 h-full overflow-auto">
                  <div className="pr-2">
                    {currentIngredients.length > 0 ? (
                      <RecipeBOMEditor
                        ingredients={currentIngredients}
                        onIngredientsChange={setCurrentIngredients}
                        isEditing={true}
                      />
                    ) : (
                      <div className="flex items-center justify-center h-48 text-muted-foreground">
                        No BOM data available for this schedule order
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* Parameters Tab */}
                <TabsContent value="parameters" className="mt-0 h-full overflow-auto">
                  <div className="pr-2">
                    {currentParameters.length > 0 ? (
                      <RecipeParametersEditor
                        parameters={currentParameters}
                        onParametersChange={setCurrentParameters}
                        isEditing={true}
                      />
                    ) : (
                      <div className="flex items-center justify-center h-48 text-muted-foreground">
                        No parameters available for this schedule order
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* Mashing Protocol Tab */}
                <TabsContent value="mashing" className="mt-0 h-full overflow-auto">
                  <div className="pr-2">
                    {currentMashingSteps.length > 0 ? (
                      <MashingProtocolEditor
                        steps={currentMashingSteps}
                        onStepsChange={setCurrentMashingSteps}
                        isEditing={true}
                      />
                    ) : (
                      <div className="flex items-center justify-center h-48 text-muted-foreground">
                        No mashing protocol available for this schedule order
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* Change History Tab */}
                <TabsContent value="history" className="mt-0 h-full overflow-auto">
                  <div className="pr-2">
                    {orderQueue?.scheduleOrder?.id ? (
                      <ScheduleOrderChangeHistory
                        scheduleOrderId={orderQueue.scheduleOrder.id}
                        limit={50}
                      />
                    ) : (
                      <div className="flex items-center justify-center h-48 text-muted-foreground">
                        No schedule order selected
                      </div>
                    )}
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
                {hasScheduleChanges && hasRecipeChanges && ' (Schedule + Recipe)'}
                {hasScheduleChanges && !hasRecipeChanges && ' (Schedule)'}
                {!hasScheduleChanges && hasRecipeChanges && ' (Recipe)'}
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
