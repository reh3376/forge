/**
 * Demo component to showcase whiskey type detection functionality
 * This can be used for testing and demonstration purposes
 */

'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { detectWhiskeyType, getWhiskeyTypeLabel, getWhiskeyTypeDescription, isValidMashBill, type MashBill } from '@/lib/utils/whiskey-type-detection'

// Example mash bills for demonstration
const EXAMPLE_MASH_BILLS = [
  { name: 'Classic Rye Whiskey', mashBill: { corn: 30, rye: 60, wheat: 5, maltedBarley: 5 } },
  { name: 'Wheated Bourbon', mashBill: { corn: 75, rye: 2, wheat: 15, maltedBarley: 8 } },
  { name: 'Four Grain Bourbon', mashBill: { corn: 60, rye: 15, wheat: 15, maltedBarley: 10 } },
  { name: 'High Rye Bourbon', mashBill: { corn: 70, rye: 20, wheat: 0, maltedBarley: 10 } },
  { name: 'Malt Whiskey', mashBill: { corn: 30, rye: 5, wheat: 5, maltedBarley: 60 } },
  { name: 'Wheat Whiskey', mashBill: { corn: 30, rye: 5, wheat: 60, maltedBarley: 5 } }
]

export function WhiskeyTypeDemo() {
  const [mashBill, setMashBill] = useState<MashBill>({ corn: 0, rye: 0, wheat: 0, maltedBarley: 0 })

  const total = mashBill.corn + mashBill.rye + mashBill.wheat + mashBill.maltedBarley
  const isValid = isValidMashBill(mashBill)
  const detectedType = isValid ? detectWhiskeyType(mashBill) : null

  const updateMashBill = (component: keyof MashBill, value: number) => {
    setMashBill(prev => ({
      ...prev,
      [component]: Math.max(0, Math.min(100, value))
    }))
  }

  const loadExample = (example: typeof EXAMPLE_MASH_BILLS[0]) => {
    setMashBill(example.mashBill)
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Whiskey Type Detection Demo</CardTitle>
          <CardDescription>
            Test the whiskey type detection algorithm with different mash bill compositions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Example Mash Bills */}
          <div>
            <Label className="text-base font-medium">Example Mash Bills</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
              {EXAMPLE_MASH_BILLS.map((example, index) => (
                <Button
                  key={index}
                  variant="outline"
                  onClick={() => loadExample(example)}
                  className="h-auto p-3 text-left justify-start"
                >
                  <div>
                    <div className="font-medium">{example.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {example.mashBill.corn}% corn, {example.mashBill.rye}% rye, {example.mashBill.wheat}% wheat, {example.mashBill.maltedBarley}% malt
                    </div>
                  </div>
                </Button>
              ))}
            </div>
          </div>

          {/* Mash Bill Input */}
          <div>
            <Label className="text-base font-medium">Custom Mash Bill (%)</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
              <div>
                <Label htmlFor="demo-corn" className="text-sm">Corn</Label>
                <Input
                  id="demo-corn"
                  type="number"
                  min="0"
                  max="100"
                  value={mashBill.corn}
                  onChange={(e) => updateMashBill('corn', parseInt(e.target.value) || 0)}
                  placeholder="0"
                />
              </div>
              <div>
                <Label htmlFor="demo-rye" className="text-sm">Rye</Label>
                <Input
                  id="demo-rye"
                  type="number"
                  min="0"
                  max="100"
                  value={mashBill.rye}
                  onChange={(e) => updateMashBill('rye', parseInt(e.target.value) || 0)}
                  placeholder="0"
                />
              </div>
              <div>
                <Label htmlFor="demo-wheat" className="text-sm">Wheat</Label>
                <Input
                  id="demo-wheat"
                  type="number"
                  min="0"
                  max="100"
                  value={mashBill.wheat}
                  onChange={(e) => updateMashBill('wheat', parseInt(e.target.value) || 0)}
                  placeholder="0"
                />
              </div>
              <div>
                <Label htmlFor="demo-malt" className="text-sm">Malted Barley</Label>
                <Input
                  id="demo-malt"
                  type="number"
                  min="0"
                  max="100"
                  value={mashBill.maltedBarley}
                  onChange={(e) => updateMashBill('maltedBarley', parseInt(e.target.value) || 0)}
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="text-sm">
                Total: <span className={total === 100 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                  {total}%
                </span>
              </div>
              <div className="text-sm">
                Valid: <Badge variant={isValid ? 'default' : 'destructive'}>
                  {isValid ? 'Yes' : 'No'}
                </Badge>
              </div>
            </div>

            {detectedType && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="default" className="bg-blue-600">
                    Detected Type
                  </Badge>
                  <span className="font-medium text-blue-800">
                    {getWhiskeyTypeLabel(detectedType)}
                  </span>
                </div>
                <p className="text-sm text-blue-700">
                  {getWhiskeyTypeDescription(detectedType)}
                </p>
              </div>
            )}

            {!detectedType && isValid && (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="border-yellow-600 text-yellow-700">
                    No Detection
                  </Badge>
                </div>
                <p className="text-sm text-yellow-700">
                  This mash bill doesn&apos;t match any standard whiskey type classification.
                </p>
              </div>
            )}

            {!isValid && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="destructive">
                    Invalid Mash Bill
                  </Badge>
                </div>
                <p className="text-sm text-red-700">
                  Mash bill must total exactly 100% and all values must be non-negative.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 