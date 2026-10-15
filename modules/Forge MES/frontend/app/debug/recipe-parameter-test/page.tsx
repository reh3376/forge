'use client'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageContainer } from '@/components/ui/layout'
import { recipeParameterClient } from '@/lib/api/recipe-parameter-client'

export default function RecipeParameterTestPage() {
  const [result, setResult] = useState<string>('')
  const [loading, setLoading] = useState(false)

  const testGetParameters = async () => {
    setLoading(true)
    try {
      const data = await recipeParameterClient.getRecipeParameters()
      setResult(JSON.stringify(data, null, 2))
    } catch (error) {
      setResult(`Error: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  const testGetOperations = async () => {
    setLoading(true)
    try {
      const data = await recipeParameterClient.getOperations()
      setResult(JSON.stringify(data, null, 2))
    } catch (error) {
      setResult(`Error: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  const testGetUnits = async () => {
    setLoading(true)
    try {
      const data = await recipeParameterClient.getUnits()
      setResult(JSON.stringify(data, null, 2))
    } catch (error) {
      setResult(`Error: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <PageContainer>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Recipe Parameter Client Test</h1>
          <p className="text-muted-foreground">
            Test the recipe parameter GraphQL client functionality
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Test Actions</CardTitle>
            <CardDescription>
              Click the buttons below to test different client methods
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 mb-4">
              <Button onClick={testGetParameters} disabled={loading}>
                Get Parameters
              </Button>
              <Button onClick={testGetOperations} disabled={loading}>
                Get Operations
              </Button>
              <Button onClick={testGetUnits} disabled={loading}>
                Get Units
              </Button>
            </div>
            
            {loading && (
              <div className="text-center py-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">Loading...</p>
              </div>
            )}

            {result && (
              <div className="mt-4">
                <h3 className="text-lg font-semibold mb-2">Result:</h3>
                <pre className="bg-gray-100 p-4 rounded-md overflow-auto text-sm">
                  {result}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  )
} 