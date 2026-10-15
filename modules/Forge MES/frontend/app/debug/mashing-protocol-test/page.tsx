'use client'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

import React, { useState } from 'react'
import { MashingProtocolEditor, MashingStep } from '@/components/ui/recipe-components'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

// Mock data that simulates mashing protocol steps with BOM items including itemNumber
const initialMockMashingSteps: MashingStep[] = [
  {
    id: '1',
    index: 1,
    stepType: 'LiquidAdd',
    included: true,
    waterQuantity: 1000,
    heatTempSp: 150,
    timeDuration: 30,
    notes: 'Initial water addition',
    recipeBomItems: [
      {
        id: 'bom1',
        item: {
          id: 'item1',
          itemName: 'Distilled Water',
          itemNumber: 'WTR-001',
          itemType: 'Liquid',
          itemClass: 'Water',
          itemGroup: 'Liquids'
        },
        quantity: 1000,
        displayUnits: {
          id: 'gal',
          name: 'gallons'
        },
        operation: 'Add'
      }
    ]
  },
  {
    id: '2',
    index: 2,
    stepType: 'Corn',
    included: true,
    itemQuantity: 750,
    notes: 'Add corn meal',
    recipeBomItems: [
      {
        id: 'bom2',
        item: {
          id: 'item2',
          itemName: 'Corn Meal',
          itemNumber: 'GRN-075',
          itemType: 'Grain',
          itemClass: 'Corn',
          itemGroup: 'Grains'
        },
        quantity: 750,
        displayUnits: {
          id: 'lbs',
          name: 'pounds'
        },
        operation: 'Add'
      }
    ]
  },
  {
    id: '3',
    index: 3,
    stepType: 'Hold',
    holdType: 'Heat',
    heatTempSp: 180,
    timeDuration: 60,
    included: true,
    notes: 'Heat to conversion temperature',
    recipeBomItems: []
  },
  {
    id: '4',
    index: 4,
    stepType: 'Rye',
    included: true,
    itemQuantity: 210,
    notes: 'Add rye grain',
    recipeBomItems: [
      {
        id: 'bom4',
        item: {
          id: 'item4',
          itemName: 'Rye Grain',
          itemNumber: 'GRN-021',
          itemType: 'Grain',
          itemClass: 'Rye',
          itemGroup: 'Grains'
        },
        quantity: 210,
        displayUnits: {
          id: 'lbs',
          name: 'pounds'
        },
        operation: 'Add'
      }
    ]
  },
  {
    id: '5',
    index: 5,
    stepType: 'Hold',
    holdType: 'Cool',
    coolTempSp: 150,
    timeDuration: 45,
    included: true,
    notes: 'Cool for enzyme addition',
    recipeBomItems: []
  }
]

export default function MashingProtocolTestPage() {
  const [mashingSteps, setMashingSteps] = useState<MashingStep[]>(initialMockMashingSteps)
  const [isEditing, setIsEditing] = useState(true)

  const handleStepsChange = (newSteps: MashingStep[]) => {
    console.log('🔄 Steps updated:', newSteps)
    setMashingSteps(newSteps)
  }

  const resetSteps = () => {
    setMashingSteps(initialMockMashingSteps)
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold">Mashing Protocol Test</h1>
          <p className="text-muted-foreground">
            Test the mashing protocol editor with move up/down and insert position functionality.
          </p>
        </div>

        <div className="flex gap-2">
          <Button 
            variant={isEditing ? "default" : "outline"} 
            onClick={() => setIsEditing(!isEditing)}
          >
            {isEditing ? "Exit Edit Mode" : "Enter Edit Mode"}
          </Button>
          <Button variant="outline" onClick={resetSteps}>
            Reset to Default Steps
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Mashing Protocol Editor</CardTitle>
                <CardDescription>
                  {isEditing 
                    ? "Edit mode: Use the move up/down buttons, insert buttons, or specify insert position when adding new steps."
                    : "View mode: Steps are displayed read-only."
                  }
                </CardDescription>
              </CardHeader>
              <CardContent>
                <MashingProtocolEditor
                  steps={mashingSteps}
                  onStepsChange={handleStepsChange}
                  isEditing={isEditing}
                />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>New Features</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Badge variant="outline">Move Up/Down</Badge>
                  <p className="text-sm text-muted-foreground">
                    Use the chevron buttons to reorder steps within the protocol.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Badge variant="outline">Insert Position</Badge>
                  <p className="text-sm text-muted-foreground">
                    When adding a new step, specify the position number to insert it at that location.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Badge variant="outline">Quick Insert</Badge>
                  <p className="text-sm text-muted-foreground">
                    Use the + button next to each step to quickly insert a new step before it.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Badge variant="outline">Auto-Renumbering</Badge>
                  <p className="text-sm text-muted-foreground">
                    Step numbers are automatically updated when steps are moved or inserted.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Current Steps</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {mashingSteps.map((step) => (
                    <div key={step.id} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                      <span className="text-sm font-medium">
                        {step.index}. {step.stepType}
                      </span>
                      <Badge variant={step.included ? "default" : "secondary"} className="text-xs">
                        {step.included ? "Included" : "Excluded"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
} 