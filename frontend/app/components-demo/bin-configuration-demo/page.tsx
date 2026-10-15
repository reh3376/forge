'use client'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

import React, { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { BinConfigurationSelector, useBinConfigurationDetails } from '@/components/production/bin-configuration-selector'
import { Package, ArrowRight, CheckCircle } from 'lucide-react'

export default function BinConfigurationDemo() {
  const [selectedConfigId, setSelectedConfigId] = useState<string>('')
  const [filteredConfigId, setFilteredConfigId] = useState<string>('')
  
  const { configuration: selectedConfig } = useBinConfigurationDetails(selectedConfigId)
  const { configuration: filteredConfig } = useBinConfigurationDetails(filteredConfigId)

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold">Bin Configuration Demo</h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Demonstration of the bin configuration selector component used in production order wizards.
          This component allows users to select pre-configured bin-to-item group mappings.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Basic Selector */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Basic Bin Configuration Selector
            </CardTitle>
            <CardDescription>
              Standard selector showing all available bin configurations
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <BinConfigurationSelector
              value={selectedConfigId}
              onValueChange={setSelectedConfigId}
              label="Select Bin Configuration"
              placeholder="Choose a bin configuration..."
              required
            />
            
            {selectedConfig && (
              <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="font-medium text-green-800">Configuration Selected</span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Bin:</span>
                    <span>{selectedConfig.bin.name}</span>
                    {selectedConfig.bin.assetType && (
                      <Badge variant="secondary">{selectedConfig.bin.assetType}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Item Group:</span>
                    <span>{selectedConfig.itemGroup.name}</span>
                  </div>
                  {selectedConfig.bin.description && (
                    <div className="text-muted-foreground">
                      {selectedConfig.bin.description}
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Filtered Selector */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Filtered Bin Configuration Selector
            </CardTitle>
            <CardDescription>
              Selector filtered to show only grain-related configurations
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <BinConfigurationSelector
              value={filteredConfigId}
              onValueChange={setFilteredConfigId}
              label="Select Grain Bin Configuration"
              placeholder="Choose a grain bin..."
              filterByItemGroup="cm4aqhqhj0001uw8ixqjvqhqj" // RM-GR (Raw Materials - Grains)
              required
            />
            
            {filteredConfig && (
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-4 w-4 text-blue-600" />
                  <span className="font-medium text-blue-800">Grain Configuration Selected</span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Bin:</span>
                    <span>{filteredConfig.bin.name}</span>
                    {filteredConfig.bin.assetType && (
                      <Badge variant="secondary">{filteredConfig.bin.assetType}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Item Group:</span>
                    <span>{filteredConfig.itemGroup.name}</span>
                  </div>
                  {filteredConfig.bin.description && (
                    <div className="text-muted-foreground">
                      {filteredConfig.bin.description}
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Usage Example */}
      <Card>
        <CardHeader>
          <CardTitle>Production Order Integration Example</CardTitle>
          <CardDescription>
            How this component would be used in a production order creation wizard
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 border rounded-lg">
                <div className="font-medium mb-2">Step 1: Select Recipe</div>
                <div className="text-sm text-muted-foreground">
                  User selects a recipe which determines required item groups
                </div>
              </div>
              <div className="flex items-center justify-center">
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="text-center p-4 border rounded-lg bg-blue-50">
                <div className="font-medium mb-2">Step 2: Configure Bins</div>
                <div className="text-sm text-muted-foreground">
                  Bin selector shows only configurations matching recipe requirements
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h4 className="font-medium">Example Production Order Form Integration:</h4>
              <div className="bg-muted p-4 rounded-lg">
                <pre className="text-sm overflow-x-auto">
{`// In production order form
<BinConfigurationSelector
  value={formData.binConfigurationId}
  onValueChange={(value) => 
    setFormData(prev => ({ ...prev, binConfigurationId: value }))
  }
  label="Milling Bin Configuration"
  filterByItemGroup={recipe.primaryItemGroupId}
  required
/>`}
                </pre>
              </div>
            </div>

            <div className="flex gap-4">
              <Button variant="outline" asChild>
                <a href="/configuration/bin-configurations">
                  Manage Configurations
                </a>
              </Button>
              <Button variant="outline" asChild>
                <a href="/recipe-management/create">
                  Create Production Order
                </a>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Component Features */}
      <Card>
        <CardHeader>
          <CardTitle>Component Features</CardTitle>
          <CardDescription>
            Key features and capabilities of the BinConfigurationSelector component
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h4 className="font-medium">Core Features</h4>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  Real-time data loading from GraphQL API
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  Filtering by item group for contextual selection
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  Rich display with bin and item group details
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  Loading states and error handling
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  Selected configuration preview
                </li>
              </ul>
            </div>
            <div className="space-y-3">
              <h4 className="font-medium">Integration Benefits</h4>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-blue-600" />
                  Consistent UI across production workflows
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-blue-600" />
                  Reduces configuration errors in production orders
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-blue-600" />
                  Automatic validation of bin-item group compatibility
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-blue-600" />
                  Reusable across multiple form contexts
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-blue-600" />
                  TypeScript support for type safety
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 