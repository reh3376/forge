'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Calculator, RefreshCw, RotateCcw, Lightbulb } from 'lucide-react'
import { detectWhiskeyType, getWhiskeyTypeLabel, getWhiskeyTypeDescription, parseMashBillString, WhiskeyType } from '@/lib/utils/whiskey-type-detection'

// Types for enzyme configurations
interface EnzymeConfiguration {
  id: string
  name: string
  category: 'LIQUIFACTION' | 'SACCHARIFICATION' | 'VISCOSITY'
  dosePerMetricTon: number
  instructions: string
  isActive: boolean
}

// Types for recipes
interface Recipe {
  id: string
  name: string
  mashBill?: string
}

// Types for calculation result
interface EnzymeCalculation {
  enzymeId: string
  enzymeName: string
  category: 'LIQUIFACTION' | 'SACCHARIFICATION' | 'VISCOSITY'
  doseLbs: number
  dosePerMetricTon: number
  instructions: string
  isActive: boolean
}

interface SimplifiedCalculationResult {
  calculationId: string
  totalGrainLoadLbs: number
  mashBill?: string
  recipeId?: string
  recipeName?: string
  calculations: EnzymeCalculation[]
  calculatedAt: string
  calculatedBy: string
}

interface SimplifiedEnzymeCalculatorFormProps {
  onCalculationComplete: (result: SimplifiedCalculationResult) => void
}

export function SimplifiedEnzymeCalculatorForm({ onCalculationComplete }: SimplifiedEnzymeCalculatorFormProps) {
  // Form state
  const [grainLoad, setGrainLoad] = useState<number>(5000)
  const [selectedRecipe, setSelectedRecipe] = useState<string>('')
  const [customMashBill, setCustomMashBill] = useState<string>('')
  const [selectedEnzymes, setSelectedEnzymes] = useState<{
    LIQUIFACTION?: string
    SACCHARIFICATION?: string
    VISCOSITY?: string
  }>({})
  
  // Data state
  const [enzymeConfigurations, setEnzymeConfigurations] = useState<EnzymeConfiguration[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isCalculating, setIsCalculating] = useState(false)
  const [error, setError] = useState<string>('')
  const [detectedWhiskeyType, setDetectedWhiskeyType] = useState<string | null>(null)

  // Load enzyme configurations for dosing
  const loadEnzymeConfigurations = async () => {
    try {
      setIsLoading(true)
      setError('')
      const response = await fetch('/api/enzyme-configurations/for-dosing')
      if (!response.ok) {
        throw new Error('Failed to load enzyme configurations')
      }
      const data = await response.json()
      setEnzymeConfigurations(data.configurations || [])
    } catch (error) {
      console.error('Error loading enzyme configurations:', error)
      setError('Failed to load enzyme configurations. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // Load recipes
  const loadRecipes = async () => {
    try {
      const response = await fetch('/api/recipes')
      if (!response.ok) {
        throw new Error('Failed to load recipes')
      }
      const data = await response.json()
      setRecipes(data.recipes || [])
    } catch (error) {
      console.error('Error loading recipes:', error)
      setError('Failed to load recipes. Please try again.')
    }
  }

  // Load data on component mount
  useEffect(() => {
    loadEnzymeConfigurations()
    loadRecipes()
  }, [])

  // Handle recipe selection
  const handleRecipeChange = (recipeId: string) => {
    setSelectedRecipe(recipeId)
    const recipe = recipes.find(r => r.id === recipeId)
    if (recipe?.mashBill) {
      setCustomMashBill(recipe.mashBill)
      // Detect whiskey type from recipe mash bill
      handleMashBillDetection(recipe.mashBill)
    }
  }

  // Handle custom mash bill changes and detect whiskey type
  const handleMashBillChange = (value: string) => {
    setCustomMashBill(value)
    handleMashBillDetection(value)
  }

  // Detect whiskey type from mash bill string
  const handleMashBillDetection = (mashBillString: string) => {
    if (!mashBillString.trim()) {
      setDetectedWhiskeyType(null)
      return
    }

    const mashBill = parseMashBillString(mashBillString)
    if (mashBill) {
      const detected = detectWhiskeyType(mashBill)
      setDetectedWhiskeyType(detected)
    } else {
      setDetectedWhiskeyType(null)
    }
  }

  // Handle enzyme selection for a category
  const handleEnzymeSelection = (category: 'LIQUIFACTION' | 'SACCHARIFICATION' | 'VISCOSITY', enzymeId: string) => {
    setSelectedEnzymes(prev => ({
      ...prev,
      [category]: enzymeId
    }))
  }

  // Calculate enzyme dosing
  const handleCalculate = async () => {
    // Validation
    if (grainLoad < 1000 || grainLoad > 50000) {
      setError('Grain load must be between 1,000 and 50,000 lbs.')
      return
    }

    const selectedEnzymeIds = Object.values(selectedEnzymes).filter(Boolean)
    if (selectedEnzymeIds.length === 0) {
      setError('Please select at least one enzyme to calculate dosing.')
      return
    }

    try {
      setIsCalculating(true)
      setError('')
      
      const requestBody = {
        totalGrainLoadLbs: grainLoad,
        enzymeSelections: Object.entries(selectedEnzymes)
          .filter(([, enzymeId]) => enzymeId)
          .map(([category, enzymeId]) => ({
            category,
            enzymeId
          })),
        ...(selectedRecipe && { recipeId: selectedRecipe }),
        ...(customMashBill && { mashBill: customMashBill })
      }

      console.log('🧮 Calculate request body:', requestBody)
      console.log('🧮 Selected enzymes:', selectedEnzymes)
      console.log('🧮 Enzyme selections:', requestBody.enzymeSelections)

      const response = await fetch('/api/enzyme-configurations/calculate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to calculate enzyme dosing')
      }

      const result = await response.json()
      onCalculationComplete(result)
      
    } catch (error) {
      console.error('Error calculating enzyme dosing:', error)
      setError(error instanceof Error ? error.message : 'Failed to calculate enzyme dosing. Please try again.')
    } finally {
      setIsCalculating(false)
    }
  }

  // Reset form
  const handleReset = () => {
    setGrainLoad(5000)
    setSelectedRecipe('')
    setCustomMashBill('')
    setSelectedEnzymes({})
    setError('')
  }

  // Group enzymes by category
  const enzymesByCategory = enzymeConfigurations.reduce((acc, enzyme) => {
    if (!acc[enzyme.category]) {
      acc[enzyme.category] = []
    }
    acc[enzyme.category]?.push(enzyme)
    return acc
  }, {} as Record<string, EnzymeConfiguration[]>)

  return (
    <div className="space-y-6">
      {/* Error Display */}
      {error && (
        <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
          {error}
        </div>
      )}

      {/* Recipe Selection */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="recipe-select" className="text-sm font-medium">
            Recipe Selection (Optional)
          </Label>
          <Button
            variant="outline"
            size="sm"
            onClick={loadRecipes}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
        <Select value={selectedRecipe} onValueChange={handleRecipeChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select a recipe to auto-populate fields" />
          </SelectTrigger>
          <SelectContent>
            {recipes.map((recipe) => (
              <SelectItem key={recipe.id} value={recipe.id}>
                {recipe.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {/* Enzyme Selection */}
      <div className="space-y-4">
        <Label className="text-sm font-medium">Enzyme Selection</Label>
        <p className="text-sm text-muted-foreground">
          Select one enzyme for each category. Only active enzymes are shown.
        </p>
        
        {(['LIQUIFACTION', 'SACCHARIFICATION', 'VISCOSITY'] as const).map((category) => (
          <Card key={category} className="p-4">
            <div className="space-y-3">
              <Label className="text-sm font-medium capitalize">
                {category.toLowerCase()} Enzyme
              </Label>
              <Select 
                value={selectedEnzymes[category] || ''} 
                onValueChange={(value) => handleEnzymeSelection(category, value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={`Select ${category.toLowerCase()} enzyme`} />
                </SelectTrigger>
                <SelectContent>
                  {(enzymesByCategory[category] || []).map((enzyme) => (
                    <SelectItem key={enzyme.id} value={enzyme.id}>
                      <div className="flex flex-col">
                        <span>{enzyme.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {enzyme.dosePerMetricTon} per metric ton
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Card>
        ))}
      </div>

      <Separator />

      {/* Grain Load Input */}
      <div className="space-y-3">
        <Label htmlFor="grain-load" className="text-sm font-medium">
          Total Grain Load (lbs)
        </Label>
        <Input
          id="grain-load"
          type="number"
          min="1000"
          max="50000"
          step="100"
          value={grainLoad}
          onChange={(e) => setGrainLoad(Number(e.target.value))}
          placeholder="Enter total grain weight"
        />
        <p className="text-sm text-muted-foreground">
          Enter total grain weight in pounds (1,000 - 50,000 lbs)
        </p>
      </div>

      {/* Custom Mash Bill */}
      <div className="space-y-3">
        <Label htmlFor="mash-bill" className="text-sm font-medium">
          Custom Mash Bill (Optional)
        </Label>
        <Input
          id="mash-bill"
          value={customMashBill}
          onChange={(e) => handleMashBillChange(e.target.value)}
          placeholder="e.g., 70-21-00-09 (corn-rye-wheat-malt)"
        />
        <p className="text-sm text-muted-foreground">
          Enter percentages as XX-XX-XX-XX format or leave blank
        </p>
      </div>

      {/* Whiskey Type Detection */}
      {detectedWhiskeyType && (
        <Alert className="border-blue-200 bg-blue-50">
          <Lightbulb className="h-4 w-4 text-blue-600" />
          <AlertDescription>
            <div className="text-blue-800">
              <span className="font-medium">Detected Whiskey Type: {getWhiskeyTypeLabel(detectedWhiskeyType as WhiskeyType)}</span>
              <p className="text-xs text-blue-600 mt-1">
                {getWhiskeyTypeDescription(detectedWhiskeyType as WhiskeyType)}
              </p>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 pt-4">
        <Button 
          onClick={handleCalculate} 
          disabled={isCalculating || isLoading}
          className="flex-1"
        >
          <Calculator className="h-4 w-4 mr-2" />
          {isCalculating ? 'Calculating...' : 'Calculate Dosing'}
        </Button>
        <Button 
          variant="outline" 
          onClick={handleReset}
          disabled={isCalculating}
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset
        </Button>
      </div>
    </div>
  )
} 