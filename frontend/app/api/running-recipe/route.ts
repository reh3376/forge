import { NextRequest, NextResponse } from 'next/server'
import { runningRecipeService } from '@/lib/api/running-recipe-service'
import { 
  type RunningRecipe, 
  type RunningRecipeCreateInput,
  type RunningRecipeUpdateInput 
} from '@/lib/api/graphql/running-recipes'

// Type for the request body when saving running recipe
interface SaveRunningRecipeRequest {
  orderQueueId: string
  recipeData: {
    id?: string
    name: string
    ingredients: Array<{
      id?: string
      itemCode: string
      name: string
      quantity: number
      unit: string
      category: string
      operation: string
    }>
    parameters: Array<{
      id?: string
      name: string
      description: string
      type: string
      value: number | string | boolean
      unit?: string
    }>
    mashingSteps: Array<{
      id?: string
      stepType: string
      holdType?: string
      included: boolean
      notes?: string
      heatTempSp?: number
      timeDuration?: number
      index: number
      temperatureSetpoint?: number
      heatEnabled?: boolean
      coolEnabled?: boolean
      coolTempSp?: number
      agitatorEnabled?: boolean
      agitatorSpdSp?: number
      promptMessage?: string
    }>
    originalRecipeId?: string
  }
  updateMasterRecipe: boolean
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const orderQueueId = searchParams.get('orderQueueId')

    if (!orderQueueId) {
      return NextResponse.json(
        { success: false, message: 'Order queue ID is required' },
        { status: 400 }
      )
    }

    console.log('🧪 Fetching running recipe for order queue:', orderQueueId)

    // Try to fetch existing running recipe
    const existingRunningRecipe = await runningRecipeService.getRunningRecipeByOrderQueue(
      orderQueueId,
      'network-only' // Always fetch fresh data
    )

    if (existingRunningRecipe) {
      console.log('🧪 Found existing running recipe:', existingRunningRecipe.id)
      
      return NextResponse.json({
        success: true,
        data: {
          id: existingRunningRecipe.id,
          name: existingRunningRecipe.name,
          ingredients: existingRunningRecipe.ingredients,
          parameters: existingRunningRecipe.parameters,
          mashingSteps: existingRunningRecipe.mashingSteps,
          originalRecipeId: existingRunningRecipe.originalRecipeId
        }
      })
    }

    // If no running recipe exists, we need to create one from the master recipe
    // For now, return a message indicating this
    console.log('🧪 No running recipe found for order queue:', orderQueueId)
    
    return NextResponse.json({
      success: false,
      message: 'No running recipe found for this order queue. A running recipe needs to be created from the master recipe first.',
      requiresCreation: true
    }, { status: 404 })

  } catch (error) {
    console.error('🔥 Error fetching running recipe:', error)
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to fetch running recipe',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: SaveRunningRecipeRequest = await request.json()
    const { orderQueueId, recipeData, updateMasterRecipe } = body

    if (!orderQueueId || !recipeData) {
      return NextResponse.json(
        { success: false, message: 'Order queue ID and recipe data are required' },
        { status: 400 }
      )
    }

    console.log('🧪 Saving running recipe for order queue:', orderQueueId, {
      updateMasterRecipe,
      hasExistingId: !!recipeData.id,
      ingredientsCount: recipeData.ingredients.length,
      parametersCount: recipeData.parameters.length,
      mashingStepsCount: recipeData.mashingSteps.length
    })

    let runningRecipe: RunningRecipe

    if (recipeData.id) {
      // Update existing running recipe
      const updateData: RunningRecipeUpdateInput = {
        name: recipeData.name,
        status: 'Modified',
        ingredients: {
          // For simplicity, we'll delete all existing and recreate
          // In a real implementation, you'd want to do proper diff and update
          create: recipeData.ingredients.map(ing => ({
            itemCode: ing.itemCode,
            name: ing.name,
            quantity: ing.quantity,
            unit: ing.unit,
            category: ing.category,
            operation: ing.operation
          }))
        },
        parameters: {
          create: recipeData.parameters.map(param => ({
            name: param.name,
            description: param.description,
            type: param.type,
            value: param.value,
            ...(param.unit !== undefined && { unit: param.unit })
          }))
        },
        mashingSteps: {
          create: recipeData.mashingSteps.map(step => ({
            stepType: step.stepType,
            ...(step.holdType !== undefined && { holdType: step.holdType }),
            included: step.included,
            ...(step.notes !== undefined && { notes: step.notes }),
            ...(step.heatTempSp !== undefined && { heatTempSp: step.heatTempSp }),
            ...(step.timeDuration !== undefined && { timeDuration: step.timeDuration }),
            index: step.index,
            ...(step.temperatureSetpoint !== undefined && { temperatureSetpoint: step.temperatureSetpoint }),
            ...(step.heatEnabled !== undefined && { heatEnabled: step.heatEnabled }),
            ...(step.coolEnabled !== undefined && { coolEnabled: step.coolEnabled }),
            ...(step.coolTempSp !== undefined && { coolTempSp: step.coolTempSp }),
            ...(step.agitatorEnabled !== undefined && { agitatorEnabled: step.agitatorEnabled }),
            ...(step.agitatorSpdSp !== undefined && { agitatorSpdSp: step.agitatorSpdSp }),
            ...(step.promptMessage !== undefined && { promptMessage: step.promptMessage })
          }))
        }
      }

      runningRecipe = await runningRecipeService.updateRunningRecipe(recipeData.id, updateData)
    } else {
      // Create new running recipe
      if (!recipeData.originalRecipeId) {
        return NextResponse.json(
          { success: false, message: 'Original recipe ID is required for creating new running recipe' },
          { status: 400 }
        )
      }

      const createData: RunningRecipeCreateInput = {
        name: recipeData.name,
        originalRecipeId: recipeData.originalRecipeId,
        orderQueueId,
        ingredients: {
          create: recipeData.ingredients.map(ing => ({
            itemCode: ing.itemCode,
            name: ing.name,
            quantity: ing.quantity,
            unit: ing.unit,
            category: ing.category,
            operation: ing.operation
          }))
        },
        parameters: {
          create: recipeData.parameters.map(param => ({
            name: param.name,
            description: param.description,
            type: param.type,
            value: param.value,
            ...(param.unit !== undefined && { unit: param.unit })
          }))
        },
        mashingSteps: {
          create: recipeData.mashingSteps.map(step => ({
            stepType: step.stepType,
            ...(step.holdType !== undefined && { holdType: step.holdType }),
            included: step.included,
            ...(step.notes !== undefined && { notes: step.notes }),
            ...(step.heatTempSp !== undefined && { heatTempSp: step.heatTempSp }),
            ...(step.timeDuration !== undefined && { timeDuration: step.timeDuration }),
            index: step.index,
            ...(step.temperatureSetpoint !== undefined && { temperatureSetpoint: step.temperatureSetpoint }),
            ...(step.heatEnabled !== undefined && { heatEnabled: step.heatEnabled }),
            ...(step.coolEnabled !== undefined && { coolEnabled: step.coolEnabled }),
            ...(step.coolTempSp !== undefined && { coolTempSp: step.coolTempSp }),
            ...(step.agitatorEnabled !== undefined && { agitatorEnabled: step.agitatorEnabled }),
            ...(step.agitatorSpdSp !== undefined && { agitatorSpdSp: step.agitatorSpdSp }),
            ...(step.promptMessage !== undefined && { promptMessage: step.promptMessage })
          }))
        }
      }

      const runningRecipeId = await runningRecipeService.createRunningRecipe(createData)
      runningRecipe = await runningRecipeService.getRunningRecipe(runningRecipeId) as RunningRecipe
    }

    // If requested, update the master recipe with the changes
    if (updateMasterRecipe && runningRecipe.id) {
      try {
        const updateResult = await runningRecipeService.updateMasterRecipeFromRunning(runningRecipe.id)
        console.log('🧪 Master recipe update result:', updateResult)
      } catch (error) {
        console.error('🔥 Error updating master recipe:', error)
        // Don't fail the whole operation if master recipe update fails
      }
    }

    console.log('🧪 Successfully saved running recipe:', {
      id: runningRecipe.id,
      name: runningRecipe.name,
      status: runningRecipe.status
    })

    return NextResponse.json({
      success: true,
      data: {
        id: runningRecipe.id,
        name: runningRecipe.name,
        status: runningRecipe.status,
        updatedAt: runningRecipe.updatedAt
      },
      message: updateMasterRecipe 
        ? 'Running recipe and master recipe updated successfully'
        : 'Running recipe updated successfully'
    })

  } catch (error) {
    console.error('🔥 Error saving running recipe:', error)
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to save running recipe',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
} 