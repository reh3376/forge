'use client'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { Plus, Search, Filter, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageContainer } from '@/components/ui/layout'
import { RouteGuard } from '@/components/auth/route-guard'
import { ManufacturingPermission } from '@/lib/auth-config'
import { Recipe, MashingProtocolStep, BomCalculationMode, BomFormulaType } from '@/types'
import { RecipeEditModal, RecipeEditData } from '@/components/recipe/recipe-edit-modal'
import { RecipeIngredient } from '@/components/ui/recipe-components'
import { categorizeIngredientByItemGroup } from '@/lib/recipe-utils'
import { parseMashBillFromRecipeName, groupRecipesByFamily, type MashBill, type RecipeFamily } from '@/lib/recipe-utils'
import { ChevronDown, ChevronRight, Layers } from 'lucide-react'
import { Pagination, PaginationInfo, PageSizeSelector } from '@/components/ui/pagination'
import { RecipeGeneratorDialog } from '@/components/recipe/recipe-generator-dialog'
import { usePaginatedRecipes, formatRecipeDisplayName, getRecipeStatusDisplay, formatWhiskeyType } from '@/hooks/use-recipes'
import { useCurrentUserEmail } from '@/lib/utils/user-context'
import { useLazyQuery } from '@apollo/client'
import { RECIPE_QUERIES } from '@/lib/api/graphql-queries'
import { toast } from 'sonner'

const UPDATE_MASTER_RECIPE_MUTATION = `
  mutation UpdateMasterRecipe($id: String!, $input: UpdateMasterRecipeInput!) {
    updateMasterRecipe(id: $id, input: $input) {
      id
      Recipe
      active
      createdAt
      createdBy
      revision
      updatedAt
      updatedBy
      whiskeyType
    }
  }
`;

export default function RecipeManagementPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(new Set())
  const [expandedFamilyRevisions, setExpandedFamilyRevisions] = useState<Map<string, Recipe[]>>(new Map())
  const [loadingFamilies, setLoadingFamilies] = useState<Set<string>>(new Set())
  const [activeRevisions, setActiveRevisions] = useState<Map<string, Recipe>>(new Map()) // Stores the active/top revision for each family

  const {
    recipes,
    loading,
    error,
    totalCount,
    currentPage,
    totalPages,
    pagination,
    goToPage,
    updateFilter,
    updatePageSize,
    refetch
  } = usePaginatedRecipes({ skip: 0, take: 12 })

  // Get current user email for audit trails
  const userEmail = useCurrentUserEmail()

  // Lazy query for fetching a specific recipe by ID
  const [fetchRecipe, { loading: fetchingRecipe }] = useLazyQuery(RECIPE_QUERIES.GET_RECIPE, {
    fetchPolicy: 'network-only', // Always fetch fresh data
  })

  // Lazy query for fetching all revisions of a recipe family
  const [fetchFamilyRevisions] = useLazyQuery(RECIPE_QUERIES.GET_FAMILY_REVISIONS, {
    fetchPolicy: 'network-only',
  })

  // Handle search with debouncing
  const handleSearch = useCallback((term: string) => {
    const newFilter = term.trim() ? {
      Recipe: {
        contains: term,
        mode: 'Insensitive' as const
      }
    } : undefined
    updateFilter(newFilter)
  }, [updateFilter])

  // Debounced search effect
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      handleSearch(searchTerm)
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [searchTerm, handleSearch])

  // Helper function to calculate mash bill from BOM items (fallback method)
  const calculateMashBillFromBOM = useCallback((recipeBoms: Recipe['recipeBoms']): MashBill => {
    const defaultMashBill: MashBill = { corn: 0, rye: 0, wheat: 0, maltedBarley: 0 }
    
    console.log('🔍 Calculating mash bill from BOM (fallback method):', recipeBoms)
    
    if (!recipeBoms || recipeBoms.length === 0) {
      console.log('❌ No recipe BOMs found')
      return defaultMashBill
    }

    // Get the first (or master) BOM
    const bom = recipeBoms.find((b) => b.master) || recipeBoms[0]
    if (!bom || !bom.recipeBomITem) {
      console.log('❌ No BOM or BOM items found:', bom)
      return defaultMashBill
    }

    console.log('📋 Found BOM with items:', bom.recipeBomITem)

    // Filter for grain items (typically in Mashing01 operation)
    const grainItems = bom.recipeBomITem.filter((item) => 
      item.operation === 'Mashing01' && 
      item.item?.itemName && 
      item.quantity && 
      item.quantity > 0
    )

    console.log('🌾 Filtered grain items:', grainItems)

    if (grainItems.length === 0) {
      console.log('❌ No grain items found')
      return defaultMashBill
    }

    // Calculate total grain weight
    const totalGrainWeight = grainItems.reduce((sum: number, item) => sum + (item.quantity || 0), 0)
    
    console.log('⚖️ Total grain weight:', totalGrainWeight)
    
    if (totalGrainWeight === 0) {
      console.log('❌ Total grain weight is zero')
      return defaultMashBill
    }

    // Map grain names to mash bill components
    const mashBill: MashBill = { corn: 0, rye: 0, wheat: 0, maltedBarley: 0 }
    
    grainItems.forEach((item) => {
      const itemName = item.item?.itemName?.toLowerCase() || ''
      const percentage = Math.round(((item.quantity || 0) / totalGrainWeight) * 100)
      
      console.log(`🔍 Processing grain: ${itemName}, quantity: ${item.quantity}, percentage: ${percentage}%`)
      
      if (itemName.includes('corn') || itemName.includes('maize')) {
        mashBill.corn += percentage
      } else if (itemName.includes('rye')) {
        mashBill.rye += percentage
      } else if (itemName.includes('wheat')) {
        mashBill.wheat += percentage
      } else if (itemName.includes('malt') || itemName.includes('barley')) {
        mashBill.maltedBarley += percentage
      }
      // Note: Some items might not match any category, which is fine
    })

    console.log('🎯 Final calculated mash bill from BOM:', mashBill)
    return mashBill
  }, [])

  // Helper function to get mash bill - tries recipe name parsing first, falls back to BOM calculation
  const getMashBill = useCallback((recipe: Recipe): MashBill => {
    // First, try to parse from recipe name
    const parsedMashBill = parseMashBillFromRecipeName(recipe.Recipe)
    
    if (parsedMashBill) {
      console.log('✅ Using mash bill from recipe name parsing')
      return parsedMashBill
    }
    
    // Fallback to BOM calculation
    console.log('⚠️ Recipe name parsing failed, falling back to BOM calculation')
    return calculateMashBillFromBOM(recipe.recipeBoms)
  }, [calculateMashBillFromBOM])

  // Transform Recipe API data to RecipeEditData format - memoized to prevent recreation
  const transformRecipeToEditData = useCallback((recipe: Recipe): RecipeEditData => {
    // Calculate mash bill from BOM items
    const mashBill = getMashBill(recipe)
    
    return {
      details: {
        Recipe: recipe.Recipe || '',
        active: recipe.active || true,
        whiskeyType: recipe.whiskeyType || '',
        revision: recipe.revision?.toString() || '1',
        customerCode: recipe.customerCode || recipe.customer?.customerCode || '',
        cooksPerFerm: recipe.cooksPerFerm || 4,
        createdAt: recipe.createdAt instanceof Date ? recipe.createdAt.toISOString() :
                   typeof recipe.createdAt === 'string' ? recipe.createdAt :
                   new Date().toISOString(),
        createdBy: recipe.createdBy || 'Unknown',
        mashBill,
        id: recipe.id,
        baseRecipeName: (recipe as any).baseRecipeName || undefined
      },
      bom: {
        ingredients: recipe.recipeBoms?.[0]?.recipeBomITem?.map((item) => {
          console.log('🔍 BOM Item RAW:', {
            id: item.id,
            itemNumber: item.item?.itemNumber,
            quantity: item.quantity,
            displayUnits_full: item.displayUnits,
            displayUnits_id: item.displayUnits?.id,
            displayUnits_name: item.displayUnits?.name,
            displayUnits_abbr: item.displayUnits?.abbreviation
          });

          const rawUnit = item.displayUnits?.abbreviation || item.displayUnits?.name || '';
          // Normalize unit values to match frontend expectations
          const normalizedUnit = rawUnit.trim();

          console.log('🔍 BOM Item PROCESSED:', {
            itemNumber: item.item?.itemNumber,
            rawUnit: `"${rawUnit}"`,
            normalizedUnit: `"${normalizedUnit}"`,
            unitLength: normalizedUnit.length
          });

          // Build base ingredient object
          const ingredient: RecipeIngredient = {
            id: item.id,
            itemCode: item.item?.itemNumber || item.item?.id || '',
            name: item.item?.itemName || '',
            quantity: item.quantity || 0,
            unit: normalizedUnit,
            category: categorizeIngredientByItemGroup(item.item?.itemGroup, item.item?.itemName, item.item?.itemNumber),
            operation: (item.operation || 'Mashing01') as string,
            createdAt: item.createdAt instanceof Date ? item.createdAt :
                       typeof item.createdAt === 'string' ? new Date(item.createdAt) :
                       new Date(),
            calculationMode: (item.calculationMode || 'STATIC') as BomCalculationMode
          }

          // Add optional fields only if they have values (for exactOptionalPropertyTypes)
          if (item.item?.itemGroup) ingredient.itemGroup = item.item.itemGroup
          if (item.formulaType) ingredient.formulaType = item.formulaType as BomFormulaType
          if (item.formulaMultiplier != null) ingredient.formulaMultiplier = item.formulaMultiplier
          if (item.customExpression) ingredient.customExpression = item.customExpression
          if (item.formulaLibraryId) ingredient.formulaLibraryId = item.formulaLibraryId
          if (item.expressionVariables) ingredient.expressionVariables = item.expressionVariables as Record<string, unknown>
          if (item.expressionValidated != null) ingredient.expressionValidated = item.expressionValidated

          return ingredient
        }) || []
      },
      parameters: {
        parameters: recipe.parameters?.map((param) => ({
          id: param.id,
          name: param.recipeParamName,
          description: param.recipeParamDescription || param.description || '',
          type: param.recipeSetpointType === 'Numeric' ? 'numeric' as const : 
                param.recipeSetpointType === 'Boolean' ? 'boolean' as const : 'text' as const,
          value: param.recipeNumericalSetpoint || param.recipeSetpointBooleanValue || '',
          unit: param.units?.abbreviation || '',
          createdAt: param.createdAt instanceof Date ? param.createdAt : 
                     typeof param.createdAt === 'string' ? new Date(param.createdAt) : 
                     new Date()
        })) || []
      },
      mashing: {
        mashingSteps: recipe.mashingProtocol?.steps?.map((step: MashingProtocolStep) => {
          const baseStep = {
            id: step.id,
            index: step.index || 0,
            stepType: (step.stepType as 'LiquidAdd' | 'Hold' | 'AdditiveAdd' | 'Malt' | 'Corn' | 'Rye') || 'Hold',
            holdType: (step.holdType as 'Heat' | 'Cool' | 'None') || 'None',
            timeDuration: step.stepTime || 0,
            waterBacksetSP: 0, // Not available in GraphQL schema, default to 0
            additiveType: step.promptMessage || '', // Use promptMessage as additiveType
            included: true, // Default to included
            notes: step.promptMessage || '', // Use promptMessage as notes
            recipeBomItems: step.recipeBomItem?.map((bomItem) => {
              // Only multiply by 100 for percentage-based units (grains)
              const unitName = bomItem.displayUnits?.name?.toLowerCase() || ''
              const isPercentage = unitName === '%' || unitName.includes('percent')

              return {
                id: bomItem.id,
                item: {
                  id: bomItem.item?.id || '',
                  itemNumber: bomItem.item?.itemNumber || '',
                  itemName: bomItem.item?.itemName || '',
                  itemType: bomItem.item?.itemType || '',
                  itemClass: bomItem.item?.itemClass || '',
                  itemGroup: bomItem.item?.itemGroup || null
                },
                quantity: isPercentage ? (bomItem.quantity || 0) * 100 : (bomItem.quantity || 0),
                displayUnits: bomItem.displayUnits ? {
                  id: bomItem.displayUnits.id,
                  name: bomItem.displayUnits.name || ''
                } : null,
                operation: bomItem.operation || ''
              }
            }) || [] // Transform BOM items to match expected interface
          }
          
          // Only add temperature properties if they have values
          if (step.heatTempSp) {
            return { ...baseStep, heatTempSp: step.heatTempSp }
          }
          if (step.coolTempSp) {
            return { ...baseStep, coolTempSp: step.coolTempSp }
          }
          
          return baseStep
        }) || []
      }
    }
  }, [getMashBill])

  // Handle recipe card click - memoized to prevent re-renders
  const handleRecipeClick = useCallback((recipe: Recipe) => {
    console.log('🔍 CLICKED RECIPE RAW DATA:', JSON.stringify(recipe, null, 2))
    console.log('🔍 CLICKED RECIPE recipeBoms:', recipe.recipeBoms)
    if (recipe.recipeBoms && recipe.recipeBoms[0]?.recipeBomITem) {
      console.log('🔍 CLICKED RECIPE FIRST BOM ITEM:', JSON.stringify(recipe.recipeBoms[0].recipeBomITem[0], null, 2))
    }
    setSelectedRecipe(recipe)
    setIsEditModalOpen(true)
  }, [])

  // Handle modal close
  const handleModalClose = () => {
    setIsEditModalOpen(false)
    setSelectedRecipe(null)
  }

  // Handle selecting a different revision from the revision history
  const handleSelectRevision = useCallback(async (recipeId: string) => {
    // First, try to find the recipe in the current data
    const recipe = recipes?.find((r: Recipe) => r.id === recipeId)
    if (recipe) {
      // Recipe is in the current data, use it directly
      setSelectedRecipe(recipe)
      // Modal stays open with new recipe
      return
    }

    // Recipe not in current page, fetch it by ID
    console.log('Recipe not found in current page, fetching:', recipeId)
    toast.info('Loading revision...')

    try {
      const result = await fetchRecipe({
        variables: { id: recipeId }
      })

      if (result.data?.recipe) {
        const fetchedRecipe = result.data.recipe as Recipe
        console.log('Fetched recipe:', fetchedRecipe)
        setSelectedRecipe(fetchedRecipe)
        toast.success('Revision loaded')
        // Modal stays open with the fetched recipe
      } else {
        console.error('Recipe not found:', recipeId)
        toast.error('Failed to load revision')
        setIsEditModalOpen(false)
        setSelectedRecipe(null)
      }
    } catch (error) {
      console.error('Error fetching recipe:', error)
      toast.error('Failed to load revision')
      setIsEditModalOpen(false)
      setSelectedRecipe(null)
    }
  }, [recipes, fetchRecipe])

  // Helper function to map UI whiskey types to API enum values
  const mapWhiskeyTypeToAPI = (whiskeyType: string): string => {
    const mapping: Record<string, string> = {
      'RyeBourbon': 'RyeWhiskey',
      'WheatBourbon': 'WheatWhiskey', 
      'StraightBourbon': 'FourGrainBourbon',
      'Rye': 'RyeWhiskey',
      'Bourbon': 'FourGrainBourbon',
      'Wheat': 'WheatWhiskey',
      'Corn': 'CornWhiskey',
      'Malt': 'MaltWhiskey'
    }
    
    // Return mapped value or original if no mapping exists
    return mapping[whiskeyType] || whiskeyType
  }

  // Handle recipe save - updated to match modal's expected signature
  const handleRecipeSave = useCallback(async (recipeId: string, formData: RecipeEditData) => {
    try {
      console.log('Saving recipe:', recipeId, formData)
      
      // Log whiskey type mapping
      const originalWhiskeyType = formData.details.whiskeyType
      const mappedWhiskeyType = mapWhiskeyTypeToAPI(originalWhiskeyType)
      console.log('🥃 Whiskey type mapping:', { original: originalWhiskeyType, mapped: mappedWhiskeyType })
      
      // Transform the edit data to UpdateMasterRecipeInput format for the API
      const wizardData = {
        Recipe: formData.details.Recipe,
        active: true,
        cooksPerFerm: formData.details.cooksPerFerm,
        customerCode: formData.details.customerCode,
        whiskeyType: mappedWhiskeyType,
        updatedBy: userEmail, // Use logged-in user's email from Entra ID
        mashBill: {
          corn: formData.details.mashBill.corn,
          rye: formData.details.mashBill.rye,
          wheat: formData.details.mashBill.wheat,
          maltedBarley: formData.details.mashBill.maltedBarley
        },
        ingredients: formData.bom.ingredients.map((ingredient, index) => {
          const ingredientData: Record<string, unknown> = {
            id: ingredient.id || `ingredient-${index}`,
            name: (ingredient.name && ingredient.name.trim()) || ingredient.itemCode || 'Unknown Item',
            itemCode: ingredient.itemCode || ingredient.name || 'UNKNOWN',
            category: ingredient.category || 'Grain',
            quantity: ingredient.quantity,
            unit: ingredient.unit || 'lbs',
            operation: ingredient.operation || 'Mashing01',
          }

          // Add formula configuration fields (only if set)
          if (ingredient.calculationMode && ingredient.calculationMode !== 'STATIC') {
            ingredientData['calculationMode'] = ingredient.calculationMode
          }
          if (ingredient.formulaType) {
            ingredientData['formulaType'] = ingredient.formulaType
          }
          if (ingredient.formulaMultiplier != null) {
            ingredientData['formulaMultiplier'] = ingredient.formulaMultiplier
          }
          if (ingredient.customExpression) {
            ingredientData['customExpression'] = ingredient.customExpression
          }
          if (ingredient.formulaLibraryId) {
            ingredientData['formulaLibraryId'] = ingredient.formulaLibraryId
          }
          if (ingredient.expressionVariables) {
            ingredientData['expressionVariables'] = ingredient.expressionVariables
          }
          if (ingredient.expressionValidated != null) {
            ingredientData['expressionValidated'] = ingredient.expressionValidated
          }

          return ingredientData
        }),
        parameters: formData.parameters.parameters.map(param => ({
          name: param.name,
          value: typeof param.value === 'number' ? param.value : 
                 typeof param.value === 'string' && param.value.trim() !== '' ? 
                 parseFloat(param.value) || 0 : 0,
          description: param.description || '',
          unit: param.unit || ''
        })),
        mashingSteps: formData.mashing.mashingSteps.map((step, index) => ({
          id: step.id || `step-${index}`, // Generate ID if not present
          additiveType: step.additiveType,
          holdType: step.holdType,
          included: step.included,
          index: step.index,
          notes: step.notes,
          stepType: step.stepType,
          heatTempSp: step.heatTempSp,
          coolTempSp: step.coolTempSp,
          timeDuration: step.timeDuration,
          waterBacksetSP: step.waterBacksetSP
        }))
      }

      console.log('Transformed wizard data:', JSON.stringify(wizardData, null, 2))

      // Prepare the GraphQL request
      const graphqlRequest = {
        query: UPDATE_MASTER_RECIPE_MUTATION,
        variables: {
          id: recipeId,
          input: wizardData
        }
      }

      console.log('🚀 Sending GraphQL mutation:')
      console.log('Query:', UPDATE_MASTER_RECIPE_MUTATION)
      console.log('Variables:', JSON.stringify(graphqlRequest.variables, null, 2))

      // Use GraphQL mutation
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(graphqlRequest)
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('HTTP Error:', response.status, errorText)
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      const result = await response.json()
      console.log('GraphQL response:', result)
      
      if (result.errors) {
        console.error('GraphQL errors:', result.errors)
        throw new Error(result.errors[0]?.message || 'Failed to save recipe')
      }

      console.log('Recipe saved successfully:', result.data.updateMasterRecipe)
      
      // Refresh the data to show updated recipe in the list
      await refetch()
      
      // Clear selection (modal will handle closing itself)
      setSelectedRecipe(null)
      
    } catch (error) {
      console.error('Error saving recipe:', error)
      throw error
    }
  }, [refetch, userEmail])

  // Memoize the transformed data to prevent unnecessary re-renders
  const transformedData = useMemo(() => {
    return selectedRecipe ? transformRecipeToEditData(selectedRecipe) : null
  }, [selectedRecipe, transformRecipeToEditData])

  // Group recipes by family
  const recipeFamilies = useMemo(() => {
    if (!recipes || recipes.length === 0) return []
    return groupRecipesByFamily(recipes)
  }, [recipes])

  // Fetch active/top revision for families where we don't have complete data
  // This ensures we show the active revision on top, not whatever revision happened to be in pagination
  useEffect(() => {
    const fetchActiveRevisions = async () => {
      const familiesToFetch = recipeFamilies.filter(family => {
        // Only fetch if we have fewer revisions than the total count
        // AND we haven't already fetched this family's active revision
        // AND the local revision might not be the active one
        const hasIncompleteData = family.revisionCount > family.revisions.length
        const notAlreadyFetched = !activeRevisions.has(family.familyId)
        const localMightBeWrong = !family.latestRevision.active // Local revision isn't active
        return hasIncompleteData && notAlreadyFetched && localMightBeWrong
      })

      if (familiesToFetch.length === 0) return

      // Fetch active revisions for incomplete families
      for (const family of familiesToFetch) {
        try {
          const result = await fetchFamilyRevisions({
            variables: { familyPattern: family.familyId + '-R' }
          })

          if (result.data?.recipes && result.data.recipes.length > 0) {
            // Sort: active first, then by revision descending
            const sortedRevisions = [...result.data.recipes].sort((a: Recipe, b: Recipe) => {
              if (a.active !== b.active) return a.active ? -1 : 1
              return (b.revision || 0) - (a.revision || 0)
            })

            // Store the top revision (active/latest)
            setActiveRevisions(prev => {
              const next = new Map(prev)
              next.set(family.familyId, sortedRevisions[0])
              return next
            })

            // Also store all revisions for when user expands
            setExpandedFamilyRevisions(prev => {
              const next = new Map(prev)
              next.set(family.familyId, sortedRevisions)
              return next
            })
          }
        } catch (err) {
          console.error('Error fetching active revision for family:', family.familyId, err)
        }
      }
    }

    fetchActiveRevisions()
  }, [recipeFamilies, activeRevisions, fetchFamilyRevisions])

  // Toggle family expansion and fetch all revisions if needed
  const toggleFamilyExpansion = useCallback(async (familyId: string, family: RecipeFamily<Recipe>) => {
    const isCurrentlyExpanded = expandedFamilies.has(familyId)

    if (isCurrentlyExpanded) {
      // Collapse - just remove from expanded set
      setExpandedFamilies(prev => {
        const next = new Set(prev)
        next.delete(familyId)
        return next
      })
    } else {
      // Expand - fetch all revisions if we don't have them all
      setExpandedFamilies(prev => {
        const next = new Set(prev)
        next.add(familyId)
        return next
      })

      // Check if we need to fetch more revisions
      const hasAllRevisions = family.revisions.length >= family.revisionCount
      if (!hasAllRevisions && !expandedFamilyRevisions.has(familyId)) {
        setLoadingFamilies(prev => new Set(prev).add(familyId))

        try {
          // Fetch all revisions for this family using familyId + "-R" pattern
          const result = await fetchFamilyRevisions({
            variables: { familyPattern: familyId + '-R' }
          })

          if (result.data?.recipes) {
            // Sort: active first, then by revision descending
            const sortedRevisions = [...result.data.recipes].sort((a: Recipe, b: Recipe) => {
              if (a.active !== b.active) return a.active ? -1 : 1
              return (b.revision || 0) - (a.revision || 0)
            })

            setExpandedFamilyRevisions(prev => {
              const next = new Map(prev)
              next.set(familyId, sortedRevisions)
              return next
            })
          }
        } catch (err) {
          console.error('Error fetching family revisions:', err)
          toast.error('Failed to load recipe revisions')
        } finally {
          setLoadingFamilies(prev => {
            const next = new Set(prev)
            next.delete(familyId)
            return next
          })
        }
      }
    }
  }, [expandedFamilies, expandedFamilyRevisions, fetchFamilyRevisions])

  return (
    <RouteGuard 
      config={{
        requiresAuth: true,
        requiredPermissions: [ManufacturingPermission.VIEW_RECIPES],
        redirectTo: '/'
      }}
    >
      <PageContainer>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Recipe Management</h1>
              <p className="text-muted-foreground">
                Manage whiskey production recipes and formulations
              </p>
            </div>
            <div className="flex gap-2">
              <RecipeGeneratorDialog
                trigger={
                  <Button variant="outline" className="gap-2" disabled>
                    <Sparkles className="h-4 w-4" />
                    Generate with AI (Coming Soon)
                  </Button>
                }
                onRecipeGenerated={(recipe) => {
                  // Refresh the recipes list after generating a new recipe
                  console.log('Generated recipe:', recipe);
                  refetch();
                }}
                customers={[
                  // You'll need to fetch customers from your API
                  // For now, using placeholder data
                  { id: '1', name: 'Premium Distillery' },
                  { id: '2', name: 'Craft Spirits Co.' },
                ]}
                currentUser="current-user-id" // Replace with actual current user
              />
              <Link href="/recipe-management/create">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Create New Recipe
                </Button>
              </Link>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <input
                  type="text"
                  placeholder="Search recipes..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-input bg-background text-foreground rounded-md focus:ring-2 focus:ring-ring focus:border-transparent"
                />
              </div>
            </div>
            <Button variant="outline">
              <Filter className="h-4 w-4 mr-2" />
              Filter
            </Button>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="ml-2">Loading recipes...</span>
            </div>
          )}

          {error && (
            <div className="text-center py-12">
              <p className="text-red-600">Error loading recipes: {error.message}</p>
              <Button 
                variant="outline" 
                onClick={() => window.location.reload()}
                className="mt-4"
              >
                Retry
              </Button>
            </div>
          )}

          {!loading && !error && (
            <>
              <div className="flex items-center justify-between mb-4">
                <PaginationInfo
                  currentPage={currentPage}
                  totalItems={totalCount}
                  itemsPerPage={pagination.take || 12}
                />
                <PageSizeSelector
                  pageSize={pagination.take || 12}
                  onPageSizeChange={updatePageSize}
                  options={[6, 12, 24, 48]}
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {recipeFamilies.map((family) => {
                  const isExpanded = expandedFamilies.has(family.familyId)
                  const isLoading = loadingFamilies.has(family.familyId)
                  const hasMultipleRevisions = family.revisionCount > 1

                  // Use fetched revisions if available, otherwise use local revisions
                  const fetchedRevisions = expandedFamilyRevisions.get(family.familyId)
                  const allRevisions = fetchedRevisions || family.revisions

                  // The top revision should be:
                  // 1. The fetched active revision (from activeRevisions map)
                  // 2. Or the first from fetched revisions
                  // 3. Or the local latest revision
                  const fetchedActiveRevision = activeRevisions.get(family.familyId)
                  const topRevision = fetchedActiveRevision || allRevisions[0] || family.latestRevision

                  // Other revisions are all except the top one
                  const otherRevisions = fetchedRevisions
                    ? fetchedRevisions.filter(r => r.id !== topRevision.id)
                    : allRevisions.slice(1)

                  const status = getRecipeStatusDisplay(topRevision)

                  return (
                    <div key={family.familyId} className="relative">
                      {/* Stacking effect for families with multiple revisions */}
                      {hasMultipleRevisions && !isExpanded && (
                        <>
                          <div className="absolute top-2 left-2 right-2 h-full bg-muted/50 rounded-lg border border-border" />
                          <div className="absolute top-1 left-1 right-1 h-full bg-muted/30 rounded-lg border border-border" />
                        </>
                      )}

                      {/* Main card (active/latest revision) */}
                      <Card
                        className={`relative hover:shadow-md transition-shadow ${hasMultipleRevisions ? 'cursor-pointer' : ''}`}
                        onClick={() => {
                          if (hasMultipleRevisions) {
                            toggleFamilyExpansion(family.familyId, family)
                          } else {
                            handleRecipeClick(topRevision)
                          }
                        }}
                      >
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <CardTitle className="text-lg">{formatRecipeDisplayName(topRevision)}</CardTitle>
                              <CardDescription>
                                {topRevision.Recipe} • {formatWhiskeyType(topRevision.whiskeyType)}
                              </CardDescription>
                            </div>
                            {hasMultipleRevisions && (
                              <div className="flex items-center gap-1 ml-2">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                                  {isLoading ? (
                                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  ) : (
                                    <Layers className="h-3 w-3 mr-1" />
                                  )}
                                  {family.revisionCount}
                                </span>
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                )}
                              </div>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent
                          className="pt-0"
                          onClick={(e) => {
                            if (!hasMultipleRevisions) return
                            e.stopPropagation()
                            handleRecipeClick(topRevision)
                          }}
                        >
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-sm text-muted-foreground">Customer:</span>
                              <span className="text-sm font-medium">
                                {topRevision.customer?.name || topRevision.customerCode || 'Unknown'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-sm text-muted-foreground">Status:</span>
                              <span className={`text-sm font-medium ${
                                status.color === 'green' ? 'text-green-600 dark:text-green-400' :
                                status.color === 'yellow' ? 'text-yellow-600 dark:text-yellow-400' :
                                status.color === 'red' ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'
                              }`}>
                                {status.label}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-sm text-muted-foreground">Modified:</span>
                              <span className="text-sm">
                                {new Date(topRevision.updatedAt).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Expanded revisions */}
                      {isExpanded && hasMultipleRevisions && (
                        <div className="mt-2 space-y-2 pl-4 border-l-2 border-primary/30">
                          {isLoading ? (
                            <div className="flex items-center justify-center py-4">
                              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                              <span className="ml-2 text-sm text-muted-foreground">Loading revisions...</span>
                            </div>
                          ) : otherRevisions.map((revision) => {
                            const revStatus = getRecipeStatusDisplay(revision)
                            return (
                              <Card
                                key={revision.id}
                                className="hover:shadow-md transition-shadow cursor-pointer bg-muted/50"
                                onClick={() => handleRecipeClick(revision)}
                              >
                                <CardContent className="p-3">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="font-medium text-sm">{revision.Recipe}</span>
                                    <span className={`text-xs ${
                                      revStatus.color === 'green' ? 'text-green-600 dark:text-green-400' :
                                      revStatus.color === 'yellow' ? 'text-yellow-600 dark:text-yellow-400' :
                                      revStatus.color === 'red' ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'
                                    }`}>
                                      {revStatus.label}
                                    </span>
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    Modified: {new Date(revision.updatedAt).toLocaleDateString()}
                                  </div>
                                </CardContent>
                              </Card>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
                {recipeFamilies.length === 0 && !loading && (
                  <div className="col-span-full text-center py-12">
                    <p className="text-muted-foreground">
                      {searchTerm ? 'No recipes found matching your search.' : 'No recipes found.'}
                    </p>
                  </div>
                )}
              </div>

              {/* Always show pagination for debugging */}
              <div className="mt-6 flex justify-center">
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={goToPage}
                />
              </div>
              
              {/* Debug info */}
              <div className="mt-4 text-sm text-gray-500 text-center">
                Debug: Total: {totalCount}, Page: {currentPage + 1}/{totalPages}, Items: {pagination.take}, Loaded: {recipes?.length || 0}, Families: {recipeFamilies?.length || 0}
              </div>
            </>
          )}
        </div>

        {/* Recipe Edit Modal */}
        {selectedRecipe && transformedData && (
          <RecipeEditModal
            isOpen={isEditModalOpen}
            onClose={handleModalClose}
            recipe={transformedData}
            onSave={(formData) => handleRecipeSave(selectedRecipe.id, formData)}
            onSelectRevision={handleSelectRevision}
          />
        )}
      </PageContainer>
    </RouteGuard>
  )
} 