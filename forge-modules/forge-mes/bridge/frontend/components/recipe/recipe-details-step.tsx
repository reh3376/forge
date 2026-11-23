'use client'

import React, { useCallback, useEffect, useState, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CustomerSearchableSelect } from '@/components/ui/searchable-select'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { AlertCircle, Search, Plus, Loader2, Lightbulb, Check, X } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useQuery } from '@apollo/client'
import { RECIPE_QUERIES } from '@/lib/api/graphql-queries'
import { useRecipeBasis } from '@/lib/hooks/use-recipe-basis'
import { useCustomers } from '@/lib/hooks/use-customers'
import { useAuth } from '@/lib/auth-context'
import { WizardStepProps } from './recipe-wizard'
import { detectWhiskeyType, getWhiskeyTypeLabel, getWhiskeyTypeDescription, WhiskeyType, type MashBill } from '@/lib/utils/whiskey-type-detection'
import { MashBillComposition, MashBillComponent, convertLegacyMashBillToComponents, convertComponentsToLegacyMashBill } from './mash-bill-composition'
import { useGrainCharacters } from '@/lib/hooks/use-grain-characters'
import { RevisionHistory, RevisionBadge } from './revision-history'

// Types for recipe details
export interface RecipeDetailsData {
  Recipe: string // Backend uses capital R
  active: boolean
  whiskeyType: string
  revision: string
  customerCode: string
  cooksPerFerm: number
  createdAt: string
  createdBy: string
  // New fields for mash bill
  mashBill: {
    corn: number
    rye: number
    wheat: number
    maltedBarley: number
  }
  baseRecipeId?: string // If creating from existing recipe
  id?: string // Recipe ID for edit mode
  baseRecipeName?: string // Base recipe name without revision suffix
}

// Mash bill validation
interface MashBillValidation {
  isValid: boolean
  total: number
  errors: string[]
}

// Existing recipe type
interface ExistingRecipe {
  id: string
  Recipe: string
  revision: number
  whiskeyType: string
  active: boolean
  createdAt: string
  createdBy: string
}

// Whiskey types from actual GraphQL schema
const WHISKEY_TYPES = [
  { value: 'FourGrainBourbon', label: 'Four Grain Bourbon' },
  { value: 'FourGrainWhiskey', label: 'Four Grain Whiskey' },
  { value: 'MaltWhiskey', label: 'Malt Whiskey' },
  { value: 'RyeBourbon', label: 'Rye Bourbon' },
  { value: 'RyeWhiskey', label: 'Rye Whiskey' },
  { value: 'WheatWhiskey', label: 'Wheat Whiskey' },
  { value: 'WheatedBourbon', label: 'Wheated Bourbon' }
]

export function RecipeDetailsStep({ data, onDataChange, onValidationChange, onWizardDataChange, mode = 'create', onSelectRevision }: WizardStepProps) {
  const typedData = data as Partial<RecipeDetailsData>
  
  // Get current user for createdBy field
  const { user } = useAuth()
  
  // Fetch customers from API
  const { customers, customersLoading, customersError } = useCustomers()

  // Fetch grain characters for mash bill composition
  const { grainCharacters } = useGrainCharacters()

  // Debug log to verify customers are loaded
  console.log('Customers loaded:', customers.length, 'customers')
  console.log('Customer data sample:', customers.slice(0, 2))

  const [formData, setFormData] = useState<RecipeDetailsData>({
    Recipe: '',
    active: true,
    whiskeyType: '',
    revision: '1',
    customerCode: '',
    cooksPerFerm: 3,
    createdAt: new Date().toISOString(),
    createdBy: user?.email || 'unknown-user', // Use logged-in user's email
    mashBill: {
      corn: 0,
      rye: 0,
      wheat: 0,
      maltedBarley: 0
    },
    ...(typedData.baseRecipeId !== undefined && { baseRecipeId: typedData.baseRecipeId }),
    ...typedData
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [mashBillValidation, setMashBillValidation] = useState<MashBillValidation>({
    isValid: false,
    total: 0,
    errors: []
  })
  const [showExistingRecipes, setShowExistingRecipes] = useState(false)
  const [selectedExistingRecipe, setSelectedExistingRecipe] = useState<string | null>(null)
  const [isManuallyEditedRecipeName, setIsManuallyEditedRecipeName] = useState(false)
  const [isManuallyEditedWhiskeyType, setIsManuallyEditedWhiskeyType] = useState(false)
  const [detectedWhiskeyType, setDetectedWhiskeyType] = useState<string | null>(null)
  const [showWhiskeyTypeDetection, setShowWhiskeyTypeDetection] = useState(false)
  const isUpdatingRef = useRef(false)
  const lastValidationResultRef = useRef<boolean | null>(null)

  // State for new mash bill components
  const [mashBillComponents, setMashBillComponents] = useState<MashBillComponent[]>([])

  // Initialize mash bill components when grain characters are loaded
  useEffect(() => {
    if (grainCharacters.length > 0 && mashBillComponents.length === 0) {
      // Initialize from existing mashBill if provided
      const mashBill = typedData?.mashBill || formData.mashBill
      const hasValues = mashBill.corn > 0 || mashBill.rye > 0 || mashBill.wheat > 0 || mashBill.maltedBarley > 0
      if (hasValues) {
        const components = convertLegacyMashBillToComponents(mashBill, grainCharacters)
        setMashBillComponents(components)
      }
    }
  }, [grainCharacters, typedData?.mashBill, formData.mashBill, mashBillComponents.length])

  // Recipe basis hook for loading complete recipe data
  const { loadRecipeAsBasis, loading: loadingBasis } = useRecipeBasis()

  // Generate mash bill pattern
  const generateMashBillPattern = useCallback((mashBill: RecipeDetailsData['mashBill']) => {
    // 🔧 FIX: Format without leading zeros for non-zero values
    // Backend expects XX-XX-XX-XX format where zeros are only for actual zero values
    const formatComponent = (num: number) => {
      if (num === 0) return "00";
      return num < 10 ? `0${num}` : `${num}`;
    };
    
    const pattern = `${formatComponent(mashBill.corn)}-${formatComponent(mashBill.rye)}-${formatComponent(mashBill.wheat)}-${formatComponent(mashBill.maltedBarley)}`;
    
    console.log(`🌾 Generated mash bill pattern: ${pattern} (corn: ${mashBill.corn}, rye: ${mashBill.rye}, wheat: ${mashBill.wheat}, barley: ${mashBill.maltedBarley})`);
    
    return pattern;
  }, [])

  // Generate recipe name based on customer and mash bill
  const generateRecipeName = useCallback((customerCode: string, mashBill: RecipeDetailsData['mashBill'], revision: string) => {
    if (!customerCode) return ''
    const pattern = generateMashBillPattern(mashBill)
    return `${customerCode}-${pattern}-v${revision.padStart(2, '0')}`
  }, [generateMashBillPattern])

  // Get next revision number
  const getNextRevision = useCallback((existingRecipes: ExistingRecipe[]) => {
    if (!existingRecipes || existingRecipes.length === 0) return 1
    const maxRevision = Math.max(...existingRecipes.map(r => r.revision || 1))
    return maxRevision + 1
  }, [])

  // Query for existing recipes with same customer and mash bill
  const mashBillPattern = generateMashBillPattern(formData.mashBill)
  const { data: existingRecipesData } = useQuery(RECIPE_QUERIES.GET_RECIPES_BY_CUSTOMER_MASHBILL, {
    variables: {
      customerCode: formData.customerCode,
      mashBillPattern: mashBillPattern
    },
    skip: !formData.customerCode || !mashBillValidation.isValid
  })

  // Validate mash bill
  const validateMashBill = useCallback((mashBill: RecipeDetailsData['mashBill']) => {
    const total = mashBill.corn + mashBill.rye + mashBill.wheat + mashBill.maltedBarley
    const errors: string[] = []
    
    if (total !== 100) {
      errors.push(`Mash bill must sum to 100% (currently ${total}%)`)
    }
    
    if (mashBill.corn < 0 || mashBill.rye < 0 || mashBill.wheat < 0 || mashBill.maltedBarley < 0) {
      errors.push('All percentages must be non-negative')
    }

    const validation = {
      isValid: total === 100 && errors.length === 0,
      total,
      errors
    }
    
    setMashBillValidation(validation)
    return validation
  }, [])

  // Sync with incoming data from wizard
  useEffect(() => {
    if (typedData && Object.keys(typedData).length > 0) {
      console.log('RecipeDetailsStep: Syncing with incoming wizard data:', typedData)
      console.log('RecipeDetailsStep: Current formData before sync:', formData)
      console.log('RecipeDetailsStep: Incoming mashBill:', typedData.mashBill)
      setFormData(prev => {
        const newData = { ...prev, ...typedData }
        console.log('RecipeDetailsStep: New formData after sync:', newData)
        console.log('RecipeDetailsStep: New mashBill after sync:', newData.mashBill)
        return newData
      })
      // Don't reset manual edit flag here - let user maintain their editing state
    }
  }, [typedData])

  // Show existing recipes when customer and valid mash bill are selected
  useEffect(() => {
    if (mode === 'create' && formData.customerCode && mashBillValidation.isValid && existingRecipesData?.recipes?.length > 0) {
      setShowExistingRecipes(true)
    } else {
      setShowExistingRecipes(false)
      setSelectedExistingRecipe(null)
    }
  }, [mode, formData.customerCode, mashBillValidation.isValid, existingRecipesData])

  // Validation function - now pure, doesn't call onValidationChange directly
  const validateForm = useCallback((currentData: RecipeDetailsData) => {
    console.log('RecipeDetailsStep: validateForm called with:', currentData)
    const newErrors: Record<string, string> = {}

    if (!currentData.Recipe?.trim()) {
      newErrors['Recipe'] = 'Recipe name is required'
    }

    if (!currentData.whiskeyType) {
      newErrors['whiskeyType'] = 'Whiskey type is required'
    }

    if (!currentData.customerCode) {
      newErrors['customerCode'] = 'Customer selection is required'
    }

    if (currentData.cooksPerFerm < 1 || currentData.cooksPerFerm > 10) {
      newErrors['cooksPerFerm'] = 'Cooks per fermenter must be between 1 and 10'
    }

    // Validate mash bill
    const mashBillValidation = validateMashBill(currentData.mashBill)
    if (!mashBillValidation.isValid) {
      newErrors['mashBill'] = mashBillValidation.errors.join(', ')
    }

    console.log('RecipeDetailsStep: validation errors:', newErrors)
    console.log('RecipeDetailsStep: mashBillValidation:', mashBillValidation)
    
    setErrors(newErrors)
    const isValid = Object.keys(newErrors).length === 0
    
    console.log('RecipeDetailsStep: form isValid:', isValid)
    console.log('RecipeDetailsStep: calling onValidationChange with:', isValid)
    
    // Only call onValidationChange if the validation result actually changed
    if (lastValidationResultRef.current !== isValid) {
      lastValidationResultRef.current = isValid
      onValidationChange(isValid)
    }
    
    return isValid
  }, [onValidationChange, validateMashBill])

  // Update form data and propagate changes
  const updateFormData = useCallback((updates: Partial<RecipeDetailsData>) => {
    if (isUpdatingRef.current) return // Prevent recursive updates
    
    setFormData(prev => {
      // Check if data actually changed before updating
      const hasChanged = Object.keys(updates).some(key => {
        const prevValue = prev[key as keyof RecipeDetailsData]
        const newValue = updates[key as keyof RecipeDetailsData]
        return JSON.stringify(prevValue) !== JSON.stringify(newValue)
      })
      
      if (!hasChanged) {
        return prev // No change, return previous state
      }
      
      const newData = { ...prev, ...updates }
      
      // Auto-generate recipe name if customer or mash bill changed AND user hasn't manually edited it
      if ((updates.customerCode || updates.mashBill) && !isManuallyEditedRecipeName) {
        const nextRevision = getNextRevision(existingRecipesData?.recipes || [])
        newData.Recipe = generateRecipeName(newData.customerCode, newData.mashBill, nextRevision.toString())
        newData.revision = nextRevision.toString()
      }
      
      // Prevent recursive calls
      isUpdatingRef.current = true
      
      // Validate the new data and update parent
      validateForm(newData)
      onDataChange(newData)
      
      isUpdatingRef.current = false
      
      return newData
    })
  }, [onDataChange, validateForm, existingRecipesData, generateRecipeName, getNextRevision, isManuallyEditedRecipeName])

  // Handle mash bill input changes
  const updateMashBillComponent = useCallback((component: keyof RecipeDetailsData['mashBill'], value: number) => {
    const newMashBill = { ...formData.mashBill, [component]: Math.max(0, Math.min(100, value)) }
    
    // Auto-detect whiskey type if mash bill is valid and user hasn't manually edited whiskey type
    const mashBillForDetection: MashBill = newMashBill
    const total = newMashBill.corn + newMashBill.rye + newMashBill.wheat + newMashBill.maltedBarley
    
    if (total === 100 && !isManuallyEditedWhiskeyType) {
      const detected = detectWhiskeyType(mashBillForDetection)
      if (detected) {
        setDetectedWhiskeyType(detected)
        setShowWhiskeyTypeDetection(true)
        // Auto-apply the detected type
        updateFormData({ 
          mashBill: newMashBill,
          whiskeyType: detected
        })
        return
      }
    }
    
    // If no detection or user has manually edited, just update mash bill
    if (total === 100) {
      setDetectedWhiskeyType(null)
      setShowWhiskeyTypeDetection(false)
    }
    
    updateFormData({ mashBill: newMashBill })
  }, [formData.mashBill, updateFormData, isManuallyEditedWhiskeyType])

  // Handle new mash bill components changes (from MashBillComposition)
  const handleMashBillComponentsChange = useCallback((components: MashBillComponent[]) => {
    setMashBillComponents(components)

    // Convert to legacy format for backward compatibility
    const legacyMashBill = convertComponentsToLegacyMashBill(components)

    // Calculate total for auto-detection
    const total = legacyMashBill.corn + legacyMashBill.rye + legacyMashBill.wheat + legacyMashBill.maltedBarley

    // Auto-detect whiskey type if mash bill is valid and user hasn't manually edited whiskey type
    if (total === 100 && !isManuallyEditedWhiskeyType) {
      const detected = detectWhiskeyType(legacyMashBill)
      if (detected) {
        setDetectedWhiskeyType(detected)
        setShowWhiskeyTypeDetection(true)
        // Auto-apply the detected type
        updateFormData({
          mashBill: legacyMashBill,
          whiskeyType: detected
        })
        return
      }
    }

    // If no detection or user has manually edited, just update mash bill
    if (total === 100) {
      setDetectedWhiskeyType(null)
      setShowWhiskeyTypeDetection(false)
    }

    updateFormData({ mashBill: legacyMashBill })
  }, [updateFormData, isManuallyEditedWhiskeyType])

  // Handle manual whiskey type selection
  const handleWhiskeyTypeChange = useCallback((value: string) => {
    setIsManuallyEditedWhiskeyType(true)
    setShowWhiskeyTypeDetection(false)
    updateFormData({ whiskeyType: value })
  }, [updateFormData])

  // Handle accepting detected whiskey type
  const handleAcceptDetection = useCallback(() => {
    if (detectedWhiskeyType) {
      setShowWhiskeyTypeDetection(false)
      updateFormData({ whiskeyType: detectedWhiskeyType })
    }
  }, [detectedWhiskeyType, updateFormData])

  // Handle rejecting detected whiskey type
  const handleRejectDetection = useCallback(() => {
    setIsManuallyEditedWhiskeyType(true)
    setShowWhiskeyTypeDetection(false)
    setDetectedWhiskeyType(null)
  }, [])

  // Handle existing recipe selection
  const handleExistingRecipeSelect = useCallback((recipeId: string) => {
    setSelectedExistingRecipe(recipeId)
    const selectedRecipe = existingRecipesData?.recipes?.find((r: ExistingRecipe) => r.id === recipeId)
    if (selectedRecipe) {
      const nextRevision = getNextRevision(existingRecipesData?.recipes || [])
      updateFormData({
        baseRecipeId: recipeId,
        whiskeyType: selectedRecipe.whiskeyType,
        Recipe: generateRecipeName(formData.customerCode, formData.mashBill, nextRevision.toString()),
        revision: nextRevision.toString()
      })
    }
  }, [existingRecipesData, formData.customerCode, formData.mashBill, generateRecipeName, getNextRevision, updateFormData])

  // Handle creating new recipe
  const handleCreateNew = useCallback(() => {
    setSelectedExistingRecipe(null)
    setIsManuallyEditedRecipeName(false)
    const nextRevision = getNextRevision(existingRecipesData?.recipes || [])
    const updates: Partial<RecipeDetailsData> = {
      Recipe: generateRecipeName(formData.customerCode, formData.mashBill, nextRevision.toString()),
      revision: nextRevision.toString()
    }
    // Only include baseRecipeId if we want to explicitly set it
    // For new recipes, we simply omit it rather than setting to undefined
    updateFormData(updates)
  }, [existingRecipesData, formData.customerCode, formData.mashBill, generateRecipeName, getNextRevision, updateFormData])

  // Handle using selected recipe as basis
  const handleUseAsBasis = useCallback(async () => {
    if (!selectedExistingRecipe || !onWizardDataChange) return

    console.log('=== USE RECIPE AS BASIS START ===')
    console.log('Starting to load recipe as basis. Recipe ID:', selectedExistingRecipe)
    
    const nextRevision = getNextRevision(existingRecipesData?.recipes || [])
    console.log('Next revision:', nextRevision)
    
    const basisData = await loadRecipeAsBasis(selectedExistingRecipe, nextRevision.toString())
    console.log('Loaded basis data:', basisData)
    
    if (basisData) {
      // Reset manual edit flag when loading basis recipe
      setIsManuallyEditedRecipeName(false)
      
      // Update all wizard steps with the basis recipe data
      const allWizardData = {
        details: basisData.details,
        bom: basisData.bom,
        parameters: basisData.parameters,
        mashing: basisData.mashing
      }
      
      console.log('Updating wizard with data:', allWizardData)
      console.log('Details data structure:', basisData.details)
      
      // Update the wizard with all the data
      onWizardDataChange(allWizardData)
      
      // Update local form data to reflect the changes
      console.log('Updating local formData with details:', basisData.details)
      setFormData(basisData.details)
      
      console.log('=== USE RECIPE AS BASIS COMPLETE ===')
    }
  }, [selectedExistingRecipe, onWizardDataChange, existingRecipesData, getNextRevision, loadRecipeAsBasis])

  // Initial validation effect
  useEffect(() => {
    if (!isUpdatingRef.current) {
      // Use setTimeout to ensure this runs after the render cycle
      const timeoutId = setTimeout(() => {
        validateForm(formData)
      }, 0)
      
      return () => clearTimeout(timeoutId)
    }
  }, [formData, validateForm])

  // Only set createdBy for NEW recipes (not edits)
  // In edit mode, preserve the original creator from the recipe data
  useEffect(() => {
    const isNewRecipe = !typedData?.createdBy || typedData.createdBy === 'Current User' || typedData.createdBy === 'unknown-user'
    if (user?.email && isNewRecipe && formData.createdBy !== user.email) {
      updateFormData({ createdBy: user.email })
    }
  }, [user?.email, typedData?.createdBy, formData.createdBy, updateFormData])


  const existingRecipes = existingRecipesData?.recipes || []

  return (
    <div className="space-y-6">
      {/* Customer and Mash Bill Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Recipe Foundation</CardTitle>
          <CardDescription>
            {mode === 'edit'
              ? 'Customer and mash bill are fixed attributes of a recipe and remain the same across all revisions. To use a different mash bill, create a new recipe.'
              : 'Select customer and define mash bill to check for existing recipes or create new'
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Customer Selection */}
          <div>
            <Label htmlFor="customerCode">Customer *</Label>
            <CustomerSearchableSelect
              customers={customers}
              value={formData.customerCode}
              onValueChange={(value) => updateFormData({ customerCode: value })}
              placeholder={customersLoading ? "Loading customers..." : "Select customer"}
              className={errors['customerCode'] ? 'border-red-500' : ''}
              disabled={customersLoading || mode === 'edit'}
              loading={customersLoading}
            />
            {errors['customerCode'] && (
              <p className="text-sm text-red-500 mt-1">{errors['customerCode']}</p>
            )}
            {customersError && (
              <p className="text-sm text-red-500 mt-1">Failed to load customers. Please refresh the page.</p>
            )}
            {mode === 'edit' && (
              <p className="text-xs text-muted-foreground mt-1">Customer cannot be changed in edit mode</p>
            )}
          </div>

          {/* Mash Bill Input - New Dynamic Component */}
          <div>
            <MashBillComposition
              components={mashBillComponents}
              onChange={handleMashBillComponentsChange}
              disabled={mode === 'edit'}
            />
            {mode === 'edit' && (
              <p className="text-xs text-muted-foreground mt-1">Mash bill cannot be changed in edit mode</p>
            )}

            {/* Auto-detection indicator */}
            {mashBillValidation.total === 100 && !isManuallyEditedWhiskeyType && (
              <div className="mt-2">
                <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                  Whiskey type auto-detection enabled
                </span>
              </div>
            )}

            {mashBillValidation.errors.length > 0 && (
              <Alert className="mt-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {mashBillValidation.errors.join(', ')}
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Existing Recipes Section */}
      {mode === 'create' && showExistingRecipes && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Existing Recipes Found
            </CardTitle>
            <CardDescription>
              Found {existingRecipes.length} existing recipe(s) for {formData.customerCode} with mash bill {mashBillPattern}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {existingRecipes.map((recipe: ExistingRecipe) => (
              <div
                key={recipe.id}
                className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                  selectedExistingRecipe === recipe.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
                onClick={() => handleExistingRecipeSelect(recipe.id)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">{recipe.Recipe}</h4>
                    <p className="text-sm text-muted-foreground">
                      Revision {recipe.revision} • {recipe.whiskeyType} • Created by {recipe.createdBy}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={recipe.active ? 'default' : 'secondary'}>
                      {recipe.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
            
            <Separator />
            
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleCreateNew}
                className="flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Create New Recipe
              </Button>
              {selectedExistingRecipe && (
                <Button 
                  variant="default"
                  onClick={handleUseAsBasis}
                  disabled={loadingBasis}
                  className="flex items-center gap-2"
                >
                  {loadingBasis ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  {loadingBasis ? 'Loading...' : 'Use Selected as Base (New Revision)'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recipe Details */}
      <Card>
        <CardHeader>
          <CardTitle>Recipe Details</CardTitle>
          <CardDescription>
            Configure the specific details for this recipe
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Recipe Name */}
            <div className="md:col-span-2">
              <Label htmlFor="Recipe">Recipe Name *</Label>
              <Input
                id="Recipe"
                value={formData.Recipe}
                onChange={(e) => {
                  setIsManuallyEditedRecipeName(true)
                  updateFormData({ Recipe: e.target.value })
                }}
                placeholder="Auto-generated based on customer and mash bill"
                className={errors['Recipe'] ? 'border-red-500' : ''}
              />
              {errors['Recipe'] && (
                <p className="text-sm text-red-500 mt-1">{errors['Recipe']}</p>
              )}
              <p className="text-sm text-muted-foreground mt-1">
                Format: {formData.customerCode || 'XXX'}-{mashBillPattern}-R{formData.revision.padStart(2, '0')}
              </p>
            </div>

            {/* Active Status */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="active"
                checked={formData.active}
                onCheckedChange={(checked) => updateFormData({ active: checked as boolean })}
              />
              <Label htmlFor="active">Active Recipe</Label>
            </div>

            {/* Revision */}
            <div>
              <Label htmlFor="revision">Revision</Label>
              <Input
                id="revision"
                value={formData.revision}
                onChange={(e) => updateFormData({ revision: e.target.value })}
                placeholder="1"
                disabled
              />
              <p className="text-sm text-muted-foreground mt-1">
                Auto-populated based on existing recipes
              </p>
            </div>

            {/* Whiskey Type */}
            <div>
              <Label htmlFor="whiskeyType">Whiskey Type *</Label>
              <Select
                value={formData.whiskeyType}
                onValueChange={handleWhiskeyTypeChange}
              >
                <SelectTrigger className={errors['whiskeyType'] ? 'border-red-500' : ''}>
                  <SelectValue placeholder="Select whiskey type" />
                </SelectTrigger>
                <SelectContent>
                  {WHISKEY_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors['whiskeyType'] && (
                <p className="text-sm text-red-500 mt-1">{errors['whiskeyType']}</p>
              )}
              
              {/* Auto-detection feedback */}
              {showWhiskeyTypeDetection && detectedWhiskeyType && (
                <Alert className="mt-2 border-blue-200 bg-blue-50">
                  <Lightbulb className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="flex items-center justify-between">
                    <div>
                      <span className="text-blue-800">
                        Auto-detected: <strong>{getWhiskeyTypeLabel(detectedWhiskeyType as WhiskeyType)}</strong>
                      </span>
                      <p className="text-xs text-blue-600 mt-1">
                        {getWhiskeyTypeDescription(detectedWhiskeyType as WhiskeyType)}
                      </p>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleAcceptDetection}
                        className="h-7 px-2 text-xs border-green-300 text-green-700 hover:bg-green-50"
                      >
                        <Check className="h-3 w-3 mr-1" />
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleRejectDetection}
                        className="h-7 px-2 text-xs border-red-300 text-red-700 hover:bg-red-50"
                      >
                        <X className="h-3 w-3 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {/* Cooks Per Fermenter */}
            <div>
              <Label htmlFor="cooksPerFerm">Cooks Per Fermenter *</Label>
              <Input
                id="cooksPerFerm"
                type="number"
                min="1"
                max="10"
                value={formData.cooksPerFerm}
                onChange={(e) => updateFormData({ cooksPerFerm: parseInt(e.target.value) || 1 })}
                className={errors['cooksPerFerm'] ? 'border-red-500' : ''}
              />
              {errors['cooksPerFerm'] && (
                <p className="text-sm text-red-500 mt-1">{errors['cooksPerFerm']}</p>
              )}
              <p className="text-sm text-muted-foreground mt-1">
                Number of cook cycles per fermenter (1-10)
              </p>
            </div>
          </div>

          {/* Created By and Date */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t">
            <div>
              <Label htmlFor="createdBy">Created By</Label>
              <Input
                id="createdBy"
                value={formData.createdBy}
                readOnly
                className="bg-muted"
                placeholder="Current User"
              />
              <p className="text-sm text-muted-foreground mt-1">
                Automatically set to the logged-in user
              </p>
            </div>

            <div>
              <Label htmlFor="createdAt">Created Date</Label>
              <Input
                id="createdAt"
                type="datetime-local"
                value={formData.createdAt.slice(0, 16)} // Format for datetime-local input
                onChange={(e) => updateFormData({ createdAt: new Date(e.target.value).toISOString() })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Revision History - Only shown in edit mode */}
      {mode === 'edit' && formData.id && (
        <RevisionHistory
          recipeId={formData.id}
          currentRevision={parseInt(formData.revision) || 1}
          onSelectRevision={onSelectRevision}
        />
      )}
    </div>
  )
} 