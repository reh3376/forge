'use client'

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { scheduleOrderQueueAPI } from '@/lib/api/schedule-order-queue'

export default function ScheduleApiTestPage() {
  const [results, setResults] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [scheduleOrderId, setScheduleOrderId] = useState('')
  const [queueItemId, setQueueItemId] = useState('')
  const [queueIndex, setQueueIndex] = useState('')

  const addToResults = (message: string) => {
    setResults(prev => `${prev}\n[${new Date().toLocaleTimeString()}] ${message}`)
  }

  const testAddToQueue = async () => {
    if (!scheduleOrderId) {
      addToResults('❌ Please enter a Schedule Order ID')
      return
    }

    setLoading(true)
    addToResults(`🔄 Adding schedule order ${scheduleOrderId} to queue...`)
    
    try {
      const result = await scheduleOrderQueueAPI.scheduleProductionOrder(
        scheduleOrderId,
        'test-user',
        queueIndex ? parseInt(queueIndex) : undefined
      )
      
      if (result.error) {
        addToResults(`❌ Error: ${result.error}`)
      } else {
        addToResults(`✅ Success: Added to queue with ID ${result.data?.id}`)
        addToResults(`📊 Queue Index: ${result.data?.queueIndex}`)
      }
    } catch (error) {
      addToResults(`❌ Exception: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  const testMoveUp = async () => {
    if (!queueItemId) {
      addToResults('❌ Please enter a Queue Item ID')
      return
    }

    setLoading(true)
    addToResults(`🔄 Moving queue item ${queueItemId} up...`)
    
    try {
      const currentIndex = queueIndex ? parseInt(queueIndex) : 1
      const result = await scheduleOrderQueueAPI.moveUp(
        queueItemId,
        currentIndex,
        'test-user'
      )
      
      if (result.error) {
        addToResults(`❌ Error: ${result.error}`)
      } else {
        addToResults(`✅ Success: Moved up to index ${result.data?.queueIndex}`)
      }
    } catch (error) {
      addToResults(`❌ Exception: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  const testMoveDown = async () => {
    if (!queueItemId) {
      addToResults('❌ Please enter a Queue Item ID')
      return
    }

    setLoading(true)
    addToResults(`🔄 Moving queue item ${queueItemId} down...`)
    
    try {
      const currentIndex = queueIndex ? parseInt(queueIndex) : 0
      const result = await scheduleOrderQueueAPI.moveDown(
        queueItemId,
        currentIndex,
        10, // max index
        'test-user'
      )
      
      if (result.error) {
        addToResults(`❌ Error: ${result.error}`)
      } else {
        addToResults(`✅ Success: Moved down to index ${result.data?.queueIndex}`)
      }
    } catch (error) {
      addToResults(`❌ Exception: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  const testDeschedule = async () => {
    if (!queueItemId) {
      addToResults('❌ Please enter a Queue Item ID')
      return
    }

    setLoading(true)
    addToResults(`🔄 Descheduling queue item ${queueItemId}...`)
    
    try {
      const result = await scheduleOrderQueueAPI.descheduleOrder(
        queueItemId,
        'test-user'
      )
      
      if (result.error) {
        addToResults(`❌ Error: ${result.error}`)
      } else {
        addToResults(`✅ Success: Descheduled item ${queueItemId}`)
      }
    } catch (error) {
      addToResults(`❌ Exception: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  const clearResults = () => {
    setResults('')
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Schedule Order Queue API Test</h1>
        <p className="text-muted-foreground mt-2">
          Test the schedule order queue API endpoints via REST proxy for move up/down and scheduling operations.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Test Controls */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Test Parameters</CardTitle>
              <CardDescription>
                Enter IDs and parameters for testing the API endpoints
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="schedule-order-id">Schedule Order ID</Label>
                <Input
                  id="schedule-order-id"
                  value={scheduleOrderId}
                  onChange={(e) => setScheduleOrderId(e.target.value)}
                  placeholder="e.g., 123e4567-e89b-12d3-a456-426614174000"
                />
              </div>
              
              <div>
                <Label htmlFor="queue-item-id">Queue Item ID</Label>
                <Input
                  id="queue-item-id"
                  value={queueItemId}
                  onChange={(e) => setQueueItemId(e.target.value)}
                  placeholder="e.g., 987fcdeb-51a2-43d7-8f9e-123456789abc"
                />
              </div>
              
              <div>
                <Label htmlFor="queue-index">Queue Index (optional)</Label>
                <Input
                  id="queue-index"
                  type="number"
                  value={queueIndex}
                  onChange={(e) => setQueueIndex(e.target.value)}
                  placeholder="e.g., 0, 1, 2..."
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>API Tests</CardTitle>
              <CardDescription>
                Test different schedule order queue operations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button 
                onClick={testAddToQueue} 
                disabled={loading}
                className="w-full"
              >
                Add to Queue
              </Button>
              
              <Button 
                onClick={testMoveUp} 
                disabled={loading}
                variant="outline"
                className="w-full"
              >
                Move Up
              </Button>
              
              <Button 
                onClick={testMoveDown} 
                disabled={loading}
                variant="outline"
                className="w-full"
              >
                Move Down
              </Button>
              
              <Button 
                onClick={testDeschedule} 
                disabled={loading}
                variant="destructive"
                className="w-full"
              >
                Deschedule
              </Button>

              <Button
                onClick={async () => {
                  if (!queueItemId) {
                    addToResults('❌ Queue Item ID is required for move up test')
                    return
                  }
                  
                  addToResults('🔄 Testing move up operation...')
                  try {
                    const result = await scheduleOrderQueueAPI.moveUp(queueItemId, 1, 'test-user')
                    if (result.error) {
                      addToResults(`❌ Move up failed: ${result.error}`)
                    } else {
                      addToResults(`✅ Move up successful: ${JSON.stringify(result.data, null, 2)}`)
                    }
                  } catch (error) {
                    addToResults(`❌ Move up error: ${error}`)
                  }
                }}
                className="w-full"
              >
                Test Move Up (Fixed)
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Results */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Test Results</CardTitle>
              <CardDescription>
                API call results and responses
              </CardDescription>
            </div>
            <Button onClick={clearResults} variant="outline" size="sm">
              Clear
            </Button>
          </CardHeader>
          <CardContent>
            <Textarea
              value={results}
              readOnly
              className="min-h-[400px] font-mono text-sm"
              placeholder="Test results will appear here..."
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
} 