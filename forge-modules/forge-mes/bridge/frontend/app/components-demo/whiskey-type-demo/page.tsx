import { WhiskeyTypeDemo } from '@/components/demo/whiskey-type-demo'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, Lightbulb } from 'lucide-react'
import Link from 'next/link'

export default function WhiskeyTypeDemoPage() {
  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">Whiskey Type Detection</h1>
        <p className="text-muted-foreground">
          Demonstration of automatic whiskey type detection based on mash bill composition
        </p>
      </div>

      {/* Integration Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            Integration Status
          </CardTitle>
          <CardDescription>
            Whiskey type detection has been integrated into the following forms and components
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium">Recipe Creation Wizard</h3>
                <Badge variant="default">✅ Active</Badge>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                Auto-detects whiskey type when mash bill totals 100% in the recipe details step
              </p>
              <Link href="/recipe-management/create">
                <button className="text-sm text-blue-600 hover:text-blue-800">
                  Try Recipe Creator →
                </button>
              </Link>
            </div>

            <div className="p-4 border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium">Recipe Edit Modal</h3>
                <Badge variant="default">✅ Active</Badge>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                Inherits detection from recipe details step when editing existing recipes
              </p>
              <Link href="/recipe-management">
                <button className="text-sm text-blue-600 hover:text-blue-800">
                  View Recipes →
                </button>
              </Link>
            </div>

            <div className="p-4 border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium">Enzyme Dosing Calculator</h3>
                <Badge variant="default">✅ Active</Badge>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                Detects whiskey type from custom mash bill input (XX-XX-XX-XX format)
              </p>
              <Link href="/configuration/enzyme-dosing">
                <button className="text-sm text-blue-600 hover:text-blue-800">
                  Try Calculator →
                </button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* How It Works */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-blue-600" />
            How It Works
          </CardTitle>
          <CardDescription>
            The detection algorithm follows TTB regulations and industry standards
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium mb-2">Primary Grain Rules (≥51%)</h4>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>• <strong>Rye ≥51%:</strong> Rye Whiskey</li>
                  <li>• <strong>Wheat ≥51%:</strong> Wheat Whiskey</li>
                  <li>• <strong>Malted Barley ≥51%:</strong> Malt Whiskey</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium mb-2">Corn-Based Rules (≥51%)</h4>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>• <strong>Wheat secondary:</strong> Wheated Bourbon</li>
                  <li>• <strong>Rye secondary:</strong> Rye Bourbon</li>
                  <li>• <strong>All 4 grains ≥5%:</strong> Four Grain Bourbon</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Interactive Demo */}
      <WhiskeyTypeDemo />
    </div>
  )
} 