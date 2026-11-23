'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { CheckCircle, Clock, AlertCircle } from 'lucide-react'

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

interface SimplifiedCalculationResultsProps {
  results: SimplifiedCalculationResult | null
}

export function SimplifiedCalculationResults({ results }: SimplifiedCalculationResultsProps) {
  if (!results) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Clock className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium text-muted-foreground mb-2">
          No Calculation Results
        </h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Select enzymes and enter grain load, then click &quot;Calculate Dosing&quot; to see results
        </p>
      </div>
    )
  }

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString()
    } catch {
      return dateString
    }
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'LIQUIFACTION':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'SACCHARIFICATION':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'VISCOSITY':
        return 'bg-purple-100 text-purple-800 border-purple-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const totalDoseLbs = results.calculations.reduce((sum, calc) => sum + calc.doseLbs, 0)

  return (
    <div className="space-y-6">
      {/* Calculation Summary */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <CardTitle className="text-lg">Calculation Summary</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium text-muted-foreground">Calculation ID:</span>
              <p className="font-mono text-xs">{results.calculationId}</p>
            </div>
            <div>
              <span className="font-medium text-muted-foreground">Total Grain Load:</span>
              <p className="font-semibold">{results.totalGrainLoadLbs.toLocaleString()} lbs</p>
            </div>
            {results.recipeName && (
              <div>
                <span className="font-medium text-muted-foreground">Recipe:</span>
                <p>{results.recipeName}</p>
              </div>
            )}
            {results.mashBill && (
              <div>
                <span className="font-medium text-muted-foreground">Mash Bill:</span>
                <p className="font-mono">{results.mashBill}</p>
              </div>
            )}
            <div>
              <span className="font-medium text-muted-foreground">Calculated At:</span>
              <p className="text-xs">{formatDate(results.calculatedAt)}</p>
            </div>
            <div>
              <span className="font-medium text-muted-foreground">Calculated By:</span>
              <p>{results.calculatedBy}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Total Dosing Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Total Enzyme Dosing</CardTitle>
          <CardDescription>
            Combined dosing amounts for all selected enzymes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <div className="text-3xl font-bold text-primary">
              {totalDoseLbs.toFixed(2)} lbs
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Total enzyme dosing required
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Individual Enzyme Calculations */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Individual Enzyme Dosing</h3>
        
        {results.calculations.map((calculation) => (
          <Card key={calculation.enzymeId} className="relative">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-base">{calculation.enzymeName}</CardTitle>
                  <Badge 
                    variant="outline" 
                    className={getCategoryColor(calculation.category)}
                  >
                    {calculation.category}
                  </Badge>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-primary">
                    {calculation.doseLbs.toFixed(2)} lbs
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {calculation.dosePerMetricTon} per metric ton
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {/* Calculation Details */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-muted-foreground">Dose Rate:</span>
                    <p>{calculation.dosePerMetricTon} per metric ton</p>
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">Calculated Amount:</span>
                    <p className="font-semibold">{calculation.doseLbs.toFixed(2)} lbs</p>
                  </div>
                </div>

                <Separator />

                {/* Application Instructions */}
                <div>
                  <span className="font-medium text-muted-foreground text-sm">Application Instructions:</span>
                  <p className="text-sm mt-1 p-3 bg-muted rounded-md">
                    {calculation.instructions}
                  </p>
                </div>

                {/* Status Indicator */}
                <div className="flex items-center gap-2 text-xs">
                  {calculation.isActive ? (
                    <>
                      <CheckCircle className="h-3 w-3 text-green-600" />
                      <span className="text-green-600">Active Configuration</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-3 w-3 text-amber-600" />
                      <span className="text-amber-600">Inactive Configuration</span>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Calculation Formula */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Calculation Method</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm space-y-2">
            <p className="font-medium">Formula Used:</p>
            <code className="block p-3 bg-muted rounded-md text-xs">
              Dose (lbs) = Dose per Metric Ton × (Total Grain Load lbs ÷ 2204.62)
            </code>
            <p className="text-muted-foreground text-xs">
              Where 2204.62 is the conversion factor from pounds to metric tons
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Safety Notice */}
      <Card className="border-amber-200 bg-amber-50">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-600" />
            <CardTitle className="text-base text-amber-800">Safety Notice</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="text-sm text-amber-800 space-y-1">
            <li>• Always verify calculations before production use</li>
            <li>• Follow enzyme manufacturer instructions</li>
            <li>• Maintain proper documentation for audit trails</li>
            <li>• Report any calculation discrepancies immediately</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
} 