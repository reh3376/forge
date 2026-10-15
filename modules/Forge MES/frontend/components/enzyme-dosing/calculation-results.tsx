'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Download, Printer, Save, Clock, User, Hash } from 'lucide-react'
import { toast } from 'sonner'

// Types for the new simplified enzyme calculator
interface EnzymeCalculationResult {
  enzymeConfigurationId: string
  category: string
  enzymeName: string
  doseLbs: number
  instructions: string
  dosePerMetricTon: number
}

interface EnzymeCalculatorResponse {
  calculationId: string
  totalGrainLoadLbs: number
  mashBill?: string
  recipeId?: string
  enzymeCalculations: EnzymeCalculationResult[]
  calculatedAt: string
  calculatedBy: string
}

interface CalculationResultsProps {
  results: EnzymeCalculatorResponse | null
}

export function CalculationResults({ results }: CalculationResultsProps) {
  if (!results) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <div className="text-center space-y-2">
          <div className="text-lg font-medium">No Calculation Results</div>
          <div className="text-sm">
            Select enzymes and enter grain load, then click &quot;Calculate Dosing&quot; to see results
          </div>
        </div>
      </div>
    )
  }

  const handleSave = async () => {
    try {
      // TODO: Implement save to history
      toast.success('Calculation Saved', {
        description: 'Calculation has been saved to history successfully.'
      })
    } catch {
      toast.error('Save Failed', {
        description: 'Failed to save calculation to history.'
      })
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const handleExport = () => {
    // Create CSV content
    const csvContent = [
      ['Calculation ID', results.calculationId],
      ['Mash Bill', results.mashBill || 'Not specified'],
      ['Grain Load (lbs)', results.totalGrainLoadLbs.toString()],
      ['Calculated At', new Date(results.calculatedAt).toLocaleString()],
      ['Calculated By', results.calculatedBy],
      [''],
      ['Enzyme Name', 'Category', 'Dose (lbs)', 'Dose per MT', 'Instructions'],
      ...results.enzymeCalculations.map(calc => [
        calc.enzymeName,
        calc.category,
        calc.doseLbs.toString(),
        calc.dosePerMetricTon.toString(),
        calc.instructions
      ])
    ].map(row => row.join(',')).join('\n')

    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `enzyme-calculation-${results.calculationId}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)

    toast.success('Export Complete', {
      description: 'Calculation results exported to CSV successfully.'
    })
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'LIQUIFACTION':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
      case 'SACCHARIFICATION':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
      case 'VISCOSITY':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300'
    }
  }

  return (
    <div className="space-y-6">
      {/* Calculation Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Hash className="h-5 w-5" />
            Calculation Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium">Calculation ID:</span>
              <div className="font-mono text-muted-foreground">{results.calculationId}</div>
            </div>
            <div>
              <span className="font-medium">Mash Bill:</span>
              <div className="font-mono text-lg">{results.mashBill || 'Not specified'}</div>
            </div>
            <div>
              <span className="font-medium">Grain Load:</span>
              <div className="text-lg">{results.totalGrainLoadLbs.toLocaleString()} lbs</div>
            </div>
            <div>
              <span className="font-medium">Total Enzymes:</span>
              <div className="text-lg">{results.enzymeCalculations.length}</div>
            </div>
          </div>
          
          <Separator />
          
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {new Date(results.calculatedAt).toLocaleString()}
            </div>
            <div className="flex items-center gap-1">
              <User className="h-4 w-4" />
              {results.calculatedBy}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Enzyme Dosing Results */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Enzyme Dosing Requirements</h3>
        
        {results.enzymeCalculations.map((calculation) => (
          <Card key={calculation.enzymeConfigurationId} className="print:break-inside-avoid">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{calculation.enzymeName}</CardTitle>
                <Badge className={getCategoryColor(calculation.category)}>
                  {calculation.category}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Required Dose:</span>
                <span className="text-xl font-bold text-primary">
                  {calculation.doseLbs.toFixed(2)} lbs
                </span>
              </div>
              
              <div className="text-xs text-muted-foreground">
                Based on {calculation.dosePerMetricTon} per metric ton
              </div>
              
              <Separator />
              
              <div>
                <span className="text-sm font-medium">Application Instructions:</span>
                <p className="text-sm text-muted-foreground mt-1">
                  {calculation.instructions}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3 pt-4 print:hidden">
        <Button onClick={handleSave} variant="default">
          <Save className="mr-2 h-4 w-4" />
          Save to History
        </Button>
        
        <Button onClick={handlePrint} variant="outline">
          <Printer className="mr-2 h-4 w-4" />
          Print
        </Button>
        
        <Button onClick={handleExport} variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Print Styles */}
      <style jsx>{`
        @media print {
          .print\\:hidden {
            display: none !important;
          }
          .print\\:break-inside-avoid {
            break-inside: avoid;
          }
        }
      `}</style>
    </div>
  )
} 