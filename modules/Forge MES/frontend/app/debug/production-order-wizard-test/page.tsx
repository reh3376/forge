'use client'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { ProductionOrderWorkflow, type ProductionOrderWorkflowData, type WorkflowResult } from '@/lib/api/production-order-workflows'
import { useAuth } from '@/lib/auth-context'

const productionOrderWorkflow = new ProductionOrderWorkflow()

export default function ProductionOrderWizardTestPage() {
  const { user } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<WorkflowResult | null>(null)

  const [testData, setTestData] = useState<ProductionOrderWorkflowData>({
    orderName: 'TEST-PRO-20250602016',
    quantity: 500,
    startDate: '2025-06-01',
    endDate: '2025-06-06',
    customerCode: 'CUST001',
    priority: 'medium' as const,
    finalProof: 120,
    containerType: 'LargeBarrel',
    totalCooks: 14,
    totalFermenters: 7,
    upperControlLimit: 525,
    lowerControlLimit: 475,
    selectedRecipe: {
      id: 'cm8vv2gu600zkbseoolyfhz6x',
      Recipe: 'Premium Bourbon Mash',
      whiskeyType: 'Bourbon'
    },
    bomItems: [
      {
        id: 'bom-item-1',
        itemCode: 'CORN-001',
        name: 'Yellow Corn',
        quantity: 2000,
        unit: 'lbs',
        category: 'Grain',
        itemGroup: 'RM-GR'
      },
      {
        id: 'bom-item-2',
        itemCode: 'WHEAT-001',
        name: 'Winter Wheat',
        quantity: 800,
        unit: 'lbs',
        category: 'Grain',
        itemGroup: 'RM-GR'
      }
    ],
    binConfigurations: {
      sil110ConfigId: 'config-sil110-001',
      sil115ConfigId: 'config-sil115-001',
      sil120ConfigId: 'config-sil120-001',
      totalCooks: 14,
      totalFermenters: 7,
      cooksPerFermenter: 2,
      entryProof: 120,
      proofGallonsPerBarrel: 50,
      barrelsPerFermenter: 75
    },
    scheduleOrderData: {
      estimatedStart: '2025-06-01T08:00:00Z',
      estimatedEnd: '2025-06-06T17:00:00Z',
      totalBarrels: 525,
      totalProofGallons: 26250,
      duration: 120,
      durationUnits: 'hours'
    }
  })

  const handleTestMutation = async () => {
    if (!user?.email) {
      toast.error('User authentication required')
      return
    }

    setIsLoading(true)
    setResult(null)

    try {
      console.log('🧪 Testing comprehensive backend mutation...')
      
      const result = await productionOrderWorkflow.createProductionOrderFromWizard(
        testData,
        user.email
      )
      
      console.log('✅ Test successful:', result)
      setResult(result)
      toast.success('Production order created successfully!')
      
    } catch (error) {
      console.error('❌ Test failed:', error)
      toast.error(`Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Production Order Wizard Backend Test</h1>
          <p className="text-muted-foreground">
            Test the comprehensive backend mutation for production order creation
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Test Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>Test Configuration</CardTitle>
            <CardDescription>
              Configure test data for production order creation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="orderName">Order Name</Label>
                <Input
                  id="orderName"
                  value={testData.orderName}
                  onChange={(e) => setTestData(prev => ({ ...prev, orderName: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  value={testData.quantity}
                  onChange={(e) => setTestData(prev => ({ ...prev, quantity: parseInt(e.target.value) }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="customerCode">Customer Code</Label>
                <Input
                  id="customerCode"
                  value={testData.customerCode}
                  onChange={(e) => setTestData(prev => ({ ...prev, customerCode: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="finalProof">Final Proof</Label>
                <Input
                  id="finalProof"
                  type="number"
                  value={testData.finalProof}
                  onChange={(e) => setTestData(prev => ({ ...prev, finalProof: parseInt(e.target.value) }))}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="recipeId">Recipe ID</Label>
              <Input
                id="recipeId"
                value={testData.selectedRecipe.id}
                onChange={(e) => setTestData(prev => ({ 
                  ...prev, 
                  selectedRecipe: { ...prev.selectedRecipe, id: e.target.value }
                }))}
              />
            </div>

            <div className="flex gap-4">
              <Button 
                onClick={handleTestMutation} 
                disabled={isLoading}
                className="flex-1"
              >
                {isLoading ? 'Testing...' : 'Test Backend Mutation'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Test Results */}
        <Card>
          <CardHeader>
            <CardTitle>Test Results</CardTitle>
            <CardDescription>
              Results from the production order creation test
            </CardDescription>
          </CardHeader>
          <CardContent>
            {result ? (
              <div className="space-y-4">
                <div>
                  <Label>Production Order ID</Label>
                  <p className="text-sm font-mono bg-muted p-2 rounded">
                    {result.productionOrder?.id || 'N/A'}
                  </p>
                </div>
                <div>
                  <Label>Production Order Name</Label>
                  <p className="text-sm font-mono bg-muted p-2 rounded">
                    {result.productionOrder?.name || 'N/A'}
                  </p>
                </div>
                <div>
                  <Label>Schedule Order ID</Label>
                  <p className="text-sm font-mono bg-muted p-2 rounded">
                    {result.scheduleOrder?.id || 'N/A'}
                  </p>
                </div>
                <div>
                  <Label>BOM Items Count</Label>
                  <p className="text-sm font-mono bg-muted p-2 rounded">
                    {result.bomItems?.length || 0}
                  </p>
                </div>
                <div>
                  <Label>Full Result (JSON)</Label>
                  <Textarea
                    value={JSON.stringify(result, null, 2)}
                    readOnly
                    className="h-40 text-xs font-mono"
                  />
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">No test results yet. Run a test to see results.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* User Info */}
      <Card>
        <CardHeader>
          <CardTitle>Authentication Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Current User</Label>
              <p className="text-sm font-mono bg-muted p-2 rounded">
                {user?.email || 'Not authenticated'}
              </p>
            </div>
            <div>
              <Label>User Email</Label>
              <p className="text-sm font-mono bg-muted p-2 rounded">
                {user?.email || 'N/A'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 