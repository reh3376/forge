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
        <h1 className="text-3xl font-bold">Schedule API Test</h1>
        <p className="text-muted-foreground mt-2">
          Test scheduling API endpoints and functionality for production order queue operations.
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
                disabled={loading || !scheduleOrderId}
                className="w-full"
              >
                {loading ? 'Testing...' : 'Add to Queue'}
              </Button>
              
              <Button 
                onClick={testMoveUp} 
                disabled={loading || !queueItemId}
                variant="outline"
                className="w-full"
              >
                {loading ? 'Testing...' : 'Move Up'}
              </Button>
              
              <Button 
                onClick={testMoveDown} 
                disabled={loading || !queueItemId}
                variant="outline"
                className="w-full"
              >
                {loading ? 'Testing...' : 'Move Down'}
              </Button>
              
              <Button 
                onClick={testDeschedule} 
                disabled={loading || !queueItemId}
                variant="destructive"
                className="w-full"
              >
                {loading ? 'Testing...' : 'Deschedule'}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Results */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Test Results</CardTitle>
                <CardDescription>
                  API response logs and status messages
                </CardDescription>
              </div>
              <Button onClick={clearResults} variant="outline" size="sm">
                Clear
              </Button>
            </div>
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

      {/* API Documentation */}
      <Card>
        <CardHeader>
          <CardTitle>API Endpoints</CardTitle>
          <CardDescription>
            Available schedule order queue API endpoints
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h4 className="font-semibold">Schedule Order</h4>
                <code className="text-sm bg-muted p-2 rounded block">
                  POST /api/schedule-order-queue/schedule
                </code>
                <p className="text-sm text-muted-foreground">
                  Add a schedule order to the production queue
                </p>
              </div>
              
              <div className="space-y-2">
                <h4 className="font-semibold">Move Up</h4>
                <code className="text-sm bg-muted p-2 rounded block">
                  PUT /api/schedule-order-queue/move-up
                </code>
                <p className="text-sm text-muted-foreground">
                  Move a queue item up in priority
                </p>
              </div>
              
              <div className="space-y-2">
                <h4 className="font-semibold">Move Down</h4>
                <code className="text-sm bg-muted p-2 rounded block">
                  PUT /api/schedule-order-queue/move-down
                </code>
                <p className="text-sm text-muted-foreground">
                  Move a queue item down in priority
                </p>
              </div>
              
              <div className="space-y-2">
                <h4 className="font-semibold">Deschedule</h4>
                <code className="text-sm bg-muted p-2 rounded block">
                  DELETE /api/schedule-order-queue/deschedule
                </code>
                <p className="text-sm text-muted-foreground">
                  Remove an item from the production queue
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 