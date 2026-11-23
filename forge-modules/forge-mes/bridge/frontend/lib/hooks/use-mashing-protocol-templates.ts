import { useMemo } from 'react'
import { useQuery } from '@apollo/client'
import { GET_MASHING_PROTOCOL_TEMPLATES } from '@/lib/api/graphql-queries'
import { toast } from 'sonner'
import type { MashingStep } from '@/components/ui/recipe-components'

// Types for mashing protocol template data
export interface MashingProtocolTemplate {
  id: string
  name: string
  templateCategory: 'FourGrain' | 'HighRye' | 'StraightBourbon'
  templateDescription?: string
  createdAt: string
  updatedAt: string
  createdBy: string
  steps: Array<{
    id: string
    index: number
    stepType: string
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
    recipeBomItems: Array<{
      id: string
      quantity: number
      unit: string
      item: {
        id: string
        itemNumber: string
        itemName: string
      }
    }>
  }>
}

// GraphQL response type
interface MashingProtocolTemplatesResponse {
  mashingProtocols: GraphQLMashingProtocolTemplate[]
}

// GraphQL response types (matching actual schema)
interface GraphQLMashingProtocolTemplate {
  id: string
  name: string
  templateCategory: string
  templateDescription: string | null
  createdBy: string
  steps: GraphQLMashingProtocolStep[]
}

interface GraphQLMashingProtocolStep {
  id: string
  index: number
  stepTime: number | null
  stepType: string
  holdType: string | null
  heatTempSp: number | null
  coolTempSp: number | null
  temperatureSetpoint: number | null
  agitatorEnabled: boolean | null
  agitatorSpdSp: number | null
  recipeBomItem: GraphQLRecipeBomItem[]
}

interface GraphQLRecipeBomItem {
  id: string
  quantity: number
  item: {
    id: string
    itemNumber: string
    itemName: string
  }
}

export function useMashingProtocolTemplates() {
  const { data, loading, error } = useQuery<MashingProtocolTemplatesResponse>(
    GET_MASHING_PROTOCOL_TEMPLATES,
    {
      onCompleted: () => {
        console.log('✅ Mashing protocol templates loaded successfully')
      },
      onError: (error) => {
        console.error('❌ Mashing protocol templates query error:', error)
        toast.error('Failed to load mashing protocol templates')
      }
    }
  )

  // Process templates data
  const processedTemplates = useMemo(() => {
    if (!data?.mashingProtocols) return []
    
    return data.mashingProtocols.map((template: GraphQLMashingProtocolTemplate): MashingProtocolTemplate => ({
      id: template.id,
      name: template.name,
      templateCategory: template.templateCategory as 'FourGrain' | 'HighRye' | 'StraightBourbon',
      templateDescription: template.templateDescription || '',
      createdAt: '',
      updatedAt: '',
      createdBy: template.createdBy,
      steps: template.steps.map((step) => {
        const stepData: Partial<MashingProtocolTemplate['steps'][0]> = {
          id: step.id,
          index: step.index,
          stepType: step.stepType,
          recipeBomItems: step.recipeBomItem.map(bomItem => ({
            id: bomItem.id,
            quantity: bomItem.quantity,
            unit: 'lbs', // Default unit since it's not in the schema
            item: {
              id: bomItem.item.id,
              itemNumber: bomItem.item.itemNumber,
              itemName: bomItem.item.itemName
            }
          }))
        }
        
        // Add optional properties only if they have values
        if (step.holdType) {
          stepData.holdType = step.holdType
        }
        if (step.stepTime) {
          stepData.stepTime = step.stepTime
        }
        if (step.heatTempSp !== null && step.heatTempSp !== undefined) {
          stepData.heatTempSp = step.heatTempSp
        }
        if (step.coolTempSp !== null && step.coolTempSp !== undefined) {
          stepData.coolTempSp = step.coolTempSp
        }
        if (step.temperatureSetpoint !== null && step.temperatureSetpoint !== undefined) {
          stepData.temperatureSetpoint = step.temperatureSetpoint
        }
        if (step.agitatorEnabled !== null && step.agitatorEnabled !== undefined) {
          stepData.agitatorEnabled = step.agitatorEnabled
        }
        if (step.agitatorSpdSp !== null && step.agitatorSpdSp !== undefined) {
          stepData.agitatorSpdSp = step.agitatorSpdSp
        }
        
        return stepData as MashingProtocolTemplate['steps'][0]
      })
    }))
  }, [data])

  const templates = processedTemplates

  // Transform template steps to wizard format
  const transformTemplateToMashingSteps = (template: MashingProtocolTemplate): MashingStep[] => {
    return template.steps.map((step, index) => {
      const mashingStep: MashingStep = {
        id: `template_step_${step.id}_${Date.now()}_${index}`, // Generate unique ID for wizard
        index: step.index,
        stepType: step.stepType as MashingStep['stepType'],
        included: true, // Templates are included by default
        notes: step.promptMessage || ''
      }

      // Add hold type if present
      if (step.holdType && step.holdType !== 'None') {
        const validHoldTypes = ['Heat', 'Cool', 'None'] as const
        type ValidHoldType = typeof validHoldTypes[number]
        if (validHoldTypes.includes(step.holdType as ValidHoldType)) {
          mashingStep.holdType = step.holdType as 'Heat' | 'Cool' | 'None'
        }
      }

      // Add temperature setpoints
      if (step.heatTempSp !== undefined && step.heatTempSp !== null) {
        mashingStep.heatTempSp = step.heatTempSp
      }
      if (step.coolTempSp !== undefined && step.coolTempSp !== null) {
        mashingStep.coolTempSp = step.coolTempSp
      }
      if (step.temperatureSetpoint !== undefined && step.temperatureSetpoint !== null) {
        // Use temperatureSetpoint as fallback for heatTempSp if not already set
        if (!mashingStep.heatTempSp && !mashingStep.coolTempSp) {
          mashingStep.heatTempSp = step.temperatureSetpoint
        }
      }

      // Add time duration
      if (step.stepTime !== undefined && step.stepTime !== null) {
        mashingStep.timeDuration = step.stepTime
      }

      // Transform recipeBomItems
      if (step.recipeBomItems && step.recipeBomItems.length > 0) {
        mashingStep.recipeBomItems = step.recipeBomItems.map(bomItem => ({
          id: `template_bom_${bomItem.id}_${Date.now()}`,
          item: {
            id: bomItem.item.id,
            itemName: bomItem.item.itemName,
            itemNumber: bomItem.item.itemNumber,
            itemType: '',
            itemClass: '',
            itemGroup: ''
          },
          quantity: bomItem.quantity,
          displayUnits: { id: bomItem.unit || 'lbs', name: bomItem.unit || 'pounds' },
          operation: ''
        }))
      }

      return mashingStep
    })
  }

  const loadTemplateAsSteps = async (templateId: string): Promise<MashingStep[] | null> => {
    try {
      const template = templates.find((t: MashingProtocolTemplate) => t.id === templateId)
      
      if (!template) {
        toast.error('Template not found')
        return null
      }

      const mashingSteps = transformTemplateToMashingSteps(template)
      
      toast.success(`Loaded template: ${template.name}`)
      return mashingSteps
      
    } catch (error) {
      console.error('Error loading template as steps:', error)
      toast.error('Failed to load template')
      return null
    }
  }

  // Group templates by category
  const templatesByCategory = useMemo(() => {
    return templates.reduce((acc: Record<string, MashingProtocolTemplate[]>, template: MashingProtocolTemplate) => {
      const category = template.templateCategory || 'Other'
      if (!acc[category]) {
        acc[category] = []
      }
      acc[category].push(template)
      return acc
    }, {})
  }, [templates])

  return {
    templates,
    templatesByCategory,
    loading,
    error,
    loadTemplateAsSteps,
    refetch: () => {}
  }
} 