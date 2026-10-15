'use client'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Calculator, Settings, FileText } from 'lucide-react'
import { EnzymeConfigurationManager } from '@/components/enzyme-dosing/enzyme-configuration-manager'
import { SimplifiedEnzymeCalculatorForm } from '@/components/enzyme-dosing/simplified-enzyme-calculator-form'
import { SimplifiedCalculationResults } from '@/components/enzyme-dosing/simplified-calculation-results'

// Types for the new simplified calculation results
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

export default function EnzymeDosingConfigurationPage() {
  const [activeTab, setActiveTab] = useState('calculator')
  const [calculationResults, setCalculationResults] = useState<SimplifiedCalculationResult | null>(null)

  // Handle calculation completion from the simplified form
  const handleCalculationComplete = (result: SimplifiedCalculationResult) => {
    setCalculationResults(result)
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex flex-col space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Enzyme Dosing Calculator</h1>
        <p className="text-muted-foreground">
          Calculate precise enzyme dosing amounts based on mash bills and grain loads
        </p>
      </div>

      {/* Main Content - Removed History tab */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="calculator" className="flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            Calculator
          </TabsTrigger>
          <TabsTrigger value="configurations" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Configurations
          </TabsTrigger>
          <TabsTrigger value="documentation" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Documentation
          </TabsTrigger>
        </TabsList>

        {/* Calculator Tab - Updated to use simplified components */}
        <TabsContent value="calculator" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Simplified Calculator Form */}
            <Card>
              <CardHeader>
                <CardTitle>Enzyme Dosing Calculator</CardTitle>
                <CardDescription>
                  Select one enzyme per category and enter grain load to calculate dosing requirements
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SimplifiedEnzymeCalculatorForm 
                  onCalculationComplete={handleCalculationComplete}
                />
              </CardContent>
            </Card>

            {/* Simplified Results Display */}
            <Card>
              <CardHeader>
                <CardTitle>Calculation Results</CardTitle>
                <CardDescription>
                  Enzyme dosing amounts and application instructions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SimplifiedCalculationResults results={calculationResults} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Configurations Tab */}
        <TabsContent value="configurations">
          <EnzymeConfigurationManager />
        </TabsContent>

        {/* Documentation Tab - Updated for simplified approach */}
        <TabsContent value="documentation">
          <div className="space-y-6">
            {/* Calculator Documentation */}
            <Card>
              <CardHeader>
                <CardTitle>Enzyme Dosing Calculator</CardTitle>
                <CardDescription>
                  How to use the enzyme dosing calculator for production planning
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="prose max-w-none space-y-4">
                  <h4 className="text-lg font-semibold">Quick Start Guide</h4>
                  <ol className="list-decimal list-inside space-y-2">
                    <li><strong>Select Enzymes:</strong> Choose one enzyme for each required category (Liquifaction, Saccharification, Viscosity)</li>
                    <li><strong>Enter Grain Load:</strong> Specify the total grain weight in pounds (1,000 - 50,000 lbs)</li>
                    <li><strong>Optional Recipe Selection:</strong> Select an existing recipe to auto-populate mash bill information</li>
                    <li><strong>Custom Mash Bill:</strong> Enter a custom mash bill in XX-XX-XX-XX format if not using a recipe</li>
                    <li><strong>Calculate:</strong> Click &quot;Calculate Dosing&quot; to get precise enzyme amounts</li>
                    <li><strong>Review Results:</strong> Check calculated amounts in pounds and follow application instructions</li>
                  </ol>
                  
                  <h4 className="text-lg font-semibold">Enzyme Categories</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-3 border rounded-lg">
                      <h5 className="font-medium text-blue-600">Liquifaction</h5>
                      <p className="text-sm text-muted-foreground">Enzymes that break down starch into smaller molecules during high-temperature mashing. Typically added with water/backset before grain.</p>
                    </div>
                    <div className="p-3 border rounded-lg">
                      <h5 className="font-medium text-green-600">Saccharification</h5>
                      <p className="text-sm text-muted-foreground">Enzymes that convert starches into fermentable sugars. Added during saccharification rest at lower temperatures.</p>
                    </div>
                    <div className="p-3 border rounded-lg">
                      <h5 className="font-medium text-purple-600">Viscosity</h5>
                      <p className="text-sm text-muted-foreground">Enzymes that reduce viscosity and improve processing efficiency. Added with grain during mashing.</p>
                    </div>
                  </div>

                  <h4 className="text-lg font-semibold">Calculation Method</h4>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="font-medium">Formula:</p>
                    <code className="block mt-2 p-2 bg-white rounded border">
                      Dose (lbs) = Dose per Metric Ton × (Total Grain Load lbs ÷ 2204.62)
                    </code>
                    <p className="text-sm text-muted-foreground mt-2">
                      Where 2204.62 is the conversion factor from pounds to metric tons
                    </p>
                  </div>

                  <h4 className="text-lg font-semibold">Data Sources</h4>
                  <ul className="list-disc list-inside space-y-1">
                    <li><strong>Enzyme Configurations:</strong> Pulled from database with real enzyme names, doses, and instructions</li>
                    <li><strong>Recipes:</strong> Existing recipes with mash bill information for auto-population</li>
                    <li><strong>No Mock Data:</strong> All calculations use authentic database information only</li>
                    <li><strong>Authentication:</strong> All API calls are properly authenticated through GraphQL proxy</li>
                  </ul>

                  <h4 className="text-lg font-semibold">Validation Rules</h4>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Grain load must be between 1,000 and 50,000 pounds</li>
                    <li>At least one enzyme must be selected for calculation</li>
                    <li>Only active enzyme configurations are available for selection</li>
                    <li>Enzyme configurations must have valid item relationships</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Configuration Management Documentation */}
            <Card>
              <CardHeader>
                <CardTitle>Enzyme Configuration Management</CardTitle>
                <CardDescription>
                  How to manage enzyme configurations for dosing calculations
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="prose max-w-none space-y-4">
                  <h4 className="text-lg font-semibold">Configuration Fields</h4>
                  <div className="space-y-3">
                    <div className="border-l-4 border-blue-500 pl-4">
                      <h5 className="font-medium">Item Selection</h5>
                      <p className="text-sm text-muted-foreground">Choose the enzyme item from the database. This provides the enzyme name and item number.</p>
                    </div>
                    <div className="border-l-4 border-green-500 pl-4">
                      <h5 className="font-medium">Category</h5>
                      <p className="text-sm text-muted-foreground">Select LIQUIFACTION, SACCHARIFICATION, or VISCOSITY based on the enzyme's function.</p>
                    </div>
                    <div className="border-l-4 border-purple-500 pl-4">
                      <h5 className="font-medium">Dose per Metric Ton</h5>
                      <p className="text-sm text-muted-foreground">Enter the recommended dosage amount per metric ton of grain (in pounds).</p>
                    </div>
                    <div className="border-l-4 border-orange-500 pl-4">
                      <h5 className="font-medium">Instructions</h5>
                      <p className="text-sm text-muted-foreground">Provide detailed application instructions including timing and method.</p>
                    </div>
                    <div className="border-l-4 border-gray-500 pl-4">
                      <h5 className="font-medium">Active Status</h5>
                      <p className="text-sm text-muted-foreground">Toggle to control whether this configuration appears in the calculator.</p>
                    </div>
                  </div>

                  <h4 className="text-lg font-semibold">Best Practices</h4>
                  <ul className="list-disc list-inside space-y-1">
                    <li><strong>Accurate Dosing:</strong> Verify dose amounts with enzyme manufacturer specifications</li>
                    <li><strong>Clear Instructions:</strong> Include timing, temperature, and application method details</li>
                    <li><strong>Regular Updates:</strong> Keep configurations current with latest enzyme formulations</li>
                    <li><strong>Active Management:</strong> Deactivate discontinued or obsolete enzyme configurations</li>
                    <li><strong>Item Relationships:</strong> Ensure all configurations have valid item associations</li>
                  </ul>

                  <h4 className="text-lg font-semibold">Data Requirements</h4>
                  <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                    <h5 className="font-medium text-yellow-800">Important:</h5>
                    <p className="text-sm text-yellow-700 mt-1">
                      Enzyme configurations require valid item relationships in the database. 
                      If no configurations appear in the calculator, verify that:
                    </p>
                    <ul className="list-disc list-inside text-sm text-yellow-700 mt-2 space-y-1">
                      <li>Enzyme configurations exist in the database</li>
                      <li>Configurations are marked as active</li>
                      <li>Each configuration has a valid item relationship</li>
                      <li>Items have proper names and numbers</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Safety and Compliance Documentation */}
            <Card>
              <CardHeader>
                <CardTitle>Safety & Compliance Guidelines</CardTitle>
                <CardDescription>
                  Important safety and regulatory considerations
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="prose max-w-none space-y-4">
                  <h4 className="text-lg font-semibold">Production Safety</h4>
                  <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                    <ul className="list-disc list-inside space-y-1 text-red-700">
                      <li><strong>Always verify calculations</strong> before production use</li>
                      <li><strong>Follow manufacturer instructions</strong> for enzyme handling and storage</li>
                      <li><strong>Use proper PPE</strong> when handling enzyme powders or liquids</li>
                      <li><strong>Maintain temperature controls</strong> during enzyme addition</li>
                      <li><strong>Document all dosing activities</strong> for audit trails</li>
                    </ul>
                  </div>

                  <h4 className="text-lg font-semibold">Quality Control</h4>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Verify enzyme activity levels before use</li>
                    <li>Check expiration dates on all enzyme products</li>
                    <li>Monitor process parameters during enzyme addition</li>
                    <li>Record actual vs. calculated dosing amounts</li>
                    <li>Report any calculation discrepancies immediately</li>
                  </ul>

                  <h4 className="text-lg font-semibold">Regulatory Compliance</h4>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Maintain detailed records of all enzyme usage</li>
                    <li>Ensure enzymes are approved for beverage production</li>
                    <li>Follow FDA and TTB guidelines for enzyme use</li>
                    <li>Document supplier certifications and specifications</li>
                    <li>Implement HACCP controls for enzyme handling</li>
                  </ul>

                  <h4 className="text-lg font-semibold">System Limitations</h4>
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <ul className="list-disc list-inside space-y-1 text-blue-700">
                      <li>Calculator is for planning purposes - verify with lab analysis</li>
                      <li>Calculations assume standard enzyme activity levels</li>
                      <li>Environmental factors may affect actual dosing requirements</li>
                      <li>System requires active database connections for real-time data</li>
                      <li>No mock or fallback data is used - all calculations use live database information</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Troubleshooting Documentation */}
            <Card>
              <CardHeader>
                <CardTitle>Troubleshooting</CardTitle>
                <CardDescription>
                  Common issues and solutions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="prose max-w-none space-y-4">
                  <h4 className="text-lg font-semibold">Common Issues</h4>
                  
                  <div className="space-y-4">
                    <div className="border rounded-lg p-4">
                      <h5 className="font-medium text-red-600">No enzymes appear in dropdowns</h5>
                      <p className="text-sm text-muted-foreground mt-1">
                        <strong>Cause:</strong> No active enzyme configurations in database or missing item relationships<br/>
                        <strong>Solution:</strong> Check database for enzyme configurations and verify item associations
                      </p>
                    </div>
                    
                    <div className="border rounded-lg p-4">
                      <h5 className="font-medium text-red-600">Calculation fails with 500 error</h5>
                      <p className="text-sm text-muted-foreground mt-1">
                        <strong>Cause:</strong> Selected enzyme missing required data or database connection issues<br/>
                        <strong>Solution:</strong> Verify enzyme configuration has valid item name and database connectivity
                      </p>
                    </div>
                    
                    <div className="border rounded-lg p-4">
                      <h5 className="font-medium text-red-600">Authentication errors</h5>
                      <p className="text-sm text-muted-foreground mt-1">
                        <strong>Cause:</strong> GraphQL authentication issues<br/>
                        <strong>Solution:</strong> Check user permissions and GraphQL proxy configuration
                      </p>
                    </div>
                    
                    <div className="border rounded-lg p-4">
                      <h5 className="font-medium text-orange-600">Unexpected calculation results</h5>
                      <p className="text-sm text-muted-foreground mt-1">
                        <strong>Cause:</strong> Incorrect dose per metric ton values in configuration<br/>
                        <strong>Solution:</strong> Verify enzyme configuration dose amounts with manufacturer specs
                      </p>
                    </div>
                  </div>

                  <h4 className="text-lg font-semibold">Getting Help</h4>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Check browser console for detailed error messages</li>
                    <li>Verify database connectivity and enzyme configuration data</li>
                    <li>Contact system administrator for authentication issues</li>
                    <li>Review enzyme manufacturer documentation for dosing guidelines</li>
                    <li>Report persistent issues to the development team</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
} 