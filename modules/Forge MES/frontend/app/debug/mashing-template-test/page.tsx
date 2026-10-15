'use client'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

import React, { useState } from 'react'
import { RecipeMashingStep, type RecipeMashingData } from '@/components/recipe/recipe-mashing-step'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'

export default function MashingTemplateTestPage() {
  const [mashingData, setMashingData] = useState<RecipeMashingData>({
    mashingSteps: []
  })
  const [isValid, setIsValid] = useState(false)
  const [includeMockBOM, setIncludeMockBOM] = useState(true)

  // Mock BOM data for testing validation
  const mockBOMData = {
    ingredients: [
      {
        id: 'ing_corn_001',
        itemCode: 'CORN-001',
        name: 'Corn',
        quantity: 1000,
        unit: 'lbs',
        category: 'grains' as const,
        itemGroup: 'RM-GRAIN',
        operation: 'Mashing01',
        createdAt: new Date()
      },
      {
        id: 'ing_wheat_001',
        itemCode: 'WHEAT-001',
        name: 'Wheat',
        quantity: 200,
        unit: 'lbs',
        category: 'grains' as const,
        itemGroup: 'RM-GRAIN',
        operation: 'Mashing01',
        createdAt: new Date()
      },
      {
        id: 'ing_water_001',
        itemCode: 'WATER-001',
        name: 'Process Water',
        quantity: 500,
        unit: 'gal',
        category: 'water' as const,
        itemGroup: 'RM-WATER',
        operation: 'Mashing01',
        createdAt: new Date()
      },
      {
        id: 'ing_enzyme_001',
        itemCode: 'ENZ-001',
        name: 'Alpha Amylase',
        quantity: 2,
        unit: 'oz',
        category: 'enzymes' as const,
        itemGroup: 'RM-ENZ',
        operation: 'Mashing01',
        createdAt: new Date()
      },
      {
        id: 'ing_rye_001',
        itemCode: 'RYE-001',
        name: 'Rye',
        quantity: 150,
        unit: 'lbs',
        category: 'grains' as const,
        itemGroup: 'RM-GRAIN',
        operation: 'Mashing01',
        createdAt: new Date()
      }
    ]
  }

  // Create wizard context with or without BOM data
  const allWizardData = includeMockBOM ? {
    details: {},
    bom: mockBOMData,
    parameters: {},
    mashing: mashingData
  } : {
    details: {},
    bom: { ingredients: [] },
    parameters: {},
    mashing: mashingData
  }

  const handleDataChange = (data: unknown) => {
    console.log('🔄 Mashing data updated:', data)
    setMashingData(data as RecipeMashingData)
  }

  const handleValidationChange = (valid: boolean) => {
    console.log('✅ Validation changed:', valid)
    setIsValid(valid)
  }

  const resetData = () => {
    setMashingData({ mashingSteps: [] })
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold">Mashing Protocol Template Test</h1>
          <p className="text-muted-foreground">
            Test the mashing protocol template selection functionality and enhanced BOM validation. 
            The validation now checks for missing recipeBom items on grain, liquid, and additive steps.
          </p>
        </div>

        <div className="flex gap-4 items-center">
          <Button variant="outline" onClick={resetData}>
            Reset Data
          </Button>
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="include-bom" 
              checked={includeMockBOM} 
              onCheckedChange={(checked) => setIncludeMockBOM(checked as boolean)}
            />
            <label htmlFor="include-bom" className="text-sm font-medium">
              Include Mock BOM Data (for testing validation)
            </label>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm">Valid:</span>
            <span className={`text-sm font-medium ${isValid ? 'text-green-600' : 'text-red-600'}`}>
              {isValid ? 'Yes' : 'No'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Mashing Protocol with Templates</CardTitle>
                <CardDescription>
                  Test template selection, manual creation, and BOM validation functionality.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RecipeMashingStep
                  data={mashingData}
                  onDataChange={handleDataChange}
                  onValidationChange={handleValidationChange}
                  allWizardData={allWizardData}
                  mode="create"
                />
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>Current Data</CardTitle>
                <CardDescription>
                  Current mashing protocol data structure and validation status.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="text-sm">
                    <strong>Steps Count:</strong> {mashingData.mashingSteps.length}
                  </div>
                  <div className="text-sm">
                    <strong>Valid:</strong> {isValid ? 'Yes' : 'No'}
                  </div>
                  <div className="text-sm">
                    <strong>Mock BOM:</strong> {includeMockBOM ? 'Enabled' : 'Disabled'}
                  </div>
                  {includeMockBOM && (
                    <div className="text-sm">
                      <strong>BOM Items:</strong> {mockBOMData.ingredients.length}
                      <ul className="list-disc list-inside ml-2 text-xs">
                        {mockBOMData.ingredients.map(ing => (
                          <li key={ing.id}>{ing.name} ({ing.itemCode})</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <details className="text-xs">
                    <summary className="cursor-pointer font-medium">Raw Data</summary>
                    <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto max-h-96">
                      {JSON.stringify(mashingData, null, 2)}
                    </pre>
                  </details>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
} 